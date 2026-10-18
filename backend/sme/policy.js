// ============================================================
// OneGate SME — Permission tiers & policy engine
// READ    : agent may do it on its own (view data, forecasts)
// SUGGEST : agent may prepare drafts/recommendations, nothing leaves the sandbox
// EXECUTE : moves money or contacts third parties. ALWAYS requires an
//           explicit approval by the SME owner, plus hard limits.
// DENY    : never available to the agent (e.g. editing beneficiaries).
// ============================================================
const TIERS = { READ: 'READ', SUGGEST: 'SUGGEST', EXECUTE: 'EXECUTE', DENY: 'DENY' };

const ACTIONS = {
  view_overview: TIERS.READ,
  view_forecast: TIERS.READ,
  view_receivables: TIERS.READ,
  view_financing: TIERS.READ,
  view_gst: TIERS.READ,
  view_discounts: TIERS.READ,
  draft_reminder: TIERS.SUGGEST,
  recommend_financing: TIERS.SUGGEST,
  mark_dispute: TIERS.SUGGEST,        // owner or accountant flags an invoice/bill as disputed (stops chasing and paying)
  view_compliance: TIERS.READ,
  send_reminder: TIERS.EXECUTE,
  schedule_payment: TIERS.EXECUTE,
  submit_loan_application: TIERS.EXECUTE,
  create_mandate: TIERS.EXECUTE,      // owner delegates a bounded spending mandate (needs OTP step-up)
  revoke_mandate: TIERS.EXECUTE,      // owner kill switch for a mandate
  run_autopilot: TIERS.SUGGEST,       // monitoring run: reads, drafts, proposes; pays only under a mandate
  add_beneficiary: TIERS.DENY,
  change_bank_details: TIERS.DENY,
  disable_audit: TIERS.DENY,
};

const LIMITS = {
  per_payment_max: 500000,        // INR, per sandbox payment
  daily_payment_cap: 800000,      // INR, per tenant per day
  approval_ttl_ms: 24 * 3600 * 1000,
};

const ROLE_CAN = {
  owner: new Set([TIERS.READ, TIERS.SUGGEST, TIERS.EXECUTE]),
  accountant: new Set([TIERS.READ, TIERS.SUGGEST, TIERS.EXECUTE]), // may PROPOSE execute, never approve
  viewer: new Set([TIERS.READ]),
  // The autonomous agent identity (autopilot). It may READ, SUGGEST and PROPOSE
  // EXECUTE actions; it can never approve. Paying without a human click is only
  // possible inside an owner-signed mandate (see mandates.js).
  agent: new Set([TIERS.READ, TIERS.SUGGEST, TIERS.EXECUTE]),
};

// Actions whose approval needs a one-time code (step-up) on top of the session.
const STEP_UP_REQUIRED = new Set(['schedule_payment', 'submit_loan_application', 'create_mandate']);
// Owner-only actions even at proposal time.
const OWNER_ONLY = new Set(['create_mandate', 'revoke_mandate']);

/**
 * evaluate(action, ctx) -> { decision: 'allow'|'require_approval'|'deny', tier, reasons[] }
 * ctx: { sme_role, params, tenant, paidToday, forecastAfter }
 */
