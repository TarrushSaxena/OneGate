// OneGate SME v1.6: India rules pack. s.43B(h), TDS on receipts, statutory calendar,
// Key Facts Statement for loans (all-in APR, direct disbursal, cooling-off), dispute holds.
const test = require('node:test');
const assert = require('node:assert');
const { startTestServer, stopTestServer, fetchApi } = require('./helpers/harness');
const accountStore = require('../auth/accountStore');
const tokens = require('../auth/tokens');
const actions = require('../sme/actions');
const audit = require('../sme/auditChain');
const mandates = require('../sme/mandates');
const autopilot = require('../sme/autopilot');
const agent = require('../sme/agent');
const india = require('../sme/india');
const gst = require('../sme/gst');
const { receivables, draftReminder } = require('../sme/receivables');
const { forecast } = require('../sme/forecast');
const { getTenant, resetSandbox, LOAN_PRODUCTS } = require('../sme/data/sandbox');

const A = 'sme_ananya_textiles';
const C = 'sme_chai_point_cafe';
const P = 'sme_pixelforge_studio';
const T = {};
async function mk(email) {
  const a = await accountStore.createAccount({ email, name: email.split('@')[0], role: 'employee', department: 'Finance', password: 'Password#2026!SmeTest', active: true });
  return tokens.signToken(a);
}
const fresh = () => { resetSandbox(); actions.resetForTests(); audit.resetForTests(); mandates.resetForTests(); autopilot.resetForTests(); };
const OWNER = { id: 'o1', sme_role: 'owner' };

test.before(async () => {
  await startTestServer(); fresh();
  T.owner = await mk('owner.ananya@company.com');
  T.accountant = await mk('accounts.ananya@company.com');
  T.viewer = await mk('viewer.ananya@company.com');
  T.pix = await mk('owner.pixelforge@company.com');
});
test.after(async () => { await stopTestServer(); });

// ---------- s.43B(h) ----------
test('43B(h): traders are outside the rule (Ananya), unregistered firms too (Chai), a micro service firm is covered (PixelForge)', () => {
  fresh();
  const inv = (id) => getTenant(id).invoices.find((i) => i.status === 'open');
  assert.deepStrictEqual(india.msme43bh(getTenant(A), inv(A)), { applies: false, reason: 'traders_not_covered' });
  assert.deepStrictEqual(india.msme43bh(getTenant(C), inv(C)), { applies: false, reason: 'not_udyam_registered' });
  const m = india.msme43bh(getTenant(P), inv(P));
  assert.strictEqual(m.applies, true);
  assert.strictEqual(m.limit_days, 45, 'written agreement caps the limit at 45 days');
  assert.strictEqual(m.fy_end, '2027-03-31');
  assert.match(m.note, /only in the year it actually pays/, 'worded as a timing rule, not a permanent loss');
});

test('43B(h): the limit is 15 days without a written agreement and never more than 45', () => {
  const t = getTenant(P); const inv = { ...t.invoices[0], issued: '2026-09-20' };
  const saved = { ...india.UDYAM[P] };
  try {
    india.UDYAM[P].written_agreement_days = null;
    assert.strictEqual(india.msme43bh(t, inv).limit_days, 15);
    assert.strictEqual(india.msme43bh(t, inv).beyond_limit, true);
    india.UDYAM[P].written_agreement_days = 120;
    assert.strictEqual(india.msme43bh(t, inv).limit_days, 45);
  } finally { Object.assign(india.UDYAM[P], saved); }
});

test('financial year end is 31 March of the right year', () => {
  assert.strictEqual(india.fyEnd('2026-10-12'), '2027-03-31');
  assert.strictEqual(india.fyEnd('2027-02-01'), '2027-03-31');
  assert.strictEqual(india.fyEnd('2027-04-01'), '2028-03-31');
});

test('reminder draft adds the 43B(h) line only where it applies', () => {
  fresh();
  const pInv = receivables(getTenant(P)).top_overdue.find((x) => x.msme_43bh && x.msme_43bh.beyond_limit);
  assert.ok(pInv);
  assert.match(draftReminder(getTenant(P), pInv.invoice).body, /s\.43B\(h\)/);
  const aInv = receivables(getTenant(A)).top_overdue[0];
  assert.doesNotMatch(draftReminder(getTenant(A), aInv.invoice).body, /43B/);
});

