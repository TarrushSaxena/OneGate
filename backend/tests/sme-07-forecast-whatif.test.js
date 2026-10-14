// OneGate SME v1.5: forecast bands calibrated on past errors, and the what-if stress test.
const test = require('node:test');
const assert = require('node:assert');
const { startTestServer, stopTestServer, fetchApi } = require('./helpers/harness');
const accountStore = require('../auth/accountStore');
const tokens = require('../auth/tokens');
const actions = require('../sme/actions');
const audit = require('../sme/auditChain');
const mandates = require('../sme/mandates');
const autopilot = require('../sme/autopilot');
const cal = require('../sme/calibrate');
const { whatIf, normalise } = require('../sme/whatif');
const { forecast } = require('../sme/forecast');
const { getTenant, resetSandbox } = require('../sme/data/sandbox');

const A = 'sme_ananya_textiles';
const C = 'sme_chai_point_cafe';
const P = 'sme_pixelforge_studio';
const T = {};
async function mk(email) {
  const a = await accountStore.createAccount({ email, name: email.split('@')[0], role: 'employee', department: 'Finance', password: 'Password#2026!SmeTest', active: true });
  return tokens.signToken(a);
}
const fresh = () => { resetSandbox(); actions.resetForTests(); audit.resetForTests(); mandates.resetForTests(); autopilot.resetForTests(); };

test.before(async () => {
  await startTestServer(); fresh();
  T.owner = await mk('owner.ananya@company.com');
  T.viewer = await mk('viewer.ananya@company.com');
});
test.after(async () => { await stopTestServer(); });

test('finite-sample conformal quantile picks the ceil((n+1)q)-th value', () => {
  const s = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  assert.strictEqual(cal.cq(s, 0.1), 1);
  assert.strictEqual(cal.cq(s, 0.9), 9);
  assert.strictEqual(cal.cq(s, 0.5), 5);
  assert.strictEqual(cal.cq([], 0.9), 0);
});

test('calibration is deterministic and uses many past start dates', () => {
  fresh();
  for (const id of [A, C, P]) {
    const a = cal.calibrate(getTenant(id)); const b = cal.calibrate(getTenant(id));
    assert.deepStrictEqual(a, b);
    assert.ok(a.origins >= 20, `${id} origins ${a.origins}`);
    for (const k of a.buckets) { assert.ok(k.n >= 100); assert.ok(k.q_low <= k.q_high); }
  }
});

test('the 80% band covers about 80% of past outcomes for every SME', () => {
  for (const id of [A, C, P]) {
    const c = cal.empiricalCoverage(getTenant(id));
    assert.ok(c.coverage_pct >= 75 && c.coverage_pct <= 85, `${id} coverage ${c.coverage_pct}%`);
  }
});

test('a harder-to-forecast business gets a wider band (Ananya vs Chai Point)', () => {
  const w = (id) => { const b = cal.calibrate(getTenant(id)).buckets[1]; return b.q_high - b.q_low; };
  assert.ok(w(A) > w(C) * 3, `Ananya ${w(A)} vs Chai ${w(C)}`);
});

test('v1.8 collections fix: the base case is no longer badly optimistic', () => {
  // Median error (actual minus base) at 31-45 days before the fix: Ananya -11,55,897; Chai Point -1,40,910; PixelForge -3,10,415.
  const limits = { [A]: 300000, [C]: 60000, [P]: 80000 };
  for (const id of [A, C, P]) {
    const m = cal.calibrate(getTenant(id)).buckets[2].median_error;
    assert.ok(Math.abs(m) <= limits[id], `${id} median 31-45d error ${m}`);
  }
});

test('collections from not-yet-issued invoices only start once new invoices have aged to the usual pay time', () => {
  const { collectionLag } = require('../sme/forecast');
  const t = getTenant(A);
  const lag = collectionLag(t.invoices, Date.parse(`${t.profile.as_of}T00:00:00Z`));
  assert.ok(lag.p25 >= 25 && lag.p75 > lag.p25, JSON.stringify(lag));
});

test('the safety low is never above the scenario low or the calibrated band', () => {
  for (const id of [A, C, P]) {
    const t = getTenant(id); const f = forecast(t, { horizon: 90 });
    const c = cal.calibrate(t);
    f.series.forEach((p, i) => {
      assert.ok(p.low <= (p.scenario_low ?? p.low) + 0.01);
      assert.ok(p.low <= p.base + cal.bandFor(c, i + 1).q_low + 0.01, `${id} day ${i + 1}`);
    });
  }
});

