// OneGate SME v1.4: treasury cockpit summary, tamper drill, role switcher data.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { startTestServer, stopTestServer, fetchApi } = require('./helpers/harness');
const accountStore = require('../auth/accountStore');
const tokens = require('../auth/tokens');
const actions = require('../sme/actions');
const audit = require('../sme/auditChain');
const agent = require('../sme/agent');
const mandates = require('../sme/mandates');
const autopilot = require('../sme/autopilot');
const { cockpit } = require('../sme/cockpit');
const { membershipFor } = require('../sme/tenancy');
const { DEMO_ACCOUNTS } = require('../data/demo-accounts');
const { getTenant, resetSandbox } = require('../sme/data/sandbox');

const A = 'sme_ananya_textiles';
const C = 'sme_chai_point_cafe';
const T = {};
const OWNER_A = { tenant_id: A, sme_role: 'owner' };
async function mk(email) {
  const a = await accountStore.createAccount({ email, name: email.split('@')[0], role: 'employee', department: 'Finance', password: 'Password#2026!SmeTest', active: true });
  return tokens.signToken(a);
}
const fresh = () => { resetSandbox(); actions.resetForTests(); audit.resetForTests(); mandates.resetForTests(); autopilot.resetForTests(); };

test.before(async () => {
  await startTestServer();
  fresh();
  T.owner = await mk('owner.ananya@company.com');
  T.accountant = await mk('accounts.ananya@company.com');
  T.viewer = await mk('viewer.ananya@company.com');
  T.chai = await mk('owner.chai@company.com');
});
test.after(async () => { agent.setLLM(null); await stopTestServer(); });

test('cockpit before any plan: Ananya breaches the buffer inside 45 days and nothing is queued', () => {
  fresh();
  const c = cockpit(getTenant(A), OWNER_A);
  assert.ok(c.runway.lowest_unmitigated.low < c.runway.safety_buffer);
  assert.ok(c.runway.first_breach, 'first breach date is reported');
  assert.strictEqual(c.runway.plan.reminders, 0);
  assert.strictEqual(c.runway.plan.borrow_amount, 0);
  assert.deepStrictEqual(c.runway.plan.lowest_after, c.runway.lowest_unmitigated, 'no plan means no change');
});

test('cockpit after the planner: the low point it shows matches the planner\'s own simulation', () => {
  fresh();
  const p = agent.planCashGap({ tenantId: A, actor: { id: 'u1', sme_role: 'owner' } });
  const sim = p.steps.filter((s) => s.tool === 'simulate_plan').pop().observation;
  const c = cockpit(getTenant(A), OWNER_A);
  assert.ok(c.runway.plan.reminders >= 1, 'reminders queued');
  assert.ok(c.runway.plan.borrow_amount > 0, 'loan queued');
  assert.strictEqual(c.runway.lowest_unmitigated.low, sim.lowest_before.low);
  assert.strictEqual(c.runway.plan.lowest_after.low, sim.lowest_after.low);
  assert.ok(c.runway.plan.lowest_after.low > c.runway.lowest_unmitigated.low);
  assert.strictEqual(c.lanes.waiting_for_owner.length, actions.list(A).filter((a) => a.status === 'pending_approval').length);
});

test('cockpit is read-only: calling it adds nothing to the audit chain or the queue', () => {
  fresh();
  const before = { a: audit.list(A).length, q: actions.list(A).length };
  cockpit(getTenant(A), OWNER_A); cockpit(getTenant(A), OWNER_A);
  assert.deepStrictEqual({ a: audit.list(A).length, q: actions.list(A).length }, before);
});

test('blocked lane: held-back discounts, the planted injection, and audited denials each carry a why-not card', () => {
  fresh();
  const big = actions.propose({ tenantId: A, actor: { id: 'u1', sme_role: 'owner' }, type: 'schedule_payment', params: { beneficiary_id: getTenant(A).beneficiaries[0].id, amount: 600000 } });
  assert.ok(big.denied);
  const c = cockpit(getTenant(A), OWNER_A);
  const kinds = c.lanes.blocked.map((b) => b.kind);
  assert.ok(kinds.includes('held_back'));
  assert.ok(kinds.includes('injection'));
  const denied = c.lanes.blocked.find((b) => b.kind === 'denied');
  assert.ok(denied && denied.seq === big.audit_seq, 'denial links back to its audit entry');
  for (const b of c.lanes.blocked) assert.ok(b.why_not.length && b.why_not[0].rule && b.why_not[0].fix, `${b.title} explains itself`);
  assert.ok(denied.why_not.some((w) => w.rule === 'Per-payment limit'));
});

