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

// ---------- v1.8.1 demo fixes ----------
const approve = (id) => actions.decide({ tenantId: A, actor: { id: 'o', sme_role: 'owner' }, actionId: id, approve: true });

test('runway: approving a plan reminder keeps it in the plan as done, and the projected low does not fall', () => {
  fresh();
  agent.planCashGap({ tenantId: A, actor: { id: 'u1', sme_role: 'owner' } });
  const before = cockpit(getTenant(A), OWNER_A).runway.plan;
  assert.strictEqual(before.reminders, 3);
  assert.strictEqual(before.reminders_sent, 0);
  assert.strictEqual(before.lowest_after.low, 421816, 'v1.9 headline low point (repayments netted)');
  assert.strictEqual(before.still_breaches_on, null);
  // Approve the biggest reminder (the one that made the low drop to about 2.6 lakh in the demo).
  const rems = actions.list(A).filter((a) => a.type === 'send_reminder');
  const biggest = rems.find((a) => a.params.invoice_id === 'INV-ANA-0020') || rems[0];
  assert.ok(!approve(biggest.id).error);
  const after = cockpit(getTenant(A), OWNER_A).runway.plan;
  assert.strictEqual(after.reminders, 3, 'executed reminder still counts');
  assert.strictEqual(after.reminders_sent, 1);
  assert.strictEqual(after.reminders_waiting, 2);
  assert.strictEqual(after.waiting, 4, '2 reminders + the 2 financing lines still wait for the owner');
  assert.strictEqual(after.lowest_after.low, before.lowest_after.low, 'low point after approval is unchanged');
  assert.strictEqual(after.still_breaches_on, null);
});

test('runway: approving every plan action leaves nothing waiting and the low point where the plan said', () => {
  fresh();
  process.env.SME_STEPUP = 'off';
  try {
    agent.planCashGap({ tenantId: A, actor: { id: 'u1', sme_role: 'owner' } });
    const want = cockpit(getTenant(A), OWNER_A).runway.plan.lowest_after.low;
    for (const a of actions.list(A).filter((x) => x.status === 'pending_approval')) {
      const r = actions.decide({ tenantId: A, actor: { id: 'o', sme_role: 'owner' }, actionId: a.id, approve: true, kfsAck: a.kfs && a.kfs.hash });
      assert.ok(!r.error, `${a.type}: ${r.error}`);
    }
    const p = cockpit(getTenant(A), OWNER_A).runway.plan;
    assert.strictEqual(p.waiting, 0);
    assert.strictEqual(p.reminders_sent, 3);
    assert.strictEqual(p.loan_status, 'submitted');
    assert.strictEqual(p.borrow_amount, 1518864, 'TReDS-style face value 9,68,864 + NBFC 5,50,000');
    assert.strictEqual(p.lowest_after.low, want);
  } finally { delete process.env.SME_STEPUP; }
});

test('runway: a rejected reminder leaves the plan (only approved or waiting actions count)', () => {
  fresh();
  agent.planCashGap({ tenantId: A, actor: { id: 'u1', sme_role: 'owner' } });
  const before = cockpit(getTenant(A), OWNER_A).runway.plan;
  const r = actions.list(A).find((a) => a.type === 'send_reminder');
  actions.decide({ tenantId: A, actor: { id: 'o', sme_role: 'owner' }, actionId: r.id, approve: false, reason: 'test' });
  const after = cockpit(getTenant(A), OWNER_A).runway.plan;
  assert.strictEqual(after.reminders, 2);
  assert.ok(after.lowest_after.low < before.lowest_after.low, 'dropping a reminder lowers the projected low');
});

test('dashboard: approval card only re-renders on action buttons and keeps typed values; financing resets on business switch', () => {
  const js = fs.readFileSync(path.join(__dirname, '../../frontend/sme.js'), 'utf8');
  const handler = js.slice(js.indexOf("$('#approvals').onclick"), js.indexOf("$('#approvals').onclick") + 900);
  assert.ok(/closest\('button'\)/.test(handler) && /if \(!su && !ap && !rj && !coe\) return;/.test(handler), 'clicks outside action buttons return early');
  assert.ok(/\$\('#approvals'\)\.oninput/.test(js) && /typedVal\(`c:\$\{a\.id\}`\)/.test(js) && /typedVal\(`o:\$\{a\.id\}`\)/.test(js), 'typed amount and code survive a re-render');
  const bootFn = js.slice(js.indexOf('async function boot()'), js.indexOf('async function runFin('));
  assert.ok(/\$\('#finAmt'\)\.value = \$\('#finAmt'\)\.defaultValue/.test(bootFn), 'financing amount resets on business switch');
});
