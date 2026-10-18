// OneGate SME v1.9: regression tests for the pre-deadline audit (18 Oct 2026).
//  - financing repayments are netted inside the planning horizon (instalments; TReDS-style
//    discounting removes the discounted invoices' receipts, repaid by the buyer on the due date)
//  - the planner only claims "stays above the buffer" when the repayment-netted path does
//  - bill-backed payments are capped at the bill's open amount (cumulative) and must go to
//    the bill's own supplier
//  - TReDS-style discounting only sells this business's own open, undisputed, not-yet-due invoices
//  - dev JWT secret is random per process; the server claims an LLM only when a key is set
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const actions = require('../sme/actions');
const audit = require('../sme/auditChain');
const mandates = require('../sme/mandates');
const autopilot = require('../sme/autopilot');
const agent = require('../sme/agent');
const india = require('../sme/india');
const fin = require('../sme/financing');
const cal = require('../sme/calibrate');
const { forecast } = require('../sme/forecast');
const { cockpit } = require('../sme/cockpit');
const { getTenant, resetSandbox, LOAN_PRODUCTS } = require('../sme/data/sandbox');

const A = 'sme_ananya_textiles';
const P = 'sme_pixelforge_studio';
const OWNER = { id: 'o1', sme_role: 'owner' };
const fresh = () => { resetSandbox(); actions.resetForTests(); audit.resetForTests(); mandates.resetForTests(); autopilot.resetForTests(); };
const CHASE = ['INV-ANA-0020', 'INV-ANA-0001', 'INV-ANA-0043'];

// ---------- Repayments netted in the simulation ----------
test('a term loan: cash lands net of the fee and every instalment inside the horizon goes out again', () => {
  fresh();
  const t = getTenant(A);
  const s = agent.simulate(t, { financing: [{ product_id: 'lp_fintech_wc', amount: 900000 }], horizon_days: 45 });
  const naive = agent.simulate(t, { borrow_amount: 900000, horizon_days: 45 });
  assert.strictEqual(naive.repayment_modelled, false, 'a borrowing with no product is flagged as not modelled');
  assert.strictEqual(s.repayment_modelled, true);
  assert.strictEqual(s.repayments_in_horizon.length, 1, 'one monthly instalment falls inside 45 days');
  const emi = Math.round(fin.emi(900000, 19, 12));
  assert.strictEqual(s.repayments_in_horizon[0].amount, emi);
  const fee = 900000 * 0.02;
  assert.ok(Math.abs((naive.lowest_after.low - s.lowest_after.low) - (fee + emi)) <= 2, 'difference = fee + instalment');
});

test('TReDS-style discounting: proceeds are face minus discount and fee, and the discounted receipts are removed', () => {
  fresh();
  const t = getTenant(A);
  const pool = fin.discountableInvoices(t, { disbursalDays: 3 });
  assert.ok(pool.length >= 2 && pool.every((x) => x.due > '2026-10-15'), 'only invoices due after the funds land');
  const ids = pool.slice(0, 2).map((x) => x.invoice_id);
  const face = Math.round(pool.slice(0, 2).reduce((a, x) => a + x.face, 0));
  const s = agent.simulate(t, { financing: [{ product_id: 'lp_invoice_discount', amount: face, invoice_ids: ids }], horizon_days: 45 });
  const proceeds = s.expected_inflows.find((x) => x.kind === 'discount_proceeds').amount;
  assert.ok(proceeds < face && proceeds > face * 0.98, 'cash received is face value minus a small discount');
  assert.deepStrictEqual(s.discounted_invoices.map((x) => x.invoice_id), ids);
  assert.ok(s.discounted_invoices.every((x) => /buyer/.test(x.paid_by)), 'repaid by the buyer on the due date');
  assert.strictEqual(s.repayments_in_horizon.length, 0, 'no instalments from the business');
  assert.ok(s.receipts_given_up_in_horizon > 0, 'those invoices no longer pay the business');
  const naive = agent.simulate(t, { borrow_amount: face, horizon_days: 45 });
  assert.ok(s.lowest_after.low < naive.lowest_after.low, 'cannot count the invoice cash twice');
});

test('a chased invoice is counted once: its own forecast receipt is replaced by the reminder estimate', () => {
  fresh();
  const t = getTenant(A);
  const f = forecast(t, { horizon: 45 });
  const s = agent.simulate(t, { chase_invoice_ids: [CHASE[0]], horizon_days: 45 });
  const rec = s.expected_inflows.find((x) => x.source === CHASE[0]).amount;
  assert.ok(s.lowest_after.low <= f.lowest_point.low + rec + 1);
});

