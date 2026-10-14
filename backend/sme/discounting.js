// ============================================================
// OneGate SME: Dynamic-discounting agent
// Suppliers often offer a discount for paying early ("1/2 net 9": 1% off if
// paid within 2 days, otherwise the full amount on day 9). Taking it is a
// short, very high-yield investment of spare cash, but only when the cash
// really is spare. For each open bill with early-pay terms the agent:
//   1. annualises the discount:  d / (1 - d) * 365 / days_early
//   2. compares it with a hurdle: what idle cash earns (sandbox liquid-fund
//      yield) or, when a cash gap is coming, the cheapest eligible loan APR
//      (never borrow at 9% to earn a discount worth less)
//   3. re-runs the pessimistic forecast with the payment moved earlier and
//      refuses if cash would fall below the safety buffer before the due date
// A worthwhile, safe offer becomes a normal EXECUTE approval card for the
// discounted amount (owner re-types the amount and enters a one-time code).
// Every skipped offer carries a "why not" card.
// ============================================================
const { getTenant, DAY, iso, round2 } = require('./data/sandbox');
const { forecast } = require('./forecast');
const { receivables } = require('./receivables');
const { matchFinancing } = require('./financing');
const { explain } = require('./explain');
const audit = require('./auditChain');

const TREASURY_YIELD_PCT = 6.5;   // sandbox: what idle cash earns in a liquid fund / sweep FD
const HORIZON = 45;
const toMs = (d) => Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`);

function annualised(discountPct, daysEarly) {
  if (!(daysEarly > 0)) return 0;
  const d = discountPct / 100;
  return round2((d / (1 - d)) * (365 / daysEarly) * 100);
}

function hurdleFor(tenant, f, amount) {
  const gapAhead = f.series.some((p) => p.low < f.safety_buffer);
  if (!gapAhead) return { hurdle_pct: TREASURY_YIELD_PCT, hurdle_source: 'idle cash yield (sandbox liquid fund)' };
  const m = matchFinancing(tenant, { amount: Math.max(25000, Math.round(amount)), urgency_days: 30, receivables: receivables(tenant) });
  const best = m.options.find((o) => o.product_id === m.recommendation?.product_id);
  return best
    ? { hurdle_pct: Math.max(TREASURY_YIELD_PCT, best.apr_pct), hurdle_source: `cheapest eligible borrowing (${best.lender}), because a cash gap is coming` }
    : { hurdle_pct: 19, hurdle_source: 'no eligible borrowing; assumed costliest sandbox line' };
}

/** Evaluate one bill. Pure: proposes nothing. */
function evaluateBill(tenant, bill, f = forecast(tenant, { horizon: HORIZON })) {
  const base = { bill_id: bill.id, supplier: bill.supplier, amount: bill.amount, due: bill.due };
  const reasons = [];
  const t = bill.early_pay;
  if (!t || bill.status !== 'open') return { ...base, eligible_terms: false, worth_it: false, reasons: ['no_early_pay_terms'], why_not: explain(['no_early_pay_terms']) };
  const asOf = toMs(tenant.profile.as_of);
  const ben = tenant.beneficiaries.find((b) => b.name === bill.supplier && b.verified);
  if (!ben) reasons.push('payee_not_verified');
  if (toMs(t.pay_by) < asOf) reasons.push('discount_window_closed');
  const daysEarly = Math.round((toMs(bill.due) - toMs(t.pay_by)) / DAY);
  const discount = round2(bill.amount * t.discount_pct / 100);
  const pay = round2(bill.amount - discount);
  const ret = annualised(t.discount_pct, daysEarly);
  const h = hurdleFor(tenant, f, pay);
  if (ret <= h.hurdle_pct) reasons.push(`return_below_hurdle_${ret}_vs_${h.hurdle_pct}`);

  // Move the outflow from the due date to pay_by on the pessimistic path.
  const shifted = f.series.map((p) => ({ date: p.date, low: p.date >= t.pay_by && p.date < bill.due ? p.low - pay : p.date >= bill.due ? p.low + discount : p.low }));
  const window = shifted.filter((p) => p.date >= t.pay_by && p.date < bill.due);
  const breach = window.find((p) => p.low < f.safety_buffer);
  if (breach) reasons.push(`early_payment_breaks_buffer_on_${breach.date}`);
  const lowest = window.length ? window.reduce((a, b) => (b.low < a.low ? b : a)) : null;

  return {
    ...base, eligible_terms: true, beneficiary_id: ben?.id || null,
    discount_pct: t.discount_pct, pay_by: t.pay_by, days_early: daysEarly,
    discount_inr: discount, pay_amount: pay, annualised_return_pct: ret, ...h,
    lowest_low_if_paid_early: lowest ? { date: lowest.date, low: Math.round(lowest.low) } : null,
    safety_buffer: f.safety_buffer,
    worth_it: reasons.length === 0, reasons,
    why_not: explain(reasons, { amount: pay, buffer: f.safety_buffer }),
  };
}

/** Scan all open bills. Each accepted offer is checked against the cash left after the earlier ones. */
function scan(tenant) {
  const f = forecast(tenant, { horizon: HORIZON });
  const offers = tenant.payables.filter((b) => b.status === 'open' && b.early_pay).map((b) => evaluateBill(tenant, b, f));
  // Cumulative safety: taking two offers together must still respect the buffer.
  let series = f.series.map((p) => ({ ...p }));
  for (const o of offers.filter((x) => x.worth_it).sort((a, b) => b.annualised_return_pct - a.annualised_return_pct)) {
    const next = series.map((p) => ({ ...p, low: p.date >= o.pay_by && p.date < o.due ? p.low - o.pay_amount : p.date >= o.due ? p.low + o.discount_inr : p.low }));
    const breach = next.find((p) => p.date >= o.pay_by && p.date < o.due && p.low < f.safety_buffer);
    if (breach) { o.worth_it = false; o.reasons.push(`early_payment_breaks_buffer_on_${breach.date}`); o.why_not = explain(o.reasons, { amount: o.pay_amount, buffer: f.safety_buffer }); continue; }
    series = next;
  }
  const take = offers.filter((o) => o.worth_it);
  return {
    tenant_id: tenant.profile.id, as_of: tenant.profile.as_of, treasury_yield_pct: TREASURY_YIELD_PCT,
    offers, worth_taking: take.length, total_savings: round2(take.reduce((a, o) => a + o.discount_inr, 0)),
    method: 'Annualised return = d/(1-d) x 365/days early. Taken only if it beats the hurdle (idle-cash yield, or the cheapest eligible loan APR when a cash gap is coming) and the pessimistic forecast stays above the safety buffer between the early-pay date and the due date, counting every other offer taken.',
  };
}

/** Queue an early payment for owner approval, or explain why not. */
function proposeEarlyPayment({ tenantId, actor, billId, source = 'user' }) {
  const actions = require('./actions');
  const tenant = getTenant(tenantId);
  const bill = tenant.payables.find((b) => b.id === billId);
  if (!bill) return { error: 'bill_not_found', status: 404 };
  const s = scan(tenant);
  const o = s.offers.find((x) => x.bill_id === billId) || evaluateBill(tenant, bill);
  if (!o.worth_it) {
    audit.append(tenantId, { actor, action: 'discount.declined', tier: 'SUGGEST', decision: 'deny', target: billId, metadata: { reasons: o.reasons, annualised_return_pct: o.annualised_return_pct ?? null } });
    return { error: 'early_payment_not_advised', status: 409, reasons: o.reasons, why_not: o.why_not, offer: o };
  }
  const r = actions.propose({ tenantId, actor, type: 'schedule_payment', source,
    params: { amount: o.pay_amount, beneficiary_id: o.beneficiary_id, bill_id: o.bill_id, date: o.pay_by, early_pay: { discount_pct: o.discount_pct, original_amount: o.amount, discount_inr: o.discount_inr, annualised_return_pct: o.annualised_return_pct } },
    idempotencyKey: `discount:${o.bill_id}:${tenant.profile.as_of}` });
  if (r.denied) return { error: 'policy_denied', status: 403, reasons: r.verdict.reasons, why_not: explain(r.verdict.reasons, { amount: o.pay_amount }) };
  return { action: r.action, offer: o, duplicate: !!r.duplicate };
}

/** Integrity check used by actions.propose: an early payment must equal the supplier's terms. */
function validEarlyPay(tenant, params) {
  const bill = tenant.payables.find((b) => b.id === params.bill_id);
  if (!bill || !bill.early_pay || bill.status !== 'open') return false;
  const expected = round2(bill.amount - round2(bill.amount * bill.early_pay.discount_pct / 100));
  return Math.abs(Number(params.amount) - expected) < 0.01 && params.date === bill.early_pay.pay_by && toMs(bill.early_pay.pay_by) >= toMs(tenant.profile.as_of);
}

module.exports = { scan, evaluateBill, proposeEarlyPayment, validEarlyPay, annualised, TREASURY_YIELD_PCT };
