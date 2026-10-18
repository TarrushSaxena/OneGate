// ============================================================
// OneGate SME — Treasury cockpit summary (READ only, no side effects)
// One call gives the dashboard everything it needs to open on what
// the agent already did, not on a chat box:
//   - the cash low point before and after the plan waiting for the owner
//   - the execution queue in three lanes: paid under a mandate,
//     waiting for the owner, blocked by policy (each with a why-not card)
//   - the guardrails strip: audit chain, firewall, autopilot state
// ============================================================
const { forecast } = require('./forecast');
const { receivables } = require('./receivables');
const { LOAN_PRODUCTS } = require('./data/sandbox');
const actions = require('./actions');
const audit = require('./auditChain');
const autopilot = require('./autopilot');
const discounting = require('./discounting');
const agent = require('./agent');
const { explain } = require('./explain');

const BLOCKED_LIMIT = 6;
const TITLES = {
  'copilot.blocked': 'Chat message tried to bypass controls',
  'copilot.phishing_warning': 'Payment request in chat looked like a scam',
  'propose.schedule_payment': 'Payment proposal refused',
  'propose.send_reminder': 'Reminder proposal refused',
  'propose.submit_loan_application': 'Loan application refused',
  'discount.declined': 'Early payment refused',
  'mandate.escalated': 'Autopilot payment escalated to you',
  'stepup.failed': 'Wrong approval code',
  cross_tenant_access_denied: 'Tried to open another business',
};

// The plan the runway shows = what is waiting for the owner PLUS what the
// owner already approved whose cash has not landed yet. An approved reminder
// or a submitted loan is "done or in progress", not gone: dropping it from
// the plan (v1.8 bug) made the projected low fall after every approval.
// Sandbox note: executing an action produces a receipt but does not post cash
// to the ledger, so the forecast itself never contains these inflows twice.
function inPlan(a) {
  if (a.mandate_id) return false;
  if (a.status === 'pending_approval') return true;
  return a.status === 'executed' && (a.type === 'send_reminder' || a.type === 'submit_loan_application');
}

function planFromPending(tenant, pend, all) {
  const acts = (all || pend).filter(inPlan);
  const open = new Set((tenant.invoices || []).filter((i) => i.status === 'open').map((i) => i.id));
  const chase = []; let remWaiting = 0; let remSent = 0;
  for (const a of acts.filter((x) => x.type === 'send_reminder')) {
    const id = a.params.invoice_id;
    if (!id || chase.includes(id) || (open.size && !open.has(id))) continue;
    chase.push(id);
    if (a.status === 'executed') remSent += 1; else remWaiting += 1;
  }
  // Every financing line in the plan (waiting or submitted), one per product, each with its
  // repayments netted by the simulation (instalments; for TReDS-style, the discounted receipts).
  const loans = acts.filter((a) => a.type === 'submit_loan_application');
  const byProduct = new Map();
  for (const a of loans) { const cur = byProduct.get(a.params.product_id); if (!cur || (a.status === 'executed' && cur.status !== 'executed')) byProduct.set(a.params.product_id, a); }
  const lines = [...byProduct.values()];
  const financing = lines.map((a) => ({ product_id: a.params.product_id, amount: Number(a.params.amount) || 0, ...(Array.isArray(a.params.invoice_ids) && a.params.invoice_ids.length ? { invoice_ids: a.params.invoice_ids } : {}) }));
  const borrow = financing.reduce((x, l) => x + l.amount, 0);
  const days = lines.length ? Math.min(...lines.map((a) => (LOAN_PRODUCTS.find((x) => x.id === a.params.product_id) || { max_days_to_disburse: 3 }).max_days_to_disburse)) : 3;
  const loanStatus = !lines.length ? null : (lines.some((a) => a.status === 'pending_approval') ? 'waiting' : 'submitted');
  const sim = agent.simulate(tenant, { chase_invoice_ids: chase, financing, horizon_days: 45 });
  return {
    chase_invoice_ids: chase, borrow_amount: borrow, borrow_disbursal_days: days,
    reminders_waiting: remWaiting, reminders_sent: remSent,
    loan_status: loanStatus,
    loans_waiting: lines.filter((a) => a.status === 'pending_approval').length,
    financing_requested: financing,
    ...sim,
  };
}

