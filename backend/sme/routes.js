// ============================================================
// OneGate SME — REST API (/api/sme). Auth is enforced upstream by
// the core `authenticate` middleware; this router adds tenant scope.
// ============================================================
const express = require('express');
const { getTenant } = require('./data/sandbox');
const { membershipFor } = require('./tenancy');
const { forecast, backtest } = require('./forecast');
const { receivables, draftReminder } = require('./receivables');
const { matchFinancing } = require('./financing');
const policy = require('./policy');
const actions = require('./actions');
const audit = require('./auditChain');
const copilot = require('./copilot');
const agent = require('./agent');
const autopilot = require('./autopilot');
const mandates = require('./mandates');
const stepup = require('./stepup');
const { lenderShare } = require('./privacy');
const discounting = require('./discounting');
const gst = require('./gst');
const { explain } = require('./explain');

// Every refusal carries a "why not" card: the rule, the limit and the fix.
const withWhy = (body) => ({ ...body, why_not: body.why_not || explain(body.reasons || [body.error]) });

const router = express.Router();

// Resolve membership; every tenant route checks it.
router.use((req, res, next) => {
  const m = membershipFor(req.user);
  if (!m) return res.status(403).json({ error: 'no_sme_membership' });
  req.sme = { tenant_id: m.tenant_id, sme_role: m.sme_role };
  req.smeActor = { ...req.user, sme_role: m.sme_role };
  next();
});

router.param('tid', (req, res, next, tid) => {
  if (tid !== req.sme.tenant_id) {
    audit.append(req.sme.tenant_id, { actor: req.smeActor, action: 'cross_tenant_access_denied', decision: 'deny', target: tid });
    return res.status(403).json({ error: 'tenant_forbidden' });
  }
  req.tenant = getTenant(tid);
  if (!req.tenant) return res.status(404).json({ error: 'tenant_not_found' });
  next();
});

function gate(action) {
  return (req, res, next) => {
    const v = policy.evaluate(action, { sme_role: req.sme.sme_role });
    if (v.decision === 'deny') return res.status(403).json(withWhy({ error: 'policy_denied', reasons: v.reasons }));
    next();
  };
}

router.get('/me', (req, res) => res.json({ ...req.sme, tenant_name: getTenant(req.sme.tenant_id)?.profile.name, tiers: policy.ACTIONS, limits: policy.LIMITS }));

router.get('/:tid/overview', gate('view_overview'), (req, res) => {
  const f = forecast(req.tenant); const r = receivables(req.tenant);
  audit.append(req.sme.tenant_id, { actor: req.smeActor, action: 'view.overview', tier: 'READ', decision: 'allow' });
  res.json({ profile: req.tenant.profile, forecast: { horizons: f.horizons, alerts: f.alerts, lowest_point: f.lowest_point }, receivables: { total_open: r.total_open, total_overdue: r.total_overdue, ageing: r.ageing }, payables: req.tenant.payables, beneficiaries: req.tenant.beneficiaries, pending_approvals: actions.list(req.sme.tenant_id).filter((a) => a.status === 'pending_approval').length });
});

router.get('/:tid/forecast', gate('view_forecast'), (req, res) => {
  const horizon = Math.min(90, Math.max(7, Number(req.query.horizon) || 90));
  audit.append(req.sme.tenant_id, { actor: req.smeActor, action: 'view.forecast', tier: 'READ', decision: 'allow', metadata: { horizon } });
  const f = forecast(req.tenant, { horizon });
  const cb = require('./calibrate').withCalibratedBand(req.tenant, f);
  res.json({ ...f, series: cb.series, calibration: cb.calibration, backtest: backtest(req.tenant) });
});

// What-if stress test: READ only, nothing stored or queued.
router.post('/:tid/whatif', gate('view_forecast'), (req, res) => res.json(require('./whatif').whatIf(req.tenant, req.body || {})));

router.get('/:tid/receivables', gate('view_receivables'), (req, res) => {
  audit.append(req.sme.tenant_id, { actor: req.smeActor, action: 'view.receivables', tier: 'READ', decision: 'allow' });
  res.json(receivables(req.tenant));
});

router.get('/:tid/receivables/:invoiceId/draft', gate('draft_reminder'), (req, res) => {
  const d = draftReminder(req.tenant, req.params.invoiceId);
  if (!d) return res.status(404).json({ error: 'invoice_not_found' });
  audit.append(req.sme.tenant_id, { actor: req.smeActor, action: 'suggest.draft_reminder', tier: 'SUGGEST', decision: 'allow', target: req.params.invoiceId });
  res.json(d);
});

router.post('/:tid/financing/match', gate('recommend_financing'), (req, res) => {
  const m = matchFinancing(req.tenant, { ...req.body, receivables: receivables(req.tenant) });
  const { LOAN_PRODUCTS } = require('./data/sandbox');
  const india = require('./india');
  m.options = m.options.map((o) => { const lp = LOAN_PRODUCTS.find((x) => x.id === o.product_id); const k = lp && m.requested_amount ? india.keyFactsStatement(lp, m.requested_amount, o.tenure_months) : null; return k ? { ...o, kfs: k } : o; });
  audit.append(req.sme.tenant_id, { actor: req.smeActor, action: 'suggest.financing_match', tier: 'SUGGEST', decision: 'allow', metadata: { amount: m.requested_amount } });
  res.json(m);
});

