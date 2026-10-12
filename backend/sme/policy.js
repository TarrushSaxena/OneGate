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
  draft_reminder: TIERS.SUGGEST,
  recommend_financing: TIERS.SUGGEST,
  send_reminder: TIERS.EXECUTE,
  schedule_payment: TIERS.EXECUTE,
  submit_loan_application: TIERS.EXECUTE,
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
};

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
    if (ctx.forecastAfter && ctx.forecastAfter.breach) warnings.push(`payment_pushes_cash_below_buffer_on_${ctx.forecastAfter.date}`);
  }
  if (action === 'submit_loan_application' && !p.product_id) return { decision: 'deny', tier, reasons: ['missing_product'] };
  if (action === 'send_reminder' && !p.invoice_id) return { decision: 'deny', tier, reasons: ['missing_invoice'] };
  reasons.push('execute_tier_requires_owner_approval');
  return { decision: 'require_approval', tier, reasons, warnings };
}

function canApprove(smeRole) { return smeRole === 'owner'; }

module.exports = { TIERS, ACTIONS, LIMITS, evaluate, canApprove };