function blockedLane(tenant, canSeeAudit) {
  const lane = [];
  // Held-back early-pay discounts: the agent chose not to act, and says why.
  for (const o of discounting.scan(tenant).offers.filter((x) => x.eligible_terms && !x.worth_it)) {
    lane.push({ kind: 'held_back', title: `Early payment to ${o.supplier} held back`, amount: o.pay_amount, why_not: o.why_not || [] });
  }
  // Untrusted invoice notes that tried to instruct the AI.
  for (const id of receivables(tenant).flagged_notes || []) {
    lane.push({ kind: 'injection', title: `Instruction hidden in invoice ${id} ignored`, why_not: explain(['prompt_injection']) });
  }
  // Recent policy denials from the audit chain (owners and accountants only).
  if (canSeeAudit) {
    const denies = audit.list(tenant.profile.id || tenant.id, 200).filter((e) => e.decision === 'deny' && !/^autopilot\.skipped/.test(e.action)).slice(-BLOCKED_LIMIT).reverse();
    for (const e of denies) {
      const m = e.metadata || {};
      const reasons = m.reasons && m.reasons.length ? m.reasons : [m.reason || m.category || m.code].filter(Boolean);
      lane.push({ kind: 'denied', seq: e.seq, ts: e.ts, title: TITLES[e.action] || e.action.replace(/^propose\./, 'Proposed ').replace(/[._]/g, ' '), actor_role: e.actor_role, amount: e.metadata && e.metadata.amount, why_not: explain(reasons.length ? reasons : ['blocked_by_policy'], { amount: e.metadata && Number(e.metadata.amount) }) });
    }
  }
  return lane;
}

function cockpit(tenant, sme) {
  const tid = sme.tenant_id;
  const f = forecast(tenant, { horizon: 90 });
  const all = actions.list(tid);
  const pend = all.filter((a) => a.status === 'pending_approval');
  const plan = planFromPending(tenant, pend, all);
  const ap = autopilot.status(tid);
  const canSeeAudit = sme.sme_role !== 'viewer';
  const firstBreach = f.series.slice(0, 45).find((p) => p.low < f.safety_buffer);
  const llm = agent.llmConfig();
  const v = canSeeAudit ? audit.verify(tid) : null;
  return {
    as_of: f.as_of,
    role: sme.sme_role,
    runway: {
      cash_today: Math.round(f.starting_balance),
      safety_buffer: f.safety_buffer,
      lowest_unmitigated: plan.lowest_before,
      first_breach: firstBreach ? firstBreach.date : null,
      plan: {
        reminders: plan.chase_invoice_ids.length,
        reminders_waiting: plan.reminders_waiting,
        reminders_sent: plan.reminders_sent,
        borrow_amount: plan.borrow_amount,
        loan_status: plan.loan_status,
        waiting: plan.reminders_waiting + plan.loans_waiting,
        financing_lines: plan.financing_lines,
        repayments_in_horizon: plan.repayments_in_horizon,
        discounted_invoices: plan.discounted_invoices,
        lowest_after: plan.lowest_after,
        still_breaches_on: plan.first_breach_after_plan,
        expected_inflows: plan.expected_inflows,
      },
    },
    lanes: {
      paid_by_mandate: all.filter((a) => a.status === 'executed' && a.mandate_id).slice(0, 6).map((a) => ({ id: a.id, summary: a.summary, mandate_id: a.mandate_id, receipt: a.receipt && a.receipt.reference })),
      waiting_for_owner: pend.map((a) => a.id),
      blocked: blockedLane(tenant, canSeeAudit),
    },
    autopilot: { paused: ap.paused, headline: ap.last_run ? ap.last_run.headline : null, last_run: ap.last_run ? ap.last_run.finished : null },
    guardrails: {
      audit: v ? { valid: v.valid, entries: v.entries, head: v.head ? v.head.slice(0, 12) : null, broken_at_seq: v.broken_at_seq || null } : null,
      numeric_firewall: 'armed',
      planner: llm.enabled ? 'llm_with_grounding_check' : 'deterministic',
      injection_guard: 'armed',
    },
  };
}

module.exports = { cockpit, planFromPending };