// ---------- Planner honesty ----------
test('Ananya plan (v1.9 headline): with repayments netted the low point stays above the buffer', () => {
  fresh();
  const p = agent.planCashGap({ tenantId: A, actor: OWNER, horizonDays: 45 });
  const sim = p.result.simulation;
  assert.strictEqual(p.gap, 1174344);
  assert.strictEqual(sim.lowest_before.low, -762344);
  assert.strictEqual(sim.lowest_after.low, 421816);
  assert.strictEqual(sim.first_breach_after_plan, null);
  assert.strictEqual(sim.repayment_modelled, true);
  assert.ok(sim.repayments_in_horizon.length >= 1, 'the NBFC instalment inside the horizon is counted');
  const lines = p.result.financing.lines;
  assert.deepStrictEqual(lines.map((l) => l.product_id), ['lp_invoice_discount', 'lp_fintech_wc']);
  assert.strictEqual(lines[0].amount, 968864);
  assert.strictEqual(lines[1].amount, 550000);
  assert.ok(lines[0].all_in_apr_pct > lines[0].rate_pct, 'all-in APR quoted next to the rate');
  // The plan's simulation is reproducible from its own lines.
  const again = agent.simulate(getTenant(A), { chase_invoice_ids: CHASE, financing: lines.map((l) => ({ product_id: l.product_id, amount: l.amount, invoice_ids: l.invoice_ids })), horizon_days: 45 });
  assert.strictEqual(again.lowest_after.low, sim.lowest_after.low);
  assert.match(p.reply, /repayments counted/);
  assert.match(p.reply, /TReDS-style discounting \(sandbox\)/);
  assert.strictEqual(p.cards.length, 5, '3 reminders + 2 financing applications, each waiting for the owner');
  const c = cockpit(getTenant(A), { tenant_id: A, sme_role: 'owner' });
  assert.strictEqual(c.runway.plan.lowest_after.low, 421816, 'cockpit shows the same netted low');
});

test('planner never says "stays above the buffer" when the netted path still breaches', () => {
  fresh();
  const t = getTenant(A);
  const saved = t.profile.credit_score;
  t.profile.credit_score = 600; // NBFC and banks drop out; only TReDS-style discounting is left
  try {
    const p = agent.planCashGap({ tenantId: A, actor: OWNER, horizonDays: 45 });
    const sim = p.result.simulation;
    assert.ok(sim.first_breach_after_plan, 'discounting alone cannot close this gap');
    assert.match(p.reply, /still falls below the buffer/);
    assert.doesNotMatch(p.reply, /stays above the buffer/);
  } finally { t.profile.credit_score = saved; }
});

test('KFS for TReDS-style discounting: no instalments, repaid by the buyer, all-in APR above the rate', () => {
  fresh();
  const t = getTenant(A);
  const lp = LOAN_PRODUCTS.find((x) => x.id === 'lp_invoice_discount');
  const inv = fin.discountableInvoices(t, { disbursalDays: 3 }).slice(0, 2);
  const face = inv.reduce((a, x) => a + x.face, 0);
  const k = india.keyFactsStatement(lp, face, undefined, { invoices: inv });
  assert.strictEqual(k.instalment, null);
  assert.strictEqual(k.tenure_months, null);
  assert.match(k.repaid_by, /buyer/);
  assert.ok(k.apr_all_in_pct > lp.apr);
  assert.ok(k.net_disbursed < face);
  assert.deepStrictEqual(k.invoices.map((x) => x.invoice_id), inv.map((x) => x.invoice_id));
});

test('TReDS-style discounting refuses overdue, other-business and over-valued invoices', () => {
  fresh();
  const overdue = actions.propose({ tenantId: A, actor: OWNER, type: 'submit_loan_application', params: { product_id: 'lp_invoice_discount', amount: 100000, invoice_ids: [CHASE[0]] } });
  assert.ok(overdue.denied); assert.deepStrictEqual(overdue.verdict.reasons, ['invoice_not_discountable']);
  const other = actions.propose({ tenantId: A, actor: OWNER, type: 'submit_loan_application', params: { product_id: 'lp_invoice_discount', amount: 50000, invoice_ids: ['INV-PIX-0008'] } });
  assert.ok(other.denied); assert.deepStrictEqual(other.verdict.reasons, ['invoice_not_discountable']);
  const big = actions.propose({ tenantId: A, actor: OWNER, type: 'submit_loan_application', params: { product_id: 'lp_invoice_discount', amount: 900000, invoice_ids: ['INV-ANA-0032'] } });
  assert.ok(big.denied); assert.deepStrictEqual(big.verdict.reasons, ['discount_exceeds_invoice_value']);
  const tooMuch = actions.propose({ tenantId: A, actor: OWNER, type: 'submit_loan_application', params: { product_id: 'lp_invoice_discount', amount: 9000000 } });
  assert.ok(tooMuch.denied); assert.deepStrictEqual(tooMuch.verdict.reasons, ['not_enough_discountable_invoices']);
  const ok = actions.propose({ tenantId: A, actor: OWNER, type: 'submit_loan_application', params: { product_id: 'lp_invoice_discount', amount: 400000 } });
  assert.ok(!ok.denied && ok.action.params.invoice_ids.length >= 1, 'invoices are picked when none are named');
});