// ---------- TDS ----------
test('TDS on receipts: 10% of the value before GST is deducted, the rest is cash in', () => {
  const r = india.tdsOnReceipt(getTenant(P), { amount: 118000 });
  assert.deepStrictEqual({ taxable: r.taxable_value, tds: r.tds, net: r.net_cash, s: r.section }, { taxable: 100000, tds: 10000, net: 108000, s: '194J' });
  assert.strictEqual(india.tdsOnReceipt(getTenant(A), { amount: 118000 }), null, 'goods trader: no TDS modelled');
});

test('receivables show net-of-TDS cash for PixelForge and ask for Form 16A in the reminder', () => {
  fresh();
  const r = receivables(getTenant(P));
  assert.ok(r.top_overdue.every((x) => x.tds && x.tds.net_cash < x.amount));
  assert.ok(r.net_of_tds_overdue < r.total_overdue);
  assert.match(draftReminder(getTenant(P), r.top_overdue[0].invoice).body, /Form 16A/);
});

// ---------- Statutory calendar ----------
test('statutory calendar: PF/ESIC on the 15th, GSTR-3B with its amount on the 20th, TDS on the 7th, GSTR-1 on the 11th', () => {
  fresh();
  const t = getTenant(A);
  const items = india.complianceCalendar(t, 45, gst.calendar(t).dues);
  const on = (d) => items.filter((x) => x.date === d).map((x) => x.item.split(' ')[0]);
  assert.deepStrictEqual(on('2026-10-15'), ['PF']);
  const g = items.find((x) => x.date === '2026-10-20');
  assert.strictEqual(g.amount, 144000);
  assert.deepStrictEqual(on('2026-11-07'), ['TDS']);
  assert.deepStrictEqual(on('2026-11-11'), ['GSTR-1']);
  for (const x of items) assert.ok(x.if_late && x.law);
  assert.deepStrictEqual(items.map((x) => x.date), items.map((x) => x.date).slice().sort());
});

test('advance tax shows up on 15 December', () => {
  const t = getTenant(C);
  const items = india.complianceCalendar({ ...t, profile: { ...t.profile, as_of: '2026-12-01' } }, 30, []);
  assert.ok(items.some((x) => x.date === '2026-12-15' && /Advance tax/.test(x.item)));
});

// ---------- Key Facts Statement ----------
test('all-in APR: no fee means APR equals the rate; a fee pushes it above the rate', () => {
  assert.strictEqual(india.allInApr(100000, 12, 12, 0).apr_pct, 12);
  const f = india.allInApr(100000, 19, 12, 2);
  assert.ok(f.apr_pct > 19 && f.apr_pct < 24, String(f.apr_pct));
});

test('KFS carries the RBI fields and a stable hash', () => {
  const lp = LOAN_PRODUCTS.find((x) => x.id === 'lp_fintech_wc');
  const a = india.keyFactsStatement(lp, 400000); const b = india.keyFactsStatement(lp, 400000);
  for (const k of ['apr_all_in_pct', 'processing_fee', 'penal_charges', 'cooling_off_days', 'regulated_entity', 'grievance_officer', 'disbursal_route', 'net_disbursed']) assert.ok(a[k] !== undefined, k);
  assert.match(a.penal_charges, /never compounded/);
  assert.strictEqual(a.disbursal_route, 'direct_to_borrower_account');
  assert.strictEqual(a.hash, b.hash);
  assert.notStrictEqual(a.hash, india.keyFactsStatement(lp, 500000).hash);
});