router.post('/:tid/copilot', async (req, res, next) => {
  try { res.json(await copilot.respond({ tenantId: req.sme.tenant_id, actor: req.smeActor, message: req.body?.message })); } catch (e) { next(e); }
});

// Multi-step agent: goal -> plan over guarded tools (forecast, receivables,
// reminders, financing, simulation). EXECUTE steps become approval cards.
router.post('/:tid/agent/plan', gate('recommend_financing'), (req, res) => {
  const horizon = Math.min(90, Math.max(14, Number(req.body?.horizon_days) || 45));
  res.json(agent.planCashGap({ tenantId: req.sme.tenant_id, actor: req.smeActor, horizonDays: horizon }));
});
router.get('/:tid/agent/tools', gate('view_overview'), (req, res) => {
  const tools = agent.makeTools(req.sme.tenant_id, req.smeActor);
  res.json({ llm_enabled: agent.llmConfig().enabled, tools: Object.entries(tools).map(([name, t]) => ({ name, tier: t.tier, description: t.desc, args: t.args })) });
});

// Autopilot: scheduled monitoring runs, morning brief, kill switch.
router.get('/:tid/autopilot', gate('view_overview'), (req, res) => res.json(autopilot.status(req.sme.tenant_id)));
router.post('/:tid/autopilot/run', gate('run_autopilot'), (req, res) => res.json(autopilot.runFor(req.sme.tenant_id, { trigger: 'manual', by: req.smeActor })));
router.post('/:tid/autopilot/pause', (req, res) => {
  const r = autopilot.setPaused(req.sme.tenant_id, req.smeActor, req.body?.paused !== false);
  if (r.error) return res.status(r.status).json(withWhy(r));
  res.json(r);
});

// Spending mandates (bounded autonomy). Creation needs a one-time code.
router.get('/:tid/mandates', gate('view_overview'), (req, res) => res.json({ mandates: mandates.list(req.sme.tenant_id), hard_limits: mandates.HARD }));
router.post('/:tid/mandates/challenge', (req, res) => {
  const r = mandates.requestCreate({ tenantId: req.sme.tenant_id, actor: req.smeActor, params: req.body || {} });
  if (r.error) return res.status(r.status).json(withWhy(r));
  res.json(r);
});
router.post('/:tid/mandates', (req, res) => {
  const { otp, ...params } = req.body || {};
  const r = mandates.create({ tenantId: req.sme.tenant_id, actor: req.smeActor, params, otp });
  if (r.error) return res.status(r.status).json(withWhy(r));
  res.status(201).json(r);
});
router.post('/:tid/mandates/:id/revoke', (req, res) => {
  const r = mandates.revoke({ tenantId: req.sme.tenant_id, actor: req.smeActor, mandateId: req.params.id });
  if (r.error) return res.status(r.status).json(withWhy(r));
  res.json(r);
});

// GST calendar: GSTR-3B dues, input credit at risk, coverage, cost of paying late.
// Statutory calendar: TDS, GSTR-1, PF/ESIC, GSTR-3B, advance tax (READ).
router.get('/:tid/compliance', gate('view_compliance'), (req, res) => {
  const india = require('./india');
  const g = gst.calendar(req.tenant);
  res.json({ as_of: req.tenant.profile.as_of, days: 45, items: india.complianceCalendar(req.tenant, 45, g.dues || []), udyam: india.UDYAM[req.tenant.profile.id] || null, disclaimer: 'Indicative dates for a monthly filer; confirm with your CA.' });
});

// Mark an invoice or bill as disputed (or settled). Disputed items are never chased or paid.
router.post('/:tid/disputes', gate('mark_dispute'), (req, res) => {
  if (req.sme.sme_role === 'agent') return res.status(403).json(withWhy({ error: 'policy_denied', reasons: ['owner_only'] }));
  const { kind, id, disputed, reason } = req.body || {};
  const list = kind === 'bill' ? req.tenant.payables : kind === 'invoice' ? req.tenant.invoices : null;
  const item = list && list.find((x) => x.id === id);
  if (!item) return res.status(404).json(withWhy({ error: 'not_found', reasons: [kind === 'bill' ? 'bill_or_verified_payee_not_found' : 'invoice_not_found'] }));
  if (disputed) item.dispute = { reason: String(reason || 'quality or quantity dispute').slice(0, 120), by: req.sme.sme_role, at: new Date().toISOString() };
  else delete item.dispute;
  audit.append(req.sme.tenant_id, { actor: req.smeActor, action: disputed ? `dispute.open.${kind}` : `dispute.settle.${kind}`, tier: 'SUGGEST', decision: 'allow', target: id, metadata: { reason: item.dispute ? item.dispute.reason : null, amount: item.amount } });
  res.json({ id, kind, dispute: item.dispute || null });
});

