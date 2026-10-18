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
const { explain } = require('./explain');

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

// Everything already committed against one bill: payments waiting for approval, approved or
// executed (incl. under a mandate). Used to cap bill-backed payments at the bill's open amount.
function committedToBill(tenantId, billId, exceptId) {
  if (!billId) return 0;
  const seen = new Set();
  return [...pending.values(), ...executed]
    .filter((a) => a.tenant_id === tenantId && a.type === 'schedule_payment' && a.params.bill_id === billId && a.id !== exceptId && ['pending_approval', 'executed'].includes(a.status))
    .filter((a) => (seen.has(a.id) ? false : seen.add(a.id)))
    .reduce((s, a) => s + Number(a.params.amount || 0), 0);
}

const SPLIT_WINDOW_MS = 72 * 3600 * 1000;
function splitCheck(tenantId, tenant, params) {
  const billed = (p) => p.bill_id && tenant.payables.some((b) => b.id === p.bill_id);
  if (billed(params)) return null;
  const since = Date.now() - SPLIT_WINDOW_MS;
  const recent = [...pending.values(), ...executed]
    .filter((a) => a.tenant_id === tenantId && a.type === 'schedule_payment' && a.params.beneficiary_id === params.beneficiary_id && ['pending_approval', 'executed'].includes(a.status) && Date.parse(a.created_at) >= since && !billed(a.params));
  const ids = new Set(); const uniq = recent.filter((a) => (ids.has(a.id) ? false : ids.add(a.id)));
  const total = uniq.reduce((s, a) => s + Number(a.params.amount), 0) + Number(params.amount);
  if (uniq.length && total > policy.LIMITS.per_payment_max) return `possible_split_payment_${Math.round(total)}`;
  if (uniq.length >= 2) return 'too_many_unbilled_payments_to_one_payee';
  return null;
}

// TReDS-style discounting sells specific invoices. If the caller named none, pick not-yet-due
// invoices (furthest due first) whose face value covers the amount; policy then validates them.
function withDiscountInvoices(tenant, params) {
  const { LOAN_PRODUCTS } = require('./data/sandbox');
  const lp = LOAN_PRODUCTS.find((x) => x.id === params.product_id);
  if (!lp || lp.type !== 'invoice_financing' || (Array.isArray(params.invoice_ids) && params.invoice_ids.length)) return params;
  const pk = require('./financing').pickInvoices(tenant, Number(params.amount) || 0, { disbursalDays: lp.max_days_to_disburse });
  return pk.face >= Number(params.amount) ? { ...params, invoice_ids: pk.picked.map((x) => x.invoice_id) } : { ...params, invoice_ids: [] };
}

function kfsFor(tenant, params) {
  const { LOAN_PRODUCTS } = require('./data/sandbox');
  const lp = LOAN_PRODUCTS.find((x) => x.id === params.product_id);
  if (!lp) return undefined;
  const opts = {};
  if (lp.type === 'invoice_financing') {
    const pool = require('./financing').discountableInvoices(tenant, { disbursalDays: lp.max_days_to_disburse });
    opts.invoices = pool.filter((x) => (params.invoice_ids || []).includes(x.invoice_id));
  }
  return require('./india').keyFactsStatement(lp, Number(params.amount) || 0, undefined, opts);
}

function summarize(type, params, tenant) {
  if (type === 'schedule_payment') {
    const ben = tenant.beneficiaries.find((b) => b.id === params.beneficiary_id);
    const base = `Pay ${tenant.profile.currency} ${Number(params.amount).toLocaleString('en-IN')} to ${ben ? `${ben.name} (${ben.account_masked})` : 'unknown'} on ${params.date || 'next business day'}`;
    if (params.early_pay) return `${base} (early: saves ${tenant.profile.currency} ${Number(params.early_pay.discount_inr).toLocaleString('en-IN')}, ${params.early_pay.discount_pct}% discount, ${params.early_pay.annualised_return_pct}% a year)`;
    return base;
  }
  if (type === 'send_reminder') return `Email payment reminder for ${params.invoice_id}`;
  if (type === 'submit_loan_application') {
    if (Array.isArray(params.invoice_ids) && params.invoice_ids.length) return `Submit sandbox TReDS-style discounting: ${params.invoice_ids.length} invoice(s) (${params.invoice_ids.join(', ')}), face value ${tenant.profile.currency} ${Number(params.amount || 0).toLocaleString('en-IN')}`;
    return `Submit sandbox loan application: ${params.product_id} for ${tenant.profile.currency} ${Number(params.amount || 0).toLocaleString('en-IN')}`;
  }
  return type;
}