test('loan approval needs the owner to confirm this exact KFS, checked before the code is spent', async () => {
  fresh();
  const p = await fetchApi(`/api/sme/${A}/actions`, { method: 'POST', token: T.owner, body: { type: 'submit_loan_application', params: { product_id: 'lp_invoice_discount', amount: 400000 } } });
  const a = p.data.action;
  assert.ok(a.kfs && a.kfs.hash);
  const chl = (await fetchApi(`/api/sme/${A}/actions/${a.id}/stepup`, { method: 'POST', token: T.owner })).data;
  const no = await fetchApi(`/api/sme/${A}/actions/${a.id}/approve`, { method: 'POST', token: T.owner, body: { otp: { challenge_id: chl.challenge_id, code: chl.sandbox_code } } });
  assert.strictEqual(no.status, 400);
  assert.strictEqual(no.data.why_not[0].rule, 'RBI digital lending: Key Facts Statement');
  const wrong = await fetchApi(`/api/sme/${A}/actions/${a.id}/approve`, { method: 'POST', token: T.owner, body: { kfs_ack: 'f'.repeat(64), otp: { challenge_id: chl.challenge_id, code: chl.sandbox_code } } });
  assert.strictEqual(wrong.status, 400);
  const ok = await fetchApi(`/api/sme/${A}/actions/${a.id}/approve`, { method: 'POST', token: T.owner, body: { kfs_ack: a.kfs.hash, otp: { challenge_id: chl.challenge_id, code: chl.sandbox_code } } });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.data));
  assert.strictEqual(ok.data.action.receipt.kfs_hash, a.kfs.hash);
  assert.ok(ok.data.action.receipt.cooling_off_until);
});

test('cooling-off: the owner can exit with no penalty inside the window, only once, never after it', async () => {
  fresh();
  const p = actions.propose({ tenantId: A, actor: OWNER, type: 'submit_loan_application', params: { product_id: 'lp_fintech_wc', amount: 300000 } });
  process.env.SME_STEPUP = 'off';
  const d = actions.decide({ tenantId: A, actor: OWNER, actionId: p.action.id, approve: true, kfsAck: p.action.kfs.hash });
  delete process.env.SME_STEPUP;
  assert.strictEqual(d.action.status, 'executed');
  const acc = await fetchApi(`/api/sme/${A}/actions/${p.action.id}/cooling-off-exit`, { method: 'POST', token: T.accountant });
  assert.strictEqual(acc.status, 403, 'only the owner');
  const x = await fetchApi(`/api/sme/${A}/actions/${p.action.id}/cooling-off-exit`, { method: 'POST', token: T.owner });
  assert.strictEqual(x.status, 200);
  assert.strictEqual(x.data.action.cooling_off_exit.penalty, 0);
  const again = await fetchApi(`/api/sme/${A}/actions/${p.action.id}/cooling-off-exit`, { method: 'POST', token: T.owner });
  assert.strictEqual(again.status, 409);
  // A loan whose window has passed cannot be exited.
  fresh();
  const q = actions.propose({ tenantId: A, actor: OWNER, type: 'submit_loan_application', params: { product_id: 'lp_fintech_wc', amount: 300000 } });
  process.env.SME_STEPUP = 'off';
  actions.decide({ tenantId: A, actor: OWNER, actionId: q.action.id, approve: true, kfsAck: q.action.kfs.hash });
  delete process.env.SME_STEPUP;
  q.action.receipt.cooling_off_until = '2026-10-01';
  const late = actions.exitCoolingOff({ tenantId: A, actor: OWNER, actionId: q.action.id });
  assert.strictEqual(late.error, 'cooling_off_expired');
});

test('a product that routes money through a third party is denied', () => {
  fresh();
  const lp = LOAN_PRODUCTS.find((x) => x.id === 'lp_fintech_wc');
  lp.disbursal_route = 'via_lsp_pool_account';
  try {
    const r = actions.propose({ tenantId: A, actor: OWNER, type: 'submit_loan_application', params: { product_id: lp.id, amount: 300000 } });
    assert.ok(r.denied);
    assert.strictEqual(r.why_not[0].rule, 'RBI digital lending: direct disbursal');
  } finally { delete lp.disbursal_route; }
});

test('financing match shows the all-in APR for every option', async () => {
  fresh();
  const r = await fetchApi(`/api/sme/${A}/financing/match`, { method: 'POST', token: T.owner, body: { amount: 400000, urgency_days: 30 } });
  assert.ok(r.data.options.every((o) => o.kfs && o.kfs.apr_all_in_pct >= o.apr_pct));
});

