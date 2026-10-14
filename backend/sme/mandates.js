// ============================================================
// OneGate SME — Spending mandates: bounded autonomy for the agent
// The owner can sign (with a one-time code) a mandate that lets the agent
// pay ONE verified beneficiary on its own, inside hard bounds:
//   * per-payment ceiling and monthly cap (both below the platform limits)
//   * expiry date (max 90 days) and instant revocation (kill switch)
//   * only to settle an open bill from that beneficiary that is due soon
//   * never if the payment would push forecast cash below the safety buffer
// Anything outside the mandate falls back to a normal approval card.
// Think of it as a programmable "agent wallet" with a spending policy,
// enforced by code rather than by the language model.
// ============================================================
const crypto = require('crypto');
const policy = require('./policy');
const audit = require('./auditChain');
const stepup = require('./stepup');
const actions = require('./actions');
const { getTenant, DAY } = require('./data/sandbox');

const HARD = { max_per_payment: 200000, monthly_cap: 500000, max_days: 90, due_within_days: 3 };
const mandates = new Map(); // id -> mandate

const toMs = (d) => Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`);
const month = (d) => String(d).slice(0, 7);

function list(tenantId) {
  const now = Date.now();
  return [...mandates.values()].filter((m) => m.tenant_id === tenantId).map((m) => {
    if (m.status === 'active' && Date.parse(m.valid_until) < now) m.status = 'expired';
    return m;
  });
}

function validate(tenant, p) {
  const errs = [];
  const ben = tenant.beneficiaries.find((b) => b.id === p.beneficiary_id);
  if (!ben) errs.push('beneficiary_not_on_verified_allowlist');
  else if (!ben.verified) errs.push('beneficiary_unverified');
  const per = Number(p.max_per_payment); const cap = Number(p.monthly_cap); const days = Number(p.valid_days);
  if (!(per > 0) || per > HARD.max_per_payment) errs.push(`max_per_payment_must_be_1_to_${HARD.max_per_payment}`);
  if (!(cap > 0) || cap > HARD.monthly_cap) errs.push(`monthly_cap_must_be_1_to_${HARD.monthly_cap}`);
  if (per > cap) errs.push('max_per_payment_above_monthly_cap');
  if (!(days >= 1 && days <= HARD.max_days)) errs.push(`valid_days_must_be_1_to_${HARD.max_days}`);
  return { errs, ben };
}

/** Step 1: owner asks for a code bound to this exact mandate request. */
function requestCreate({ tenantId, actor, params }) {
  const v = policy.evaluate('create_mandate', { sme_role: actor.sme_role });
  if (v.decision === 'deny') return { error: 'policy_denied', reasons: v.reasons, status: 403 };
  const { errs } = validate(getTenant(tenantId), params);
  if (errs.length) return { error: 'invalid_mandate', reasons: errs, status: 400 };
  return { challenge: stepup.issue({ tenantId, actor, purpose: 'create_mandate', ref: `mandate:${params.beneficiary_id}`, amount: Number(params.monthly_cap) }) };
}

/** Step 2: owner submits the same request with the code. */
function create({ tenantId, actor, params, otp }) {
  const v = policy.evaluate('create_mandate', { sme_role: actor.sme_role });
  if (v.decision === 'deny') return { error: 'policy_denied', reasons: v.reasons, status: 403 };
  const tenant = getTenant(tenantId);
  const { errs, ben } = validate(tenant, params);
  if (errs.length) return { error: 'invalid_mandate', reasons: errs, status: 400 };
  if (actions.stepUpEnabled()) {
    const s = stepup.verify({ tenantId, actor, challengeId: otp?.challenge_id, code: otp?.code, purpose: 'create_mandate', ref: `mandate:${params.beneficiary_id}`, amount: Number(params.monthly_cap) });
    if (!s.ok) return { error: s.error, status: 401 };
  }
  const m = {
    id: 'mdt_' + crypto.randomBytes(5).toString('hex'), tenant_id: tenantId, status: 'active',
    beneficiary_id: ben.id, beneficiary_name: ben.name, account_masked: ben.account_masked,
    max_per_payment: Number(params.max_per_payment), monthly_cap: Number(params.monthly_cap),
    purpose: String(params.purpose || 'recurring supplier bills').slice(0, 80),
    valid_until: new Date(Date.now() + Number(params.valid_days) * DAY).toISOString(),
    created_by: actor.id, created_at: new Date().toISOString(), spent: {}, payments: [],
  };
  mandates.set(m.id, m);
  audit.append(tenantId, { actor, action: 'mandate.created', tier: 'EXECUTE', decision: 'approved', target: m.id, metadata: { beneficiary_id: m.beneficiary_id, max_per_payment: m.max_per_payment, monthly_cap: m.monthly_cap, valid_until: m.valid_until } });
  return { mandate: m };
}

function revoke({ tenantId, actor, mandateId }) {
  const v = policy.evaluate('revoke_mandate', { sme_role: actor.sme_role });
  if (v.decision === 'deny') return { error: 'policy_denied', reasons: v.reasons, status: 403 };
  const m = mandates.get(mandateId);
  if (!m || m.tenant_id !== tenantId) return { error: 'not_found', status: 404 };
  m.status = 'revoked'; m.revoked_at = new Date().toISOString();
  audit.append(tenantId, { actor, action: 'mandate.revoked', tier: 'EXECUTE', decision: 'revoked', target: m.id });
  return { mandate: m };
}

/**
 * Decide whether the agent may pay `bill` on its own. Returns
 * { outcome: 'paid'|'escalate'|'skip', reasons[], action? }.
 */
function tryPayBill({ tenantId, agentActor, bill }) {
  const tenant = getTenant(tenantId);
  const asOf = toMs(tenant.profile.as_of);
  const m = list(tenantId).find((x) => x.status === 'active' && x.beneficiary_name === bill.supplier);
  if (!m) return { outcome: 'skip', reasons: ['no_active_mandate_for_beneficiary'] };
  const reasons = [];
  const daysToDue = Math.round((toMs(bill.due) - asOf) / DAY);
  if (daysToDue > HARD.due_within_days) return { outcome: 'skip', reasons: [`not_due_yet_${daysToDue}d`], mandate_id: m.id };
  if (bill.amount > m.max_per_payment) reasons.push(`amount_above_mandate_per_payment_${m.max_per_payment}`);
  const spent = m.spent[month(tenant.profile.as_of)] || 0;
  if (spent + bill.amount > m.monthly_cap) reasons.push(`monthly_cap_${m.monthly_cap}_would_be_exceeded`);
  const after = actions.forecastAfterPayment(tenant, bill.amount, bill.id);
  if (after.breach) reasons.push(`would_push_cash_below_buffer_on_${after.date}`);
  if (reasons.length) {
    audit.append(tenantId, { actor: agentActor, action: 'mandate.escalated', tier: 'EXECUTE', decision: 'escalate_to_owner', target: m.id, metadata: { bill_id: bill.id, reasons } });
    return { outcome: 'escalate', reasons, mandate_id: m.id };
  }
  const r = actions.executeUnderMandate({ tenantId, actor: agentActor, type: 'schedule_payment', params: { amount: bill.amount, beneficiary_id: m.beneficiary_id, bill_id: bill.id, date: bill.due }, mandate: m });
  if (r.blocked) return { outcome: 'escalate', reasons: r.reasons, mandate_id: m.id };
  m.spent[month(tenant.profile.as_of)] = spent + bill.amount;
  m.payments.push({ action_id: r.action.id, bill_id: bill.id, amount: bill.amount, at: r.action.decided_at });
  return { outcome: 'paid', reasons: [], mandate_id: m.id, action: r.action };
}

function resetForTests() { mandates.clear(); }

module.exports = { HARD, list, requestCreate, create, revoke, tryPayBill, resetForTests };
