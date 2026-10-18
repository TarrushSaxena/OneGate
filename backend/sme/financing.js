// ============================================================
// OneGate SME — Financing matcher (explainable eligibility + cost)
//
// Two kinds of sandbox product, each costed the way it is actually repaid:
//   - Term loans, overdraft and NBFC lines: equal monthly instalments (EMI),
//     the first one month after the money lands.
//   - TReDS-style invoice discounting (sandbox): the business sells specific
//     not-yet-due, undisputed invoices to a financier. It receives the face
//     value minus interest for the days to each due date and a fee, and the
//     BUYER pays the financier on the invoice due date. There are no
//     instalments, but the business no longer receives those invoices' cash.
// ============================================================
const { LOAN_PRODUCTS, round2, DAY, iso } = require('./data/sandbox');

const toMs = (d) => Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`);

function emi(principal, aprPct, months) {
  const r = aprPct / 1200;
  if (r === 0) return principal / months;
  return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

/** Tenure (months) the matcher prices a term product at: 12 if offered, else the longest. */
function defaultTenure(lp) { return lp.tenure_months.includes(12) ? 12 : lp.tenure_months[lp.tenure_months.length - 1]; }

/**
 * Invoices a TReDS-style financier could buy: open, undisputed, and falling due
 * after the funds land. Furthest due first: that is the cash the business would
 * otherwise wait longest for.
 */
function discountableInvoices(tenant, { exclude = [], disbursalDays = 3 } = {}) {
  const skip = new Set(exclude || []);
  const fundMs = toMs(tenant.profile.as_of) + disbursalDays * DAY;
  return tenant.invoices
    .filter((i) => i.status === 'open' && !i.dispute && !skip.has(i.id) && toMs(i.due) > fundMs)
    .map((i) => ({ invoice_id: i.id, customer: i.customer, face: round2(i.amount), due: i.due, tenor_days: Math.round((toMs(i.due) - fundMs) / DAY) }))
    .sort((a, b) => b.due.localeCompare(a.due) || b.face - a.face || a.invoice_id.localeCompare(b.invoice_id));
}

/** Price a discount of these exact invoices. Funded amount = face value; cash received = face - interest - fee. */
function priceDiscount(lp, invoices) {
  const face = invoices.reduce((a, x) => a + x.face, 0);
  const interest = invoices.reduce((a, x) => a + (x.face * lp.apr / 100) * (x.tenor_days / 365), 0);
  const fee = (face * lp.processing_fee_pct) / 100;
  const net = face - interest - fee;
  const tenor = face ? invoices.reduce((a, x) => a + x.face * x.tenor_days, 0) / face : 0;
  // All-in APR: what the money really costs a year, on the cash actually received (simple, per RBI KFS practice).
  const allIn = net > 0 && tenor > 0 ? ((interest + fee) / net) * (365 / tenor) * 100 : 0;
  return { face: round2(face), interest: round2(interest), fee: round2(fee), net_received: round2(net), avg_tenor_days: Math.round(tenor), all_in_apr_pct: round2(allIn) };
}

/** Choose invoices (furthest due first) whose face value covers `amount`. */
function pickInvoices(tenant, amount, opts = {}) {
  const pool = discountableInvoices(tenant, opts);
  const picked = []; let face = 0;
  for (const x of pool) { if (face >= amount) break; picked.push(x); face += x.face; }
  return { picked, face: round2(face), pool_face: round2(pool.reduce((a, x) => a + x.face, 0)) };
}

/** All-in APR of an instalment loan: the yearly rate at which (amount - fee) received equals the instalments paid. */
function allInAprEmi(amount, ratePct, months, feePct) {
  const m = emi(amount, ratePct, months);
  const received = amount * (1 - feePct / 100);
  const pv = (i) => { let s = 0; for (let k = 1; k <= months; k++) s += m / Math.pow(1 + i, k); return s; };
  let lo = 0; let hi = 1;
  for (let n = 0; n < 80; n++) { const mid = (lo + hi) / 2; if (pv(mid) > received) lo = mid; else hi = mid; }
  return round2(((lo + hi) / 2) * 1200);
}

/**
 * Cash-flow schedule of one financing line, as dated movements on the business's account.
 * Inflow: net cash received on the disbursal date. Outflows: instalments (term products).
 * TReDS-style: no instalments; `exclude_invoices` lists the receipts that now go to the financier.
 */
function scheduleFor(tenant, { product_id, amount, invoice_ids, tenure_months } = {}) {
  const lp = LOAN_PRODUCTS.find((x) => x.id === product_id);
  if (!lp || !(Number(amount) > 0)) return null;
  const asOfMs = toMs(tenant.profile.as_of);
  const fundMs = asOfMs + lp.max_days_to_disburse * DAY;
  if (lp.type === 'invoice_financing') {
    const pool = discountableInvoices(tenant, { disbursalDays: lp.max_days_to_disburse });
    let inv = Array.isArray(invoice_ids) && invoice_ids.length ? pool.filter((x) => invoice_ids.includes(x.invoice_id)) : pickInvoices(tenant, Number(amount), { disbursalDays: lp.max_days_to_disburse }).picked;
    const p = priceDiscount(lp, inv);
    return {
      product_id: lp.id, type: lp.type, amount: p.face, disbursal_date: iso(fundMs),
      movements: [{ date: iso(fundMs), amount: p.net_received, kind: 'discount_proceeds' }],
      exclude_invoices: inv.map((x) => x.invoice_id),
      settlement: inv.map((x) => ({ invoice_id: x.invoice_id, due: x.due, face: x.face, paid_by: 'buyer, to the financier' })),
      cost: round2(p.interest + p.fee), all_in_apr_pct: p.all_in_apr_pct, avg_tenor_days: p.avg_tenor_days,
    };
  }
  const months = tenure_months || defaultTenure(lp);
  const m = emi(Number(amount), lp.apr, months);
  const fee = (Number(amount) * lp.processing_fee_pct) / 100;
  const movements = [{ date: iso(fundMs), amount: round2(Number(amount) - fee), kind: 'disbursal_net_of_fee' }];
  for (let k = 1; k <= months; k++) {
    const d = new Date(fundMs); d.setUTCMonth(d.getUTCMonth() + k);
    movements.push({ date: iso(d.getTime()), amount: -round2(m), kind: 'instalment' });
  }
  return { product_id: lp.id, type: lp.type, amount: Number(amount), disbursal_date: iso(fundMs), movements, exclude_invoices: [], cost: round2(m * months - Number(amount) + fee), all_in_apr_pct: allInAprEmi(Number(amount), lp.apr, months, lp.processing_fee_pct), instalment: round2(m), tenure_months: months };
}

/**
 * matchFinancing(tenant, { amount, purpose, urgency_days, receivables, exclude_invoices })
 */
function matchFinancing(tenant, need = {}) {
  const p = tenant.profile;
  const amount = Number(need.amount) || 0;
  const urgency = Number(need.urgency_days) || 30;
  const results = LOAN_PRODUCTS.map((lp) => {
    const reasons = [];
    const fails = [];
    if (amount < lp.min_amount) fails.push(`amount below product minimum ${lp.min_amount}`);
    if (amount > lp.max_amount) fails.push(`amount above product maximum ${lp.max_amount}`);
    if (p.vintage_months < lp.min_vintage_months) fails.push(`business vintage ${p.vintage_months}m < required ${lp.min_vintage_months}m`);
    else reasons.push(`vintage ${p.vintage_months}m meets ${lp.min_vintage_months}m`);
    if (p.credit_score < lp.min_credit_score) fails.push(`credit score ${p.credit_score} < ${lp.min_credit_score}`);
    else if (lp.min_credit_score) reasons.push(`credit score ${p.credit_score} meets ${lp.min_credit_score}`);
    let disc = null;
    if (lp.requires_open_receivables) {
      const pk = pickInvoices(tenant, amount, { exclude: need.exclude_invoices, disbursalDays: lp.max_days_to_disburse });
      if (pk.pool_face < amount) fails.push(`not-yet-due invoices that can be discounted total ${Math.round(pk.pool_face)}, less than ${amount}`);
      else { reasons.push('backed by not-yet-due invoices, repaid by the buyers on their due dates'); disc = { invoices: pk.picked, ...priceDiscount(lp, pk.picked) }; }
    }
    if (lp.max_days_to_disburse > urgency) fails.push(`disbursal in ~${lp.max_days_to_disburse} days is slower than the ${urgency}-day need`);
    if (lp.type === 'invoice_financing') {
      // Cost of discounting invoices worth `amount` (pro rata if the last invoice is larger than needed).
      const scale = disc && disc.face ? amount / disc.face : 0;
      const cost = disc ? (disc.interest + disc.fee) * scale : 0;
      return {
        product_id: lp.id, lender: lp.lender, type: lp.type, apr_pct: lp.apr, rate_pct: lp.apr,
        all_in_apr_pct: disc ? disc.all_in_apr_pct : null, processing_fee_pct: lp.processing_fee_pct, collateral_required: lp.collateral,
        tenure_months: null, tenor_days: disc ? disc.avg_tenor_days : null, repayment: 'buyer pays the financier on each invoice due date; no instalments',
        est_monthly_payment: 0, est_total_cost: round2(cost),
        invoices_to_discount: disc ? disc.invoices.map((x) => x.invoice_id) : [],
        disbursal_days: lp.max_days_to_disburse, eligible: fails.length === 0, reasons, blockers: fails,
      };
    }
    const tenure = defaultTenure(lp);
    const monthly = amount ? emi(amount, lp.apr, tenure) : 0;
    const totalCost = amount ? monthly * tenure - amount + (amount * lp.processing_fee_pct) / 100 : 0;
    return {
      product_id: lp.id, lender: lp.lender, type: lp.type, apr_pct: lp.apr, rate_pct: lp.apr,
      all_in_apr_pct: amount ? allInAprEmi(amount, lp.apr, tenure, lp.processing_fee_pct) : null,
      processing_fee_pct: lp.processing_fee_pct, collateral_required: lp.collateral,
      tenure_months: tenure, repayment: `${tenure} monthly instalments, the first one month after disbursal`,
      est_monthly_payment: round2(monthly), est_total_cost: round2(totalCost),
      disbursal_days: lp.max_days_to_disburse, eligible: fails.length === 0, reasons, blockers: fails,
    };
  });
  const eligible = results.filter((r) => r.eligible).sort((a, b) => a.est_total_cost - b.est_total_cost);
  return {
    tenant_id: p.id, requested_amount: amount, purpose: need.purpose || 'working capital', urgency_days: urgency,
    recommendation: eligible[0] ? { product_id: eligible[0].product_id, why: `Lowest total cost among ${eligible.length} eligible option(s): ${eligible[0].reasons.join('; ')}.` } : null,
    options: [...eligible, ...results.filter((r) => !r.eligible)],
    disclaimer: 'Sandbox products with illustrative terms. Not a credit offer; final terms are set by the lender. Costs are over different tenors (TReDS-style: days to each invoice due date; others: 12 months).',
  };
}

module.exports = { matchFinancing, emi, scheduleFor, discountableInvoices, pickInvoices, priceDiscount, allInAprEmi, defaultTenure };