test('calibrated band is attached to the forecast without changing the scenario numbers', () => {
  const t = getTenant(A); const f = forecast(t, { horizon: 90 });
  const r = cal.withCalibratedBand(t, f);
  assert.strictEqual(r.series.length, 90);
  r.series.forEach((p, i) => { assert.strictEqual(p.low, f.series[i].low); assert.ok(p.cal_low <= p.cal_high); });
  assert.ok(typeof r.calibration.day30.policy_is_more_cautious === 'boolean');
  assert.ok(r.calibration.caveat.length > 20, 'caveat is stated');
});

test('what-if with no changes is the current forecast', () => {
  fresh();
  const r = whatIf(getTenant(C), {});
  assert.strictEqual(r.change_in_low, 0);
  assert.deepStrictEqual(r.after, r.before);
  assert.strictEqual(r.cash_needed_to_hold_buffer, 0);
  assert.strictEqual(r.cheapest_financing, null);
});

test('stress only ever lowers cash: later debtors, lower sales, dearer suppliers', () => {
  for (const [id, input] of [[A, { debtor_delay_days: 30 }], [C, { sales_change_pct: -20 }], [P, { supplier_cost_change_pct: 25 }]]) {
    const r = whatIf(getTenant(id), input);
    assert.ok(r.change_in_low < 0, `${id} ${JSON.stringify(input)} -> ${r.change_in_low}`);
  }
  const d = whatIf(getTenant(A), { debtor_delay_days: 30 });
  assert.strictEqual(d.delayed_customers.length, 3);
});

test('a one-off expense lowers the low point by at most its amount', () => {
  const r = whatIf(getTenant(C), { one_off_expense: 200000, one_off_in_days: 3 });
  assert.ok(r.change_in_low <= 0 && r.change_in_low >= -200000, String(r.change_in_low));
});

test('when the buffer breaks, the gap is sized and the cheapest eligible financing is named', () => {
  const r = whatIf(getTenant(C), { sales_change_pct: -30, one_off_expense: 300000 });
  assert.ok(r.after.first_breach);
  assert.strictEqual(r.cash_needed_to_hold_buffer, Math.max(0, Math.round(r.safety_buffer - r.after.lowest.low)));
  assert.ok(r.cheapest_financing && r.cheapest_financing.apr_pct > 0);
  assert.ok(r.cheapest_financing.amount >= r.cash_needed_to_hold_buffer);
});

test('inputs are clamped to sane ranges', () => {
  const n = normalise({ debtor_delay_days: 9999, sales_change_pct: -500, supplier_cost_change_pct: 'x', one_off_expense: 1e12, top_debtors: 50 });
  assert.deepStrictEqual(n, { debtor_delay_days: 90, top_debtors: 5, sales_change_pct: -50, supplier_cost_change_pct: 0, one_off_expense: 2000000, one_off_in_days: 7 });
});

test('what-if is read-only: no audit entries, no actions, no change to stored data', () => {
  fresh();
  const t = getTenant(A); const snap = JSON.stringify(t.invoices) + JSON.stringify(t.payables);
  const n = audit.list(A).length;
  whatIf(t, { debtor_delay_days: 60, sales_change_pct: -40, one_off_expense: 500000 });
  assert.strictEqual(audit.list(A).length, n);
  assert.strictEqual(actions.list(A).length, 0);
  assert.strictEqual(JSON.stringify(t.invoices) + JSON.stringify(t.payables), snap);
});

test('API: forecast carries the calibration; what-if works for owner and viewer, never cross-tenant', async () => {
  fresh();
  const f = await fetchApi(`/api/sme/${A}/forecast`, { token: T.owner });
  assert.strictEqual(f.status, 200);
  assert.ok(f.data.calibration && f.data.series[0].cal_low !== undefined);
  for (const k of ['owner', 'viewer']) {
    const r = await fetchApi(`/api/sme/${A}/whatif`, { method: 'POST', token: T[k], body: { debtor_delay_days: 30 } });
    assert.strictEqual(r.status, 200, k);
    assert.ok(r.data.after.lowest.low < r.data.before.lowest.low);
  }
  const x = await fetchApi(`/api/sme/${C}/whatif`, { method: 'POST', token: T.owner, body: {} });
  assert.strictEqual(x.status, 403);
});