// ---------- Bill cap and payee match (audit E4) ----------
test('bill-backed payments: capped at the bill (cumulative), so a bill cannot be split past the limit', () => {
  fresh();
  const t = getTenant(A);
  const bill = t.payables.find((b) => b.id === 'sme_ananya_textiles_bill1'); // Gujarat Yarn Mills, ₹4,20,000
  const ben = t.beneficiaries.find((b) => b.name === bill.supplier);
  const pay = (amount) => actions.propose({ tenantId: A, actor: OWNER, type: 'schedule_payment', params: { amount, beneficiary_id: ben.id, bill_id: bill.id } });
  const r1 = pay(240000);
  assert.ok(!r1.denied, 'first part is fine');
  const r2 = pay(240000);
  assert.ok(r2.denied, 'second part would take the bill past ₹4,20,000');
  assert.deepStrictEqual(r2.verdict.reasons, ['exceeds_bill_open_amount_180000']);
  assert.strictEqual(r2.why_not[0].rule, 'Bill cap');
  const r3 = pay(240000);
  assert.ok(r3.denied, 'and so is the third');
  const r4 = pay(180000);
  assert.ok(!r4.denied, 'the remaining open amount is still payable');
  assert.ok(pay(1).denied, 'nothing more once the bill is fully committed');
});

test('bill-backed payments: the cap also holds at approval time and after execution', () => {
  fresh();
  process.env.SME_STEPUP = 'off';
  try {
    const t = getTenant(A);
    const bill = t.payables.find((b) => b.id === 'sme_ananya_textiles_bill2'); // Om Logistics ₹96,000
    const ben = t.beneficiaries.find((b) => b.name === bill.supplier);
    const a = actions.propose({ tenantId: A, actor: OWNER, type: 'schedule_payment', params: { amount: 96000, beneficiary_id: ben.id, bill_id: bill.id } });
    assert.ok(!a.denied);
    const d = actions.decide({ tenantId: A, actor: OWNER, actionId: a.action.id, approve: true, confirmAmount: 96000 });
    assert.ok(!d.error, String(d.error));
    const again = actions.propose({ tenantId: A, actor: OWNER, type: 'schedule_payment', params: { amount: 96000, beneficiary_id: ben.id, bill_id: bill.id } });
    assert.ok(again.denied, 'a paid bill cannot be paid again');
  } finally { delete process.env.SME_STEPUP; }
});

test('bill-backed payments must go to the bill\'s own supplier; unknown bills are refused', () => {
  fresh();
  const t = getTenant(A);
  const bill = t.payables.find((b) => b.id === 'sme_ananya_textiles_bill1');
  const other = t.beneficiaries.find((b) => b.name === 'Landlord');
  const r = actions.propose({ tenantId: A, actor: OWNER, type: 'schedule_payment', params: { amount: 100000, beneficiary_id: other.id, bill_id: bill.id } });
  assert.ok(r.denied); assert.deepStrictEqual(r.verdict.reasons, ['payee_does_not_match_bill_supplier']);
  const u = actions.propose({ tenantId: A, actor: OWNER, type: 'schedule_payment', params: { amount: 100000, beneficiary_id: other.id, bill_id: 'sme_pixelforge_studio_bill1' } });
  assert.ok(u.denied); assert.deepStrictEqual(u.verdict.reasons, ['bill_not_found']);
});

// ---------- Forecast honesty ----------
test('band coverage: 80% in-sample by construction; the held-out check is reported separately', () => {
  fresh();
  for (const id of [A, P]) {
    const t = getTenant(id);
    const h = cal.heldOutCoverage(t);
    assert.ok(h.test_origins > 0 && h.n > 0 && h.coverage_pct >= 0 && h.coverage_pct <= 100);
    const c = cal.withCalibratedBand(t, forecast(t, { horizon: 45 })).calibration;
    assert.strictEqual(c.in_sample, true);
    assert.doesNotMatch(c.method, /split-conformal/);
  }
});

// ---------- Startup hygiene ----------
test('dev JWT secret is random per process (no published default), and the LLM is only claimed with a key', () => {
  const src = fs.readFileSync(path.join(__dirname, '../auth/config.js'), 'utf8');
  assert.doesNotMatch(src, /ps18-development-secret-key/);
  assert.match(src, /randomBytes\(48\)/);
  const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  assert.doesNotMatch(server, /console\.log\('\[LLM\] zenmux API wired/);
  assert.match(server, /LLM_KEY_SET \?/);
});