router.get('/:tid/gst', gate('view_gst'), (req, res) => {
  audit.append(req.sme.tenant_id, { actor: req.smeActor, action: 'view.gst', tier: 'READ', decision: 'allow' });
  res.json(gst.calendar(req.tenant));
});

// Dynamic discounting: early-pay offers scored against the cost of money and the cash buffer.
router.get('/:tid/discounts', gate('view_discounts'), (req, res) => res.json(discounting.scan(req.tenant)));
router.post('/:tid/discounts/:billId/propose', gate('draft_reminder'), (req, res) => {
  const r = discounting.proposeEarlyPayment({ tenantId: req.sme.tenant_id, actor: req.smeActor, billId: req.params.billId, source: 'user' });
  if (r.error) return res.status(r.status).json(withWhy(r));
  res.status(r.duplicate ? 200 : 201).json(r);
});

// Plain-language explanation for any reason code (used by the dashboard's "Why not?" cards).
router.get('/:tid/explain', (req, res) => res.json({ why_not: explain(String(req.query.codes || '').split(',').filter(Boolean).slice(0, 10)) }));

// What a lender would see: banded features + ledger commitment, never the books.
router.get('/:tid/privacy/lender-share', gate('recommend_financing'), (req, res) => res.json(lenderShare(req.tenant)));

router.get('/:tid/actions', (req, res) => res.json({ actions: actions.list(req.sme.tenant_id) }));

router.post('/:tid/actions', (req, res) => {
  const { type, params, idempotency_key } = req.body || {};
  const r = actions.propose({ tenantId: req.sme.tenant_id, actor: req.smeActor, type, params, idempotencyKey: idempotency_key || req.get('Idempotency-Key') });
  if (r.denied) return res.status(403).json(withWhy({ error: 'policy_denied', reasons: r.verdict.reasons, why_not: r.why_not }));
  res.status(r.duplicate ? 200 : 201).json(r);
});

// Step-up: owner requests a one-time code bound to this action and amount.
router.post('/:tid/actions/:id/stepup', (req, res) => {
  const a = actions.get(req.sme.tenant_id, req.params.id);
  if (!a) return res.status(404).json({ error: 'not_found' });
  if (!policy.canApprove(req.sme.sme_role)) return res.status(403).json(withWhy({ error: 'only_owner_can_approve' }));
  if (a.status !== 'pending_approval') return res.status(409).json({ error: `already_${a.status}` });
  res.json(stepup.issue({ tenantId: req.sme.tenant_id, actor: req.smeActor, purpose: `approve.${a.type}`, ref: a.id, amount: a.params.amount ?? null }));
});

router.post('/:tid/actions/:id/approve', (req, res) => {
  const r = actions.decide({ tenantId: req.sme.tenant_id, actor: req.smeActor, actionId: req.params.id, approve: true, confirmAmount: req.body?.confirm_amount, otp: req.body?.otp, kfsAck: req.body?.kfs_ack });
  if (r.error) return res.status(r.status).json(withWhy(r));
  res.json(r);
});

router.post('/:tid/actions/:id/reject', (req, res) => {
  const r = actions.decide({ tenantId: req.sme.tenant_id, actor: req.smeActor, actionId: req.params.id, approve: false, reason: req.body?.reason });
  if (r.error) return res.status(r.status).json(withWhy(r));
  res.json(r);
});

router.post('/:tid/actions/:id/cooling-off-exit', (req, res) => {
  const r = actions.exitCoolingOff({ tenantId: req.sme.tenant_id, actor: req.smeActor, actionId: req.params.id });
  if (r.error) return res.status(r.status).json(withWhy(r));
  res.json(r);
});

router.get('/:tid/audit', (req, res) => {
  if (req.sme.sme_role === 'viewer') return res.status(403).json({ error: 'policy_denied' });
  res.json({ entries: audit.list(req.sme.tenant_id), verification: audit.verify(req.sme.tenant_id) });
});

router.post('/:tid/audit/tamper-drill', (req, res) => {
  if (req.sme.sme_role === 'viewer') return res.status(403).json(withWhy({ error: 'policy_denied', reasons: ['role_viewer_lacks_audit'] }));
  const r = audit.tamperDrill(req.sme.tenant_id);
  audit.append(req.sme.tenant_id, { actor: req.smeActor, action: 'audit.tamper_drill', tier: 'READ', decision: 'allow', metadata: { edited_seq: r.edited_seq || null, detected_at: r.tampered_copy ? r.tampered_copy.broken_at_seq || null : null } });
  res.json(r);
});

// Cockpit: one read-only summary for the treasury view (no side effects).
router.get('/:tid/cockpit', gate('view_overview'), (req, res) => res.json(require('./cockpit').cockpit(req.tenant, req.sme)));

router.get('/:tid/audit/verify', (req, res) => res.json(audit.verify(req.sme.tenant_id)));

module.exports = router;
