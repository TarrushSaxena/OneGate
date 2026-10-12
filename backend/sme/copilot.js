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
      ? `For ${fmt(amount)}, the cheapest eligible option is ${rec.lender}: ${rec.apr_pct}% APR, about ${fmt(rec.est_monthly_payment)}/month over ${rec.tenure_months} months, est. total cost ${fmt(rec.est_total_cost)}. ${m.options.filter((o) => o.eligible).length} options qualify. Applying needs your approval.`
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
    if (p.denied) out.reply = `I can’t schedule that payment: ${p.verdict.reasons.join(', ')}.`;
    else {
      out.reply = `Payment of ${fmt(bill.amount)} to ${ben.name} (${ben.account_masked}) for ${bill.due} is ready for owner approval.` + (p.action.warnings.length ? ` Note: ${p.action.warnings.join('; ')}.` : '');
      out.cards.push({ type: 'approval', action: p.action });
    }
  }
  return out;
}

module.exports = { handle, parseAmount, intentOf };
