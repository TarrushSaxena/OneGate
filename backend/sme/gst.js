// ============================================================
// OneGate SME: GST-aware cash planning (India)
// GST is the one outflow every Indian SME can't move. This module puts it
// on the cash calendar and checks whether the money will be there:
//   * GSTR-3B due dates (monthly filers: the 20th of the following month)
//   * net cash payable = output tax - input tax credit (ITC); the net figure
//     is the same one the cash forecast already subtracts on the 20th
//   * ITC at risk: since 1 Oct 2022 (s.16(2)(aa) CGST Act) ITC is available
//     only if the supplier's invoice appears in your GSTR-2B. A supplier that
//     has not filed GSTR-1 pushes that credit to a later month, so this
//     month's cash payment goes up by that amount (deferred, not lost)
//   * coverage on each due date in the pessimistic forecast, with and
//     without the at-risk ITC
//   * the cost of paying late: 18% a year interest on the net cash liability
//     (s.50) + ₹50/day late fee (s.47), capped by turnover
// Rates and caps are indicative sandbox figures, not tax advice.
// ============================================================
const { DAY, iso, round2 } = require('./data/sandbox');
const { forecast } = require('./forecast');

const LATE = { interest_pct_pa: 18, fee_per_day: 50 };
const toMs = (d) => Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`);
const monthKey = (ms) => iso(ms).slice(0, 7);
const prevMonth = (ms) => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1); };

function annualTurnover(tenant) {
  const asOf = toMs(tenant.profile.as_of);
  const from = asOf - 180 * DAY;
  const inflow = tenant.transactions.filter((t) => toMs(t.date) > from && toMs(t.date) <= asOf && (t.category === 'sales_upi_card' || t.category === 'invoice_receipt')).reduce((a, t) => a + t.amount, 0);
  return round2(inflow * (365 / 180));
}
function lateFeeCap(turnover) { return turnover <= 15000000 ? 2000 : turnover <= 50000000 ? 5000 : 10000; }

function supplierSpend(tenant, month, onlySuppliers = null) {
  return tenant.transactions.filter((t) => t.category === 'supplier' && t.date.slice(0, 7) === month && (!onlySuppliers || onlySuppliers.includes(t.counterparty))).reduce((a, t) => a - t.amount, 0);
}

/** calendar(tenant) -> GST due dates in the forecast horizon, liability split, coverage and late cost. */
function calendar(tenant, { horizon = 90, f = null } = {}) {
  const g = tenant.gst || { output_rate_pct: 18, input_rate_pct: 18, itc_allowed: true, filer: 'monthly', gstr1_pending: [] };
  const fc = f || forecast(tenant, { horizon });
  const asOf = toMs(tenant.profile.as_of);
  const net = tenant.recurring.gst.amount;           // same figure the forecast subtracts
  const day = tenant.recurring.gst.day;
  const share = g.input_rate_pct / (100 + g.input_rate_pct);
  const turnover = annualTurnover(tenant);
  const cap = lateFeeCap(turnover);

  // ITC baseline: average of the last three complete months of supplier purchases.
  const months = [1, 2, 3].map((k) => { const d = new Date(asOf); return monthKey(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - k, 1)); });
  const avgItc = g.itc_allowed ? round2(months.reduce((a, m) => a + supplierSpend(tenant, m) * share, 0) / months.length) : 0;

  const dues = [];
  for (let d = 1; d <= horizon; d++) {
    const ms = asOf + d * DAY;
    if (new Date(ms).getUTCDate() !== day) continue;
    const period = monthKey(prevMonth(ms));
    const periodItc = g.itc_allowed ? round2(supplierSpend(tenant, period) * share) : 0;
    const itc = periodItc > 0 ? periodItc : avgItc; // future periods have no purchases yet: use the average
    const atRisk = g.itc_allowed && g.gstr1_pending.length && dues.length === 0
      ? round2(Math.min(itc, (periodItc > 0 ? supplierSpend(tenant, period, g.gstr1_pending) : supplierSpend(tenant, months[0], g.gstr1_pending)) * share))
      : 0;
    const point = fc.series.find((p) => p.date === iso(ms));
    const lowAfter = point ? point.low : null;          // forecast already paid GST on this date
    const lowIfItcBlocked = lowAfter === null ? null : round2(lowAfter - atRisk);
    const status = lowAfter === null ? 'unknown' : lowAfter < fc.safety_buffer ? 'short' : lowIfItcBlocked < fc.safety_buffer ? 'tight' : 'covered';
    const weekLate = round2(net * LATE.interest_pct_pa / 100 * 7 / 365 + Math.min(LATE.fee_per_day * 7, cap));
    dues.push({
      return: 'GSTR-3B', period, due: iso(ms), days_away: d,
      output_tax: round2(net + itc), itc_claimed: itc, net_cash_payable: net,
      itc_at_risk: atRisk, itc_at_risk_from: atRisk ? g.gstr1_pending : [],
      cash_low_after_payment: lowAfter === null ? null : Math.round(lowAfter),
      cash_low_if_itc_blocked: lowIfItcBlocked === null ? null : Math.round(lowIfItcBlocked),
      status, cost_if_paid_7_days_late: weekLate,
    });
  }
  const next = dues[0] || null;
  const advice = [];
  if (!g.itc_allowed) advice.push('Your GST rate (5% restaurant service) does not allow input tax credit, so GST is paid in full in cash every month.');
  if (next && next.itc_at_risk > 0) advice.push(`${next.itc_at_risk_from.join(', ')} has not filed GSTR-1 yet. Ask them to file before your GSTR-2B is generated, or ${fmt(next.itc_at_risk)} of credit moves to a later month and your ${next.due} payment rises by that amount.`);
  if (next && next.status === 'short') advice.push(`Cash on ${next.due} is below your safety buffer even after this payment is planned. Never delay GST to save cash: paying a week late costs about ${fmt(next.cost_if_paid_7_days_late)} plus 18% a year interest, more than the cheapest sandbox loan.`);
  if (next && next.status === 'tight') advice.push(`You can pay GST on ${next.due}, but if the at-risk credit is blocked, cash dips below your buffer.`);
  if (next && next.status === 'covered') advice.push(`GST of ${fmt(next.net_cash_payable)} on ${next.due} is covered and leaves your safety buffer intact${next.itc_at_risk ? ', even if the at-risk credit is blocked' : ''}.`);
  return {
    tenant_id: tenant.profile.id, as_of: tenant.profile.as_of, filer: g.filer,
    output_rate_pct: g.output_rate_pct, itc_allowed: g.itc_allowed, annual_turnover_est: Math.round(turnover), late_fee_cap: cap,
    safety_buffer: fc.safety_buffer, dues, next, advice,
    basis: 'GSTR-3B due on the 20th for monthly filers; ITC only for invoices in GSTR-2B (s.16(2)(aa) CGST Act); interest 18% p.a. on net cash liability paid late (s.50); late fee ₹50/day capped by turnover (s.47). Indicative sandbox figures, not tax advice.',
  };
}

const fmt = (n) => `${n < 0 ? '-' : ''}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;

module.exports = { calendar, annualTurnover, lateFeeCap, LATE };
