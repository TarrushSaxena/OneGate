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
    if (v.decision === 'deny') return res.status(403).json({ error: 'policy_denied', reasons: v.reasons });
    next();
  };
}

router.get('/me', (req, res) => res.json({ ...req.sme, tenant_name: getTenant(req.sme.tenant_id)?.profile.name, tiers: policy.ACTIONS, limits: policy.LIMITS }));

router.get('/:tid/overview', gate('view_overview'), (req, res) => {
  const f = forecast(req.tenant); const r = receivables(req.tenant);
  audit.append(req.sme.tenant_id, { actor: req.smeActor, action: 'view.overview', tier: 'READ', decision: 'allow' });
  res.json({ profile: req.tenant.profile, forecast: { horizons: f.horizons, alerts: f.alerts, lowest_point: f.lowest_point }, receivables: { total_open: r.total_open, total_overdue: r.total_overdue, ageing: r.ageing }, payables: req.tenant.payables, pending_approvals: actions.list(req.sme.tenant_id).filter((a) => a.status === 'pending_approval').length });
});

router.get('/:tid/forecast', gate('view_forecast'), (req, res) => {
  const horizon = Math.min(90, Math.max(7, Number(req.query.horizon) || 90));
  audit.append(req.sme.tenant_id, { actor: req.smeActor, action: 'view.forecast', tier: 'READ', decision: 'allow', metadata: { horizon } });
  res.json({ ...forecast(req.tenant, { horizon }), backtest: backtest(req.tenant) });
});

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
  audit.append(req.sme.tenant_id, { actor: req.smeActor, action: 'suggest.financing_match', tier: 'SUGGEST', decision: 'allow', metadata: { amount: m.requested_amount } });
  res.json(m);
});

router.post('/:tid/copilot', (req, res) => {
  res.json(copilot.handle({ tenantId: req.sme.tenant_id, actor: req.smeActor, message: req.body?.message }));
});

router.get('/:tid/actions', (req, res) => res.json({ actions: actions.list(req.sme.tenant_id) }));

router.post('/:tid/actions', (req, res) => {
  const { type, params, idempotency_key } = req.body || {};
  const r = actions.propose({ tenantId: req.sme.tenant_id, actor: req.smeActor, type, params, idempotencyKey: idempotency_key || req.get('Idempotency-Key') });
  if (r.denied) return res.status(403).json({ error: 'policy_denied', reasons: r.verdict.reasons });
  res.status(r.duplicate ? 200 : 201).json(r);
});

router.post('/:tid/actions/:id/approve', (req, res) => {
  const r = actions.decide({ tenantId: req.sme.tenant_id, actor: req.smeActor, actionId: req.params.id, approve: true, confirmAmount: req.body?.confirm_amount });
  if (r.error) return res.status(r.status).json(r);
  res.json(r);
});

router.post('/:tid/actions/:id/reject', (req, res) => {
  const r = actions.decide({ tenantId: req.sme.tenant_id, actor: req.smeActor, actionId: req.params.id, approve: false, reason: req.body?.reason });
  if (r.error) return res.status(r.status).json(r);
  res.json(r);
});

router.get('/:tid/audit', (req, res) => {
  if (req.sme.sme_role === 'viewer') return res.status(403).json({ error: 'policy_denied' });
  res.json({ entries: audit.list(req.sme.tenant_id), verification: audit.verify(req.sme.tenant_id) });
});

router.get('/:tid/audit/verify', (req, res) => res.json(audit.verify(req.sme.tenant_id)));

module.exports = router;
