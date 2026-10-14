// ============================================================
// OneGate SME — Action proposals, human approval, sandbox execution
// Flow: propose -> policy.evaluate -> (pending approval) -> owner
// approves with amount re-confirmation -> sandbox executor -> audit.
// ============================================================
const crypto = require('crypto');
const policy = require('./policy');
const audit = require('./auditChain');
const { getTenant, iso, round2, DAY } = require('./data/sandbox');
const { forecast } = require('./forecast');
const { draftReminder } = require('./receivables');
const stepup = require('./stepup');

const pending = new Map();   // id -> action
const byIdem = new Map();    // tenant:key -> id
const executed = [];         // sandbox ledger of executed actions

const newId = () => 'act_' + crypto.randomBytes(6).toString('hex');

function paidToday(tenantId) {
  const today = new Date().toISOString().slice(0, 10);
  return executed.filter((e) => e.tenant_id === tenantId && e.type === 'schedule_payment' && e.executed_at.slice(0, 10) === today)
    .reduce((a, e) => a + e.params.amount, 0);
}

function forecastAfterPayment(tenant, amount, billId) {
  const f = forecast(tenant, { horizon: 30 });
  // An open bill is already in the forecast as an outflow on its due date;
  // paying it does not reduce cash a second time.
  const known = billId && tenant.payables.some((b) => b.id === billId && b.status === 'open');
  const extra = known ? 0 : amount;
  const breach = f.series.find((p) => p.low - extra < f.safety_buffer);
  return breach ? { breach: true, date: breach.date } : { breach: false };
}

function summarize(type, params, tenant) {
  if (type === 'schedule_payment') {
    const ben = tenant.beneficiaries.find((b) => b.id === params.beneficiary_id);
    return `Pay ${tenant.profile.currency} ${Number(params.amount).toLocaleString('en-IN')} to ${ben ? `${ben.name} (${ben.account_masked})` : 'unknown'} on ${params.date || 'next business day'}`;
  }
  if (type === 'send_reminder') return `Email payment reminder for ${params.invoice_id}`;
  if (type === 'submit_loan_application') return `Submit sandbox loan application: ${params.product_id} for ${tenant.profile.currency} ${Number(params.amount || 0).toLocaleString('en-IN')}`;
  return type;
}

function propose({ tenantId, actor, type, params = {}, idempotencyKey, source = 'user' }) {
  const tenant = getTenant(tenantId);
  if (idempotencyKey && byIdem.has(`${tenantId}:${idempotencyKey}`)) {
    return { duplicate: true, action: pending.get(byIdem.get(`${tenantId}:${idempotencyKey}`)) };
  }
  const ctx = { sme_role: actor.sme_role, params, tenant, paidToday: paidToday(tenantId) };
  if (type === 'schedule_payment' && Number(params.amount) > 0) ctx.forecastAfter = forecastAfterPayment(tenant, Number(params.amount), params.bill_id);
  const verdict = policy.evaluate(type, ctx);
  const entry = audit.append(tenantId, { actor, action: `propose.${type}`, tier: verdict.tier, decision: verdict.decision, target: params.invoice_id || params.beneficiary_id || params.product_id || null, metadata: { source, reasons: verdict.reasons, warnings: verdict.warnings || [], amount: params.amount || null } });
  if (verdict.decision === 'deny') return { denied: true, verdict, audit_seq: entry.seq };

  const action = {
    id: newId(), tenant_id: tenantId, type, params, tier: verdict.tier, status: 'pending_approval',
    summary: summarize(type, params, tenant), warnings: verdict.warnings || [],
    proposed_by: { id: actor.id, sme_role: actor.sme_role, source },
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + policy.LIMITS.approval_ttl_ms).toISOString(),
    preview: type === 'send_reminder' ? draftReminder(tenant, params.invoice_id) : undefined,
    needs_step_up: stepUpEnabled() && policy.needsStepUp(type),
  };
  pending.set(action.id, action);
  if (idempotencyKey) byIdem.set(`${tenantId}:${idempotencyKey}`, action.id);
  return { action, verdict, audit_seq: entry.seq };
}