function propose({ tenantId, actor, type, params = {}, idempotencyKey, source = 'user' }) {
  const tenant = getTenant(tenantId);
  if (idempotencyKey && byIdem.has(`${tenantId}:${idempotencyKey}`)) {
    return { duplicate: true, action: pending.get(byIdem.get(`${tenantId}:${idempotencyKey}`)) };
  }
  if (type === 'submit_loan_application') params = withDiscountInvoices(tenant, params);
  const ctx = { sme_role: actor.sme_role, params, tenant, paidToday: paidToday(tenantId), committedToBill: type === 'schedule_payment' ? committedToBill(tenantId, params.bill_id) : 0 };
  if (type === 'schedule_payment' && Number(params.amount) > 0) ctx.forecastAfter = forecastAfterPayment(tenant, Number(params.amount), params.bill_id);
  let verdict = policy.evaluate(type, ctx);
  // Structuring check: payments to one payee that aren't tied to a real open bill
  // can't be split to slip under the single-payment limit.
  if (verdict.decision !== 'deny' && type === 'schedule_payment') {
    const split = splitCheck(tenantId, tenant, params);
    if (split) verdict = { decision: 'deny', tier: verdict.tier, reasons: [split] };
  }
  // An early payment must be exactly the bill minus the supplier's offered discount.
  if (verdict.decision !== 'deny' && type === 'schedule_payment' && params.early_pay && !require('./discounting').validEarlyPay(tenant, params)) {
    verdict = { decision: 'deny', tier: verdict.tier, reasons: ['discount_terms_mismatch'] };
  }
  const entry = audit.append(tenantId, { actor, action: `propose.${type}`, tier: verdict.tier, decision: verdict.decision, target: params.invoice_id || params.beneficiary_id || params.product_id || null, metadata: { source, reasons: verdict.reasons, warnings: verdict.warnings || [], amount: params.amount || null } });
  if (verdict.decision === 'deny') return { denied: true, verdict, why_not: explain(verdict.reasons, { amount: Number(params.amount) || null }), audit_seq: entry.seq };

  const action = {
    id: newId(), tenant_id: tenantId, type, params, tier: verdict.tier, status: 'pending_approval',
    summary: summarize(type, params, tenant), warnings: verdict.warnings || [],
    why_warnings: explain(verdict.warnings || [], { amount: Number(params.amount) || null }),
    proposed_by: { id: actor.id, sme_role: actor.sme_role, source },
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + policy.LIMITS.approval_ttl_ms).toISOString(),
    preview: type === 'send_reminder' ? draftReminder(tenant, params.invoice_id) : undefined,
    kfs: type === 'submit_loan_application' ? kfsFor(tenant, params) : undefined,
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

function decide({ tenantId, actor, actionId, approve, confirmAmount, reason, otp, kfsAck }) {
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
  // A loan needs the owner to have seen this exact Key Facts Statement (checked before the code is used).
  if (a.type === 'submit_loan_application' && a.kfs && kfsAck !== a.kfs.hash) {
    audit.append(tenantId, { actor, action: `approve_denied.${a.type}`, tier: a.tier, decision: 'deny', target: a.id, metadata: { reason: 'kfs_not_acknowledged' } });
    return { error: 'kfs_not_acknowledged', status: 400 };
  }
  // Step-up: a one-time code bound to this exact action and amount.
  if (stepUpEnabled() && policy.needsStepUp(a.type)) {
    const v = stepup.verify({ tenantId, actor, challengeId: otp?.challenge_id, code: otp?.code, purpose: `approve.${a.type}`, ref: a.id, amount: a.params.amount ?? null });
    if (!v.ok) return { error: v.error, status: 401 };
  }
  // Re-check policy at execution time (limits may have changed since proposal).
  const tenant = getTenant(tenantId);
  let recheck = policy.evaluate(a.type, { sme_role: actor.sme_role, params: a.params, tenant, paidToday: paidToday(tenantId), committedToBill: a.type === 'schedule_payment' ? committedToBill(tenantId, a.params.bill_id, a.id) : 0, recheckOfActionId: a.id });
  if (recheck.decision !== 'deny' && a.type === 'schedule_payment' && a.params.early_pay && !require('./discounting').validEarlyPay(tenant, a.params)) recheck = { decision: 'deny', reasons: ['discount_terms_mismatch'] };
  if (recheck.decision === 'deny') {
    a.status = 'blocked';
    audit.append(tenantId, { actor, action: `execute_blocked.${a.type}`, tier: a.tier, decision: 'deny', target: a.id, metadata: { reasons: recheck.reasons } });
    return { error: 'blocked_by_policy', reasons: recheck.reasons, why_not: explain(recheck.reasons), status: 403 };
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
    if (bill) {
      bill.status = 'scheduled';
      if (a.params.date) bill.scheduled_for = a.params.date;
      if (a.params.early_pay) { bill.original_amount = bill.amount; bill.amount = round2(Number(a.params.amount)); bill.discount_captured = a.params.early_pay.discount_inr; }
    }
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
      kfs_hash: a.kfs ? a.kfs.hash : null,
      cooling_off_until: a.kfs ? iso(Date.parse(tenant.profile.as_of) + a.kfs.cooling_off_days * DAY) : null,
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
  const verdict = policy.evaluate(type, { sme_role: actor.sme_role, params, tenant, paidToday: paidToday(tenantId), committedToBill: type === 'schedule_payment' ? committedToBill(tenantId, params.bill_id) : 0 });
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

/** Exit a loan inside its cooling-off period: no penalty, only interest for the days used (sandbox). */
function exitCoolingOff({ tenantId, actor, actionId }) {
  const a = pending.get(actionId);
  if (!a || a.tenant_id !== tenantId) return { error: 'not_found', status: 404 };
  if (!policy.canApprove(actor.sme_role)) return { error: 'only_owner_can_approve', status: 403 };
  if (a.type !== 'submit_loan_application' || a.status !== 'executed' || !a.receipt || !a.receipt.cooling_off_until) return { error: 'not_an_active_loan', status: 409 };
  const tenant = getTenant(tenantId);
  if (tenant.profile.as_of > a.receipt.cooling_off_until) {
    audit.append(tenantId, { actor, action: 'loan.cooling_off_exit', tier: 'EXECUTE', decision: 'deny', target: a.id, metadata: { reason: 'cooling_off_expired' } });
    return { error: 'cooling_off_expired', status: 409 };
  }
  const daysUsed = Math.max(0, Math.round((Date.parse(tenant.profile.as_of) - Date.parse(a.decided_at.slice(0, 10))) / DAY));
  const interest = round2((Number(a.params.amount) * (a.kfs ? a.kfs.interest_rate_pct : 0) / 100) * (daysUsed / 365));
  a.status = 'exited_in_cooling_off';
  a.cooling_off_exit = { at: new Date().toISOString(), days_used: daysUsed, repay_principal: Number(a.params.amount), interest_for_days_used: interest, penalty: 0 };
  audit.append(tenantId, { actor, action: 'loan.cooling_off_exit', tier: 'EXECUTE', decision: 'allow', target: a.id, metadata: { amount: Number(a.params.amount), interest } });
  return { action: a };
}

module.exports = { committedToBill, exitCoolingOff, propose, list, get, decide, executeUnderMandate, paidToday, forecastAfterPayment, stepUpEnabled, resetForTests, _executed: executed };