test('viewer cockpit hides the audit chain and audited denials', () => {
  fresh();
  actions.propose({ tenantId: A, actor: { id: 'u1', sme_role: 'owner' }, type: 'schedule_payment', params: { beneficiary_id: getTenant(A).beneficiaries[0].id, amount: 600000 } });
  const c = cockpit(getTenant(A), { tenant_id: A, sme_role: 'viewer' });
  assert.strictEqual(c.guardrails.audit, null);
  assert.ok(!c.lanes.blocked.some((b) => b.kind === 'denied'));
});

test('mandate lane lists only payments the autopilot made under a signed mandate', async () => {
  fresh();
  const t = getTenant(C);
  const bill = t.payables.filter((b) => b.status === 'open').sort((a, b) => a.due.localeCompare(b.due))[0];
  const ben = t.beneficiaries.find((b) => b.name === bill.supplier && b.verified);
  process.env.SME_STEPUP = 'off';
  const m = mandates.create({ tenantId: C, actor: { id: 'o', sme_role: 'owner' }, params: { beneficiary_id: ben.id, beneficiary_name: ben.name, max_per_payment: 200000, monthly_cap: 500000, valid_days: 60, purpose: 'test' } });
  delete process.env.SME_STEPUP;
  assert.ok(!m.error, `mandate created: ${JSON.stringify(m.reasons || m.error)}`);
  autopilot.runFor(C, { trigger: 'test' });
  const c = cockpit(t, { tenant_id: C, sme_role: 'owner' });
  assert.ok(c.lanes.paid_by_mandate.length >= 1, 'autopilot paid at least one bill under the mandate');
  for (const p of c.lanes.paid_by_mandate) assert.ok(p.mandate_id && p.receipt);
  assert.strictEqual(c.lanes.paid_by_mandate.length, actions.list(C).filter((a) => a.status === 'executed' && a.mandate_id).length);
});

test('API: cockpit is tenant-scoped and open to every role', async () => {
  fresh();
  for (const k of ['owner', 'accountant', 'viewer']) {
    const r = await fetchApi(`/api/sme/${A}/cockpit`, { token: T[k] });
    assert.strictEqual(r.status, 200, k);
    assert.ok(r.data.runway && r.data.lanes && r.data.guardrails);
  }
  const x = await fetchApi(`/api/sme/${C}/cockpit`, { token: T.owner });
  assert.strictEqual(x.status, 403);
});

test('tamper drill: an edit to a copy is caught at the edited entry, the live chain stays valid', async () => {
  fresh();
  actions.propose({ tenantId: A, actor: { id: 'u1', sme_role: 'owner' }, type: 'schedule_payment', params: { beneficiary_id: getTenant(A).beneficiaries[0].id, amount: 600000 } });
  const r = await fetchApi(`/api/sme/${A}/audit/tamper-drill`, { method: 'POST', token: T.owner });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.tampered_copy.valid, false);
  assert.strictEqual(r.data.tampered_copy.broken_at_seq, r.data.edited_seq);
  assert.strictEqual(r.data.edit.to, r.data.edit.from + 1);
  assert.notStrictEqual(r.data.recomputed_hash_prefix, r.data.stored_hash_prefix);
  assert.strictEqual(r.data.live_chain.valid, true);
  assert.strictEqual(audit.verify(A).valid, true);
  assert.ok(audit.list(A).some((e) => e.action === 'audit.tamper_drill'), 'the drill itself is audited');
  const v = await fetchApi(`/api/sme/${A}/audit/tamper-drill`, { method: 'POST', token: T.viewer });
  assert.strictEqual(v.status, 403);
  assert.ok(v.data.why_not && v.data.why_not.length);
});

test('role switcher: Ananya has owner, accountant and viewer demo users mapped to the same tenant', () => {
  const mine = DEMO_ACCOUNTS.filter((a) => a.key.endsWith('-ananya'));
  const roles = mine.map((a) => membershipFor({ email: a.email })).map((m) => m && m.tenant_id === A && m.sme_role).sort();
  assert.deepStrictEqual(roles, ['accountant', 'owner', 'viewer']);
});

test('dashboard: chat is a drawer, codes go to the phone, and the cockpit sections exist', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../frontend/sme.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '../../frontend/sme.js'), 'utf8');
  for (const id of ['runway', 'laneMandate', 'approvals', 'laneBlocked', 'guard', 'drawer', 'phone', 'roles']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(/<aside class="drawer"[^>]*>[\s\S]*id="chat"/.test(html), 'chat lives inside the drawer');
  assert.ok(!/sandbox SMS: \$\{/.test(js), 'one-time codes are no longer printed on the approval card');
  assert.ok(/sms\(/.test(js), 'codes are delivered to the phone panel');
});