function list(tenantId) {
  return [...pending.values()].filter((a) => a.tenant_id === tenantId).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function stepUpEnabled() { return process.env.SME_STEPUP !== 'off'; }

function decide({ tenantId, actor, actionId, approve, confirmAmount, reason, otp }) {
  const a = pending.get(actionId);
  if (!a || a.tenant_id !== tenantId) return { error: 'not_found', status: 404 };
  if (a.status !== 'pending_approval') return { error: `already_${a.status}`, status: 409 };
  if (Date.parse(a.expires_at) < Date.now()) { a.status = 'expired'; return { error: 'expired', status: 409 }; }
  if (!policy.canApprove(actor.sme_role)) {
    audit.append(tenantId, { actor, action: `approve_denied.${a.type}`, tier: a.tier, decision: 'deny', target: a.id, metadata: { reason: 'only_owner_can_approve' } });
    return { error: 'only_owner_can_approve', status: 403 };
  }
  if (!approve) {
    a.status = 'rejected'; a.decided_by = actor.id; a.decided_at = new Date().toISOString();
    audit.append(tenantId, { actor, action: `reject.${a.type}`, tier: a.tier, decision: 'rejected', target: a.id, metadata: { reason: reason || null } });
    return { action: a };
  }
  if (a.type === 'schedule_payment' && Number(confirmAmount) !== Number(a.params.amount)) {
    audit.append(tenantId, { actor, action: `approve_mismatch.${a.type}`, tier: a.tier, decision: 'deny', target: a.id, metadata: { reason: 'confirm_amount_mismatch' } });
    return { error: 'confirm_amount_mismatch', status: 400 };
  }
  // Step-up: a one-time code bound to this exact action and amount.
  if (stepUpEnabled() && policy.needsStepUp(a.type)) {
    const v = stepup.verify({ tenantId, actor, challengeId: otp?.challenge_id, code: otp?.code, purpose: `approve.${a.type}`, ref: a.id, amount: a.params.amount ?? null });
    if (!v.ok) return { error: v.error, status: 401 };
  }
  // Re-check policy at execution time (limits may have changed since proposal).
  const tenant = getTenant(tenantId);
  const recheck = policy.evaluate(a.type, { sme_role: actor.sme_role, params: a.params, tenant, paidToday: paidToday(tenantId) });
  if (recheck.decision === 'deny') {
    a.status = 'blocked';
    audit.append(tenantId, { actor, action: `execute_blocked.${a.type}`, tier: a.tier, decision: 'deny', target: a.id, metadata: { reasons: recheck.reasons } });
    return { error: 'blocked_by_policy', reasons: recheck.reasons, status: 403 };
  }
  a.status = 'executed'; a.decided_by = actor.id; a.decided_at = new Date().toISOString();
  const receipt = execute(a, tenant);
  a.receipt = receipt;
  executed.push({ ...a, executed_at: a.decided_at });
  audit.append(tenantId, { actor, action: `execute.${a.type}`, tier: a.tier, decision: 'approved_and_executed', target: a.id, metadata: { receipt_ref: receipt.reference, amount: a.params.amount || null } });
  return { action: a };
}

// Sandbox executor: nothing leaves the sandbox. Produces receipts only.
function execute(a, tenant) {
  const ref = 'SBX-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  if (a.type === 'schedule_payment') {
    const bill = tenant.payables.find((b) => b.id === a.params.bill_id);
    if (bill) bill.status = 'scheduled';
    return { reference: ref, rail: 'sandbox-NEFT', scheduled_for: a.params.date || iso(Date.parse(tenant.profile.as_of) + DAY), amount: round2(Number(a.params.amount)) };
  }
  if (a.type === 'send_reminder') return { reference: ref, channel: 'sandbox-email', delivered: true, to: a.preview?.customer };
  if (a.type === 'submit_loan_application') {
    const { lenderShare } = require('./privacy');
    const share = lenderShare(tenant);
    return {
      reference: ref, lender_status: 'received_in_sandbox', consent_recorded: true,
      // Account-Aggregator-style consent artefact: purpose-bound, time-boxed, revocable.
      consent: { id: 'CNS-' + crypto.randomBytes(4).toString('hex').toUpperCase(), purpose: 'loan_underwriting', lender_product: a.params.product_id, data_scope: share.fields_shared, raw_ledger_shared: false, valid_days: 30, revocable: true },
      shared_with_lender: share,
    };
  }
  return { reference: ref };
}

/**
 * Autonomous execution under an owner-signed mandate (no per-transaction click).
 * Called only by mandates.js after every mandate check passed. Policy is still
 * evaluated (verified beneficiary, per-payment limit, daily cap), and the agent
 * may never touch DENY actions.
 */
function executeUnderMandate({ tenantId, actor, type, params, mandate }) {
  const tenant = getTenant(tenantId);
  const verdict = policy.evaluate(type, { sme_role: actor.sme_role, params, tenant, paidToday: paidToday(tenantId) });
  if (verdict.decision === 'deny') {
    audit.append(tenantId, { actor, action: `mandate_execute_blocked.${type}`, tier: verdict.tier, decision: 'deny', target: mandate.id, metadata: { reasons: verdict.reasons } });
    return { blocked: true, reasons: verdict.reasons };
  }
  const a = {
    id: newId(), tenant_id: tenantId, type, params, tier: verdict.tier, status: 'executed',
    summary: summarize(type, params, tenant) + ` (under mandate ${mandate.id})`, warnings: [],
    proposed_by: { id: actor.id, sme_role: actor.sme_role, source: 'autopilot' },
    created_at: new Date().toISOString(), decided_by: `mandate:${mandate.id}`, decided_at: new Date().toISOString(), mandate_id: mandate.id,
  };
  a.receipt = execute(a, tenant);
  pending.set(a.id, a);
  executed.push({ ...a, executed_at: a.decided_at });
  audit.append(tenantId, { actor, action: `execute_under_mandate.${type}`, tier: verdict.tier, decision: 'executed_within_mandate', target: a.id, metadata: { mandate_id: mandate.id, amount: params.amount, receipt_ref: a.receipt.reference } });
  return { action: a };
}

function get(tenantId, id) { const a = pending.get(id); return a && a.tenant_id === tenantId ? a : null; }

function resetForTests() { pending.clear(); byIdem.clear(); executed.length = 0; stepup.resetForTests(); }

module.exports = { propose, list, get, decide, executeUnderMandate, paidToday, forecastAfterPayment, stepUpEnabled, resetForTests, _executed: executed };