// ---------- Disputes ----------
test('a disputed invoice is not chased, not forecast, and a reminder for it is refused', async () => {
  fresh();
  const top = receivables(getTenant(A)).top_overdue[0];
  const before = forecast(getTenant(A), { horizon: 45 }).lowest_point.low;
  const v = await fetchApi(`/api/sme/${A}/disputes`, { method: 'POST', token: T.viewer, body: { kind: 'invoice', id: top.invoice, disputed: true } });
  assert.strictEqual(v.status, 403, 'viewers cannot mark disputes');
  const r = await fetchApi(`/api/sme/${A}/disputes`, { method: 'POST', token: T.accountant, body: { kind: 'invoice', id: top.invoice, disputed: true, reason: 'damaged yarn' } });
  assert.strictEqual(r.status, 200);
  const rec = receivables(getTenant(A));
  assert.ok(!rec.top_overdue.some((x) => x.invoice === top.invoice));
  assert.strictEqual(rec.disputed[0].invoice, top.invoice);
  const f2 = forecast(getTenant(A), { horizon: 45 });
  assert.strictEqual(f2.expected_receivables.find((x) => x.invoice === top.invoice).probability, 0, 'its expected cash is removed from the forecast');
  assert.ok(f2.lowest_point.low <= before);
  const rem = actions.propose({ tenantId: A, actor: OWNER, type: 'send_reminder', params: { invoice_id: top.invoice } });
  assert.ok(rem.denied);
  assert.strictEqual(rem.why_not[0].title, 'Invoice is under dispute');
  const plan = agent.planCashGap({ tenantId: A, actor: OWNER });
  assert.ok(!plan.result.chase.some((c) => c.invoice_id === top.invoice), 'the planner never chases it');
  assert.ok(audit.list(A).some((e) => e.action === 'dispute.open.invoice' && e.target === top.invoice));
  await fetchApi(`/api/sme/${A}/disputes`, { method: 'POST', token: T.owner, body: { kind: 'invoice', id: top.invoice, disputed: false } });
  assert.ok(receivables(getTenant(A)).top_overdue.some((x) => x.invoice === top.invoice), 'settled: back in the chase list');
});

test('a disputed bill cannot be paid, not even under a mandate', () => {
  fresh();
  const t = getTenant(C);
  const bill = t.payables.filter((b) => b.status === 'open').sort((a, b) => a.due.localeCompare(b.due))[0];
  const ben = t.beneficiaries.find((b) => b.name === bill.supplier && b.verified);
  bill.dispute = { reason: 'short delivery', by: 'owner' };
  const r = actions.propose({ tenantId: C, actor: OWNER, type: 'schedule_payment', params: { amount: bill.amount, beneficiary_id: ben.id, bill_id: bill.id } });
  assert.ok(r.denied);
  assert.strictEqual(r.why_not[0].title, 'Bill is under dispute');
  process.env.SME_STEPUP = 'off';
  mandates.create({ tenantId: C, actor: OWNER, params: { beneficiary_id: ben.id, beneficiary_name: ben.name, max_per_payment: 200000, monthly_cap: 500000, valid_days: 60, purpose: 'test' } });
  delete process.env.SME_STEPUP;
  autopilot.runFor(C, { trigger: 'test' });
  assert.ok(!actions.list(C).some((a) => a.status === 'executed' && a.params.bill_id === bill.id), 'autopilot did not pay the disputed bill');
});

test('API: statutory calendar is readable by every role and tenant-scoped', async () => {
  fresh();
  for (const k of ['owner', 'accountant', 'viewer']) {
    const r = await fetchApi(`/api/sme/${A}/compliance`, { token: T[k] });
    assert.strictEqual(r.status, 200);
    assert.ok(r.data.items.length >= 4);
    assert.strictEqual(r.data.udyam.activity, 'trading');
  }
  assert.strictEqual((await fetchApi(`/api/sme/${P}/compliance`, { token: T.owner })).status, 403);
});
