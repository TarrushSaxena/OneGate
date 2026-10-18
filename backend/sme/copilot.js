// ============================================================
// OneGate SME — Copilot: natural-language request -> guarded tool calls
// Deterministic intent router so every answer is grounded in sandbox
// data and reproducible. The agent can READ and SUGGEST on its own;
// EXECUTE requests become approval cards, never direct actions.
// ============================================================
const { getTenant } = require('./data/sandbox');
const { forecast } = require('./forecast');
const { receivables, draftReminder } = require('./receivables');
const { matchFinancing } = require('./financing');
const { detectInjection, detectPhishing, redactPII } = require('./guard');
const actions = require('./actions');
const audit = require('./auditChain');
const agent = require('./agent');
const discounting = require('./discounting');
const gst = require('./gst');
const { explain } = require('./explain');

const fmt = (n) => `${n < 0 ? '-' : ''}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;

function parseAmount(text) {
  const t = text.toLowerCase().replace(/,/g, '');
  let m = t.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(lakh|lakhs|lac|l|crore|cr|k)\b/);
  if (m) {
    const n = parseFloat(m[1]);
    const mult = { lakh: 1e5, lakhs: 1e5, lac: 1e5, l: 1e5, crore: 1e7, cr: 1e7, k: 1e3 }[m[2]];
    return Math.round(n * mult);
  }
  m = t.match(/(?:₹|rs\.?|inr)\s*(\d{4,})/) || t.match(/\b(\d{5,})\b/);
  return m ? parseInt(m[1], 10) : null;
}

function intentOf(text) {
  const t = text.toLowerCase();
  if (/\b(gst|gstr|itc|input tax credit|input credit|tax due|tax payment)\b/.test(t)) return 'gst';
  if (/\b(early[- ]pay\w*|pay early|discounts?|dynamic discounting)\b/.test(t)) return 'discount';
  if (/\bwhy (not|can'?t|didn'?t|was|did)\b|\bwhy (is|was) .*(blocked|denied|refused)/.test(t)) return 'why';
  if (/\b(plan|gap|shortfall|short on cash|cash crunch|cover (the|my)|survive|what should i do|get me through|fix my cash)\b/.test(t) && !/\b(loan|financ\w*|borrow|credit line|overdraft|working capital)\b/.test(t)) return 'plan';
  if (/\b(remind|reminder)\b|\b(send|draft|write)\b.*\bfollow[- ]?up\b/.test(t)) return 'remind';
  if (/\b(pay|payment|schedule)\b.*\b(bill|supplier|vendor)\b|\bpay\b.*\b(yarn|logistics|landlord)\b/.test(t)) return 'pay';
  if (/\b(loan|financ|credit line|overdraft|borrow|working capital)\b/.test(t)) return 'financing';
  if (/\b(overdue|chase|receivable|owes?|owed|unpaid|outstanding|debtor)\b/.test(t)) return 'receivables';
  if (/\b(cash|forecast|runway|balance|liquidity|next month|30|60|90)\b/.test(t)) return 'forecast';
  return 'overview';
}

function handle({ tenantId, actor, message }) {
  const tenant = getTenant(tenantId);
  const text = String(message || '').slice(0, 2000);

  const inj = detectInjection(text);
  if (inj.flagged) {
    const e = audit.append(tenantId, { actor, action: 'copilot.blocked', tier: null, decision: 'deny', target: null, metadata: { category: 'prompt_injection' } });
    return { intent: 'blocked', reply: 'I can’t follow instructions that try to bypass approvals or reveal secrets. Payments always need the owner’s approval in OneGate.', blocked: true, audit_seq: e.seq };
  }
  const phish = detectPhishing(text);
  const intent = intentOf(text);
  audit.append(tenantId, { actor, action: `copilot.${intent}`, tier: 'READ', decision: 'allow', target: null, metadata: { message_redacted: redactPII(text).slice(0, 200), phishing_score: phish.score } });

  const out = { intent, tools: [], cards: [] };
  if (phish.flagged) {
    // Social-engineering signals: never route to a money-moving tool.
    audit.append(tenantId, { actor, action: 'copilot.phishing_warning', tier: null, decision: 'deny', target: null, metadata: { reasons: phish.reasons, score: phish.score } });
    return {
      intent: 'phishing_warning', tools: [], cards: [], blocked: false,
      reply: 'This looks like a payment-redirection scam. I won’t change bank details or pay a new account from chat. Call the supplier on the number you already have on file to confirm, and only pay beneficiaries already verified in your bank.',
      security_notice: `Phishing signals: ${phish.reasons.join(', ')} (score ${phish.score}).`,
    };
  }

  if (intent === 'plan') {
    const p = agent.planCashGap({ tenantId, actor, horizonDays: 45 });
    return { intent: 'plan', planner: p.planner, reply: p.reply, steps: p.steps, cards: p.cards, tools: p.steps.map((s) => s.tool), data: { plan: p.result, gap: p.gap, breach_date: p.breach_date } };
  }
  if (intent === 'gst') {
    const c = gst.calendar(tenant); out.tools.push('gst_calendar');
    const n = c.next;
    out.reply = n
      ? `Next GST payment: ${fmt(n.net_cash_payable)} (GSTR-3B for ${n.period}) due ${n.due}. ` + c.advice.join(' ')
      : 'No GST payment falls in the forecast window.';
    out.data = { gst: c };
    return out;
  }
  if (intent === 'discount') {
    const s = discounting.scan(tenant); out.tools.push('find_early_pay_discounts');
    const take = s.offers.filter((o) => o.worth_it); const skip = s.offers.filter((o) => !o.worth_it && o.eligible_terms);
    const parts = [];
    if (take.length) parts.push(`Worth taking: ${take.map((o) => `${o.supplier} ${o.discount_pct}% off if paid by ${o.pay_by} (pay ${fmt(o.pay_amount)}, save ${fmt(o.discount_inr)}, ${o.annualised_return_pct}% a year)`).join('; ')}. Total saving ${fmt(s.total_savings)}.`);
    if (skip.length) parts.push(`Not worth it: ${skip.map((o) => `${o.supplier} (${o.why_not[0]?.title.toLowerCase()})`).join('; ')}.`);
    out.reply = parts.join(' ') || 'No supplier has offered an early-payment discount on your open bills.';
    if (take.length) out.reply += ' Each early payment needs your approval.';
    out.data = { discounts: s };
    out.why_not = skip.flatMap((o) => o.why_not);
    for (const o of take) if (actor.sme_role !== 'viewer') out.cards.push({ type: 'suggestion', label: `Pay ${o.supplier} early (saves ${fmt(o.discount_inr)})`, propose_discount: o.bill_id });
    return out;
  }
  if (intent === 'why') {
    // Explain the most recent refusal or escalation in this tenant's audit chain.
    const last = audit.list(tenantId).slice().reverse().find((e) => /deny|escalate|rejected/.test(e.decision || '') && (e.metadata?.reasons || e.metadata?.reason || e.metadata?.error || e.metadata?.category) && !/^copilot\.why/.test(e.action));
    if (!last) { out.reply = 'Nothing has been refused or held back recently.'; return out; }
    const codes = last.action === 'copilot.phishing_warning' ? ['phishing'] : (last.metadata.reasons || [last.metadata.reason || last.metadata.error || last.metadata.category]);
    const why = explain(codes, { amount: last.metadata.amount || null });
    const what = { 'copilot.blocked': 'a chat message', 'copilot.phishing_warning': 'a payment request in chat', 'discount.declined': 'an early payment', 'mandate.escalated': 'an autopilot payment', 'stepup.failed': 'an approval code', 'cross_tenant_access_denied': 'access to another business' }[last.action]
      || (last.action.startsWith('propose.') ? `a proposed ${last.action.slice(8).replace(/_/g, ' ')}` : last.action.startsWith('approve_') || last.action.startsWith('execute_blocked') ? `an approval (${last.action.split('.').pop().replace(/_/g, ' ')})` : last.action.replace(/[._]/g, ' '));
    out.reply = `The last thing I held back was ${what}. ` + why.map((w) => `${w.title}: ${w.detail} ${w.fix}`).join(' ');
    out.why_not = why;
    return out;
  }
  if (intent === 'forecast' || intent === 'overview') {
    const f = forecast(tenant); out.tools.push('forecast');
    const [h30, h60, h90] = f.horizons;
    out.reply = `Cash today is ${fmt(f.starting_balance)}. Expected in 30 days: ${fmt(h30.base)} (range ${fmt(h30.low)} to ${fmt(h30.high)}); 60 days: ${fmt(h60.base)}; 90 days: ${fmt(h90.base)}.`
      + (f.alerts.length ? ` Watch out: ${f.alerts[0].message}` : ' No buffer breach expected in the next 90 days.');
    out.data = { horizons: f.horizons, alerts: f.alerts, lowest_point: f.lowest_point };
  }
  if (intent === 'receivables' || intent === 'overview') {
    const r = receivables(tenant); out.tools.push('receivables');
    const top = r.top_overdue.slice(0, 3).map((x) => `${x.invoice} ${x.customer} ${fmt(x.amount)} (${x.days_overdue}d late, risk ${x.risk_score})`).join('; ');
    const line = `Overdue receivables total ${fmt(r.total_overdue)} of ${fmt(r.total_open)} open. Chase first: ${top}.`;
    out.reply = out.reply ? `${out.reply} ${line}` : line;
    if (r.flagged_notes.length) out.security_notice = `${out.security_notice ? out.security_notice + ' ' : ''}${r.flagged_notes.length} invoice note(s) contained instructions aimed at the AI and were ignored: ${r.flagged_notes.join(', ')}.`;
    out.data = { ...(out.data || {}), receivables: { total_overdue: r.total_overdue, ageing: r.ageing, top: r.top_overdue.slice(0, 5) } };
  }
  if (intent === 'remind') {
    const r = receivables(tenant); out.tools.push('receivables', 'draft_reminder');
    const named = text.match(/INV-[A-Z]{3}-\d{4}/i);
    const target = named ? named[0].toUpperCase() : r.top_overdue[0]?.invoice;
    const draft = target && draftReminder(tenant, target);
    if (!draft) { out.reply = 'I could not find that invoice.'; return out; }
    const p = actions.propose({ tenantId, actor, type: 'send_reminder', params: { invoice_id: target }, source: 'copilot' });
    out.reply = p.denied ? `I drafted the reminder for ${target}, but your role can’t queue it for sending.` : `I drafted a ${draft.tone} reminder for ${target} (${draft.customer}). It goes out only after the owner approves it.`;
    out.cards.push(p.denied ? { type: 'draft', draft } : { type: 'approval', action: p.action });
  }
  if (intent === 'financing') {
    const f = forecast(tenant); const r = receivables(tenant); out.tools.push('forecast', 'receivables', 'financing');
    const gap = Math.max(0, f.safety_buffer - f.lowest_point.low);
    const amount = parseAmount(text) || Math.max(100000, Math.ceil(gap / 50000) * 50000);
    const m = matchFinancing(tenant, { amount, urgency_days: /urgent|this week|asap/i.test(text) ? 7 : 30, receivables: r });
    const rec = m.options.find((o) => o.product_id === m.recommendation?.product_id);
    out.reply = rec
      ? (rec.tenure_months
        ? `For ${fmt(amount)}, the cheapest eligible option is ${rec.lender}: ${rec.apr_pct}% rate (${rec.all_in_apr_pct}% all-in APR), about ${fmt(rec.est_monthly_payment)}/month over ${rec.tenure_months} months, est. total cost ${fmt(rec.est_total_cost)}. ${m.options.filter((o) => o.eligible).length} options qualify. Applying needs your approval.`
        : `For ${fmt(amount)}, the cheapest eligible option is ${rec.lender}: sell not-yet-due invoices (${rec.invoices_to_discount.join(', ')}) at a ${rec.apr_pct}% rate (${rec.all_in_apr_pct}% all-in APR, about ${rec.tenor_days} days to due), est. cost ${fmt(rec.est_total_cost)}. Your buyers pay the financier on the due dates, so those receipts no longer come to you. ${m.options.filter((o) => o.eligible).length} options qualify. Applying needs your approval.`)
      : `None of the sandbox products fit ${fmt(amount)} right now: ${m.options[0].blockers.join('; ')}.`;
    out.data = { financing: m };
    if (rec) out.cards.push({ type: 'suggestion', label: 'Apply (needs owner approval)', propose: { type: 'submit_loan_application', params: { product_id: rec.product_id, amount } } });
  }
  if (intent === 'pay') {
    out.tools.push('payables');
    const bill = tenant.payables.find((b) => b.status === 'open' && text.toLowerCase().includes(b.supplier.toLowerCase().split(' ')[0])) || tenant.payables.find((b) => b.status === 'open');
    const ben = bill && tenant.beneficiaries.find((b) => b.name === bill.supplier);
    if (!bill || !ben) { out.reply = 'I can only pay bills to verified beneficiaries already on file.'; return out; }
    const p = actions.propose({ tenantId, actor, type: 'schedule_payment', params: { amount: bill.amount, beneficiary_id: ben.id, bill_id: bill.id, date: bill.due }, source: 'copilot' });
    if (p.denied) { out.reply = `I can’t schedule that payment: ${p.why_not.map((w) => w.title.toLowerCase()).join('; ')}.`; out.why_not = p.why_not; }
    else {
      out.reply = `Payment of ${fmt(bill.amount)} to ${ben.name} (${ben.account_masked}) for ${bill.due} is ready for owner approval.` + (p.action.warnings.length ? ` Heads up: ${p.action.why_warnings.map((w) => w.detail).join(' ')}` : '');
      out.cards.push({ type: 'approval', action: p.action });
    }
  }
  return out;
}

/**
 * respond(): async entry point used by the API.
 * Guards run first and are never delegated to a model. If an LLM is configured
 * the tool-calling agent plans the answer; any failure (timeout, bad JSON,
 * unknown tool, ungrounded number) falls back to the deterministic router.
 */
async function respond({ tenantId, actor, message }) {
  const text = String(message || '').slice(0, 2000);
  if (!agent.llmConfig().enabled || detectInjection(text).flagged || detectPhishing(text).flagged) return handle({ tenantId, actor, message: text });
  try {
    const r = await agent.runLLM({ tenantId, actor, message: text });
    return { intent: 'agent', ...r, tools: r.steps.map((s) => s.tool) };
  } catch (e) {
    audit.append(tenantId, { actor, action: 'agent.llm_fallback', tier: 'READ', decision: 'fallback', metadata: { reason: e.message, ungrounded: e.ungrounded || null } });
    const out = handle({ tenantId, actor, message: text });
    return { ...out, planner: out.planner || 'deterministic', fallback_reason: e.message };
  }
}

module.exports = { handle, respond, parseAmount, intentOf };