function evaluate(action, ctx = {}) {
  const tier = ACTIONS[action];
  if (!tier) return { decision: 'deny', tier: null, reasons: ['unknown_action'] };
  if (tier === TIERS.DENY) return { decision: 'deny', tier, reasons: ['action_never_delegated_to_agent'] };
  const role = ctx.sme_role;
  if (!role || !ROLE_CAN[role] || !ROLE_CAN[role].has(tier)) return { decision: 'deny', tier, reasons: [`role_${role || 'none'}_lacks_${tier}`] };
  if (tier !== TIERS.EXECUTE) return { decision: 'allow', tier, reasons: [] };
  if (OWNER_ONLY.has(action) && role !== 'owner') return { decision: 'deny', tier, reasons: ['owner_only'] };

  const reasons = [];
  const warnings = [];
  const p = ctx.params || {};
  if (action === 'schedule_payment') {
    const amount = Number(p.amount);
    if (!(amount > 0)) return { decision: 'deny', tier, reasons: ['invalid_amount'] };
    const ben = (ctx.tenant?.beneficiaries || []).find((b) => b.id === p.beneficiary_id);
    if (!ben) return { decision: 'deny', tier, reasons: ['beneficiary_not_on_verified_allowlist'] };
    if (!ben.verified) return { decision: 'deny', tier, reasons: ['beneficiary_unverified'] };
    if (amount > LIMITS.per_payment_max) return { decision: 'deny', tier, reasons: [`exceeds_per_payment_limit_${LIMITS.per_payment_max}`] };
    if ((ctx.paidToday || 0) + amount > LIMITS.daily_payment_cap) return { decision: 'deny', tier, reasons: [`exceeds_daily_cap_${LIMITS.daily_payment_cap}`] };
    const bill = p.bill_id ? (ctx.tenant?.payables || []).find((b) => b.id === p.bill_id) : null;
    if (p.bill_id && !bill) return { decision: 'deny', tier, reasons: ['bill_not_found'] };
    if (bill && bill.dispute) return { decision: 'deny', tier, reasons: ['bill_under_dispute'] };
    if (bill) {
      // A bill-backed payment must go to that bill's supplier, and all payments against one
      // bill (queued, approved or executed, this one included) can never exceed what it says.
      if (ben.name !== bill.supplier) return { decision: 'deny', tier, reasons: ['payee_does_not_match_bill_supplier'] };
      if (bill.status === 'paid') return { decision: 'deny', tier, reasons: ['bill_already_paid_or_scheduled'] };
      // After an early (discounted) payment executes, bill.amount is what settled it.
      const billed = Number(bill.amount);
      const committed = Number(ctx.committedToBill || 0);
      if (committed + amount > billed + 0.5) return { decision: 'deny', tier, reasons: [`exceeds_bill_open_amount_${Math.max(0, Math.round(billed - committed))}`] };
    }
    if (ctx.forecastAfter && ctx.forecastAfter.breach) warnings.push(`payment_pushes_cash_below_buffer_on_${ctx.forecastAfter.date}`);
  }
  if (action === 'submit_loan_application' && !p.product_id) return { decision: 'deny', tier, reasons: ['missing_product'] };
  if (action === 'submit_loan_application') {
    const lp = require('./data/sandbox').LOAN_PRODUCTS.find((x) => x.id === p.product_id);
    if (!lp) return { decision: 'deny', tier, reasons: ['missing_product'] };
    // RBI digital lending: money goes straight from the lender to the borrower, never through a third party's account.
    if (lp.disbursal_route && lp.disbursal_route !== 'direct_to_borrower_account') return { decision: 'deny', tier, reasons: ['pass_through_disbursal'] };
    if (!(Number(p.amount) > 0)) return { decision: 'deny', tier, reasons: ['invalid_amount'] };
    if (lp.type === 'invoice_financing' && ctx.tenant) {
      // TReDS-style discounting sells specific invoices: they must be this business's own open,
      // undisputed, not-yet-due invoices, and the amount can't exceed their face value.
      const fin = require('./financing');
      const pool = fin.discountableInvoices(ctx.tenant, { disbursalDays: lp.max_days_to_disburse });
      const ids = Array.isArray(p.invoice_ids) ? p.invoice_ids : [];
      if (!ids.length) return { decision: 'deny', tier, reasons: ['not_enough_discountable_invoices'] };
      if (new Set(ids).size !== ids.length || ids.some((id) => !pool.some((x) => x.invoice_id === id))) return { decision: 'deny', tier, reasons: ['invoice_not_discountable'] };
      const face = pool.filter((x) => ids.includes(x.invoice_id)).reduce((a, x) => a + x.face, 0);
      if (Number(p.amount) > face + 0.5) return { decision: 'deny', tier, reasons: ['discount_exceeds_invoice_value'] };
    }
  }
  if (action === 'send_reminder' && !p.invoice_id) return { decision: 'deny', tier, reasons: ['missing_invoice'] };
  if (action === 'send_reminder') {
    const inv = (ctx.tenant?.invoices || []).find((i) => i.id === p.invoice_id);
    if (inv && inv.dispute) return { decision: 'deny', tier, reasons: ['invoice_under_dispute'] };
  }
  reasons.push('execute_tier_requires_owner_approval');
  return { decision: 'require_approval', tier, reasons, warnings };
}

function canApprove(smeRole) { return smeRole === 'owner'; }

function needsStepUp(action) { return STEP_UP_REQUIRED.has(action); }

module.exports = { TIERS, ACTIONS, LIMITS, evaluate, canApprove, needsStepUp, STEP_UP_REQUIRED };
