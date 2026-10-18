// ============================================================
// OneGate SME — What-if stress test (READ only)
// Re-runs the same forecaster with the owner's "what if" changes:
// the biggest debtors pay later, sales drop, supplier costs rise,
// a one-off expense lands. Nothing is stored or queued; the answer
// is the new low point, whether it breaks the buffer, how much cash
// would be needed, and the cheapest eligible financing (as advice).
// ============================================================
const { forecast } = require('./forecast');
const { receivables } = require('./receivables');
const { matchFinancing } = require('./financing');
const { withCalibratedBand } = require('./calibrate');
const { DAY, iso } = require('./data/sandbox');

const LIMITS = { debtor_delay_days: [0, 90], top_debtors: [1, 5], sales_change_pct: [-50, 30], supplier_cost_change_pct: [-20, 50], one_off_expense: [0, 2000000], one_off_in_days: [1, 45] };
const clamp = (v, [lo, hi], d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const toMs = (d) => Date.parse(`${d}T00:00:00Z`);

function normalise(input = {}) {
  return {
    debtor_delay_days: Math.round(clamp(input.debtor_delay_days, LIMITS.debtor_delay_days)),
    top_debtors: Math.round(clamp(input.top_debtors, LIMITS.top_debtors, 3)),
    sales_change_pct: clamp(input.sales_change_pct, LIMITS.sales_change_pct),
    supplier_cost_change_pct: clamp(input.supplier_cost_change_pct, LIMITS.supplier_cost_change_pct),
    one_off_expense: Math.round(clamp(input.one_off_expense, LIMITS.one_off_expense)),
    one_off_in_days: Math.round(clamp(input.one_off_in_days, LIMITS.one_off_in_days, 7)),
  };
}

function lowOf(f, days) {
  const s = f.series.slice(0, days);
  const m = s.reduce((a, b) => (b.low < a.low ? b : a), s[0]);
  const breach = s.find((p) => p.low < f.safety_buffer);
  return { lowest: { date: m.date, low: Math.round(m.low) }, first_breach: breach ? breach.date : null };
}

function whatIf(tenant, input = {}, horizon = 45) {
  const w = normalise(input);
  const asOfMs = toMs(tenant.profile.as_of);
  // Biggest debtors by overdue amount (customers, not invoices).
  const byCust = {};
  for (const i of receivables(tenant).top_overdue) byCust[i.customer] = (byCust[i.customer] || 0) + i.amount;
  const delayed = Object.entries(byCust).sort((a, b) => b[1] - a[1]).slice(0, w.top_debtors).map(([c]) => c);
  const adjust = {
    sales_change_pct: w.sales_change_pct,
    supplier_cost_change_pct: w.supplier_cost_change_pct,
    delay_customers: w.debtor_delay_days ? Object.fromEntries(delayed.map((c) => [c, w.debtor_delay_days])) : {},
    extra_outflows: w.one_off_expense ? [{ date: iso(asOfMs + w.one_off_in_days * DAY), amount: w.one_off_expense }] : [],
  };
  const before = forecast(tenant, { horizon: 90 });
  const after = forecast(tenant, { horizon: 90, adjust });
  const b = lowOf(before, horizon); const a = lowOf(after, horizon);
  const gap = Math.max(0, Math.round(after.safety_buffer - a.lowest.low));
  let financing = null;
  if (gap > 0) {
    const m = matchFinancing(tenant, { amount: Math.ceil(gap / 10000) * 10000, urgency_days: Math.max(1, Math.round((toMs(a.first_breach || a.lowest.date) - asOfMs) / DAY)), receivables: receivables(tenant) });
    const r = m.recommendation && m.options.find((o) => o.product_id === m.recommendation.product_id);
    financing = r ? { product_id: r.product_id, lender: r.lender, apr_pct: r.apr_pct, all_in_apr_pct: r.all_in_apr_pct, amount: Math.ceil(gap / 10000) * 10000, est_total_cost: r.est_total_cost, disbursal_days: r.disbursal_days } : { none_eligible: true };
  }
  const cal = withCalibratedBand(tenant, after);
  return {
    inputs: w,
    delayed_customers: w.debtor_delay_days ? delayed : [],
    horizon_days: horizon,
    safety_buffer: after.safety_buffer,
    before: b,
    after: a,
    change_in_low: a.lowest.low - b.lowest.low,
    cash_needed_to_hold_buffer: gap,
    cheapest_financing: financing,
    series: cal.series.slice(0, 90).map((p, i) => ({ date: p.date, low: Math.round(p.low), base: Math.round(p.base), cal_low: p.cal_low, before_low: Math.round(before.series[i].low) })),
    note: 'Simulation only: nothing is queued, paid or sent. To act, run "Plan my cash gap" and approve the cards.',
  };
}

module.exports = { whatIf, normalise, LIMITS };
