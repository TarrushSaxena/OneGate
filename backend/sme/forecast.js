// ============================================================
// OneGate SME — Cash-flow forecaster (30/60/90 days)
// Transparent, explainable model: day-of-week sales baseline +
// calendar-recurring obligations + probability-weighted receivables
// + scheduled payables. Returns base / low / high scenarios.
// ============================================================

const { DAY, iso, round2 } = require('./data/sandbox');

const toMs = (d) => Date.parse(`${d}T00:00:00Z`);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

function customerStats(invoices, asOfMs) {
  const stats = {};
  for (const inv of invoices) {
    const s = (stats[inv.customer] ||= { paid: 0, defaulted: 0, delays: [] });
    const paidMs = inv.paid_on ? toMs(inv.paid_on) : null;
    if (paidMs && paidMs <= asOfMs) {
      s.paid += 1;
      s.delays.push((paidMs - toMs(inv.due)) / DAY);
    } else if ((asOfMs - toMs(inv.due)) / DAY > 60) {
      s.defaulted += 1;
    }
  }
  const out = {};
  for (const [name, s] of Object.entries(stats)) {
    const n = s.paid + s.defaulted;
    out[name] = {
      pay_probability: n ? round2((s.paid + 1) / (n + 2)) : 0.7, // Laplace-smoothed
      avg_delay_days: s.delays.length ? Math.round(mean(s.delays)) : 15,
      history: n,
    };
  }
  return out;
}

function baseline(transactions, asOfMs, lookbackDays = 90) {
  const from = asOfMs - lookbackDays * DAY;
  const win = transactions.filter((t) => { const m = toMs(t.date); return m > from && m <= asOfMs; });
  const salesByDow = Array.from({ length: 7 }, () => []);
  const daysByDow = Array(7).fill(0);
  for (let m = from + DAY; m <= asOfMs; m += DAY) daysByDow[new Date(m).getUTCDay()] += 1;
  const sums = Array(7).fill(0);
  for (const t of win) if (t.category === 'sales_upi_card') sums[new Date(toMs(t.date)).getUTCDay()] += t.amount;
  for (let d = 0; d < 7; d++) salesByDow[d] = daysByDow[d] ? sums[d] / daysByDow[d] : 0;
  const supplier = win.filter((t) => t.category === 'supplier').map((t) => -t.amount);
  const supplierWeekly = supplier.length ? supplier.reduce((a, b) => a + b, 0) / (lookbackDays / 7) : 0;
  const util = win.filter((t) => t.category === 'utilities').map((t) => -t.amount);
  const receipts = win.filter((t) => t.category === 'invoice_receipt').reduce((a, t) => a + t.amount, 0);
  return { salesByDow, supplierWeekly, utilitiesMonthly: mean(util), receiptsDaily: receipts / lookbackDays };
}

function balanceAt(transactions, asOfMs, openingBalance) {
  let bal = openingBalance;
  for (const t of transactions) if (toMs(t.date) <= asOfMs) bal += t.amount;
  return round2(bal);
}

/**
 * forecast(tenant, { horizon, asOf, safetyBuffer })
 */
function forecast(tenant, opts = {}) {
  const horizon = opts.horizon || 90;
  const asOfMs = opts.asOf ? toMs(opts.asOf) : toMs(tenant.profile.as_of);
  const start = balanceAt(tenant.transactions, asOfMs, tenant.profile.opening_balance);
  const base = baseline(tenant.transactions, asOfMs);
  const cust = customerStats(tenant.invoices, asOfMs);
  const rec = tenant.recurring;
  const fixedMonthly = rec.payroll.amount + rec.rent.amount + rec.gst.amount;
  const safetyBuffer = opts.safetyBuffer ?? round2(fixedMonthly * 0.5);

  // Receivables that were open as of the forecast date
  const openInv = tenant.invoices.filter((i) => toMs(i.issued) <= asOfMs && (!i.paid_on || toMs(i.paid_on) > asOfMs));
  const expectedInflows = openInv.map((i) => {
    const s = cust[i.customer] || { pay_probability: 0.7, avg_delay_days: 15 };
    let expMs = toMs(i.due) + s.avg_delay_days * DAY;
    let p = s.pay_probability;
    if (expMs <= asOfMs) {
      // Past the customer's usual pay date: probability decays with each extra day late,
      // and the remaining expectation is spread over the next 1-3 weeks.
      const lateBeyondUsual = (asOfMs - expMs) / DAY;
      p = p * Math.exp(-lateBeyondUsual / 20);
      const spread = [...i.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 14;
      expMs = asOfMs + (7 + spread) * DAY;
    }
    return { invoice: i.id, customer: i.customer, amount: i.amount, expected_date: iso(expMs), probability: round2(p) };
  });
  // Scheduled (approved, not yet settled) bills still leave the account on their due date.
  const payables = (opts.asOf ? [] : tenant.payables.filter((b) => b.status === 'open' || b.status === 'scheduled'));

  const scen = { base: start, low: start, high: start };
  const series = [];
  const drivers = { sales: 0, receivables: 0, supplier: 0, payroll: 0, rent: 0, gst: 0, utilities: 0, payables: 0 };
  for (let d = 1; d <= horizon; d++) {
    const m = asOfMs + d * DAY;
    const dt = new Date(m);
    const day = iso(m);
    const sales = base.salesByDow[dt.getUTCDay()];
    let fixedOut = 0;
    if (dt.getUTCDate() === rec.rent.day) { fixedOut += rec.rent.amount; drivers.rent -= rec.rent.amount; }
    if (dt.getUTCDate() === rec.payroll.day) { fixedOut += rec.payroll.amount; drivers.payroll -= rec.payroll.amount; }
    if (dt.getUTCDate() === rec.gst.day) { fixedOut += rec.gst.amount; drivers.gst -= rec.gst.amount; }
    if (dt.getUTCDate() === 15) { fixedOut += base.utilitiesMonthly; drivers.utilities -= base.utilitiesMonthly; }
    const supplierOut = dt.getUTCDay() === 2 ? base.supplierWeekly : 0;
    drivers.supplier -= supplierOut;
    drivers.sales += sales;
    let invBase = 0, invLow = 0, invHigh = 0;
    for (const e of expectedInflows) if (e.expected_date === day) {
      invBase += e.amount * e.probability;
      invLow += e.amount * e.probability * 0.7;
      invHigh += e.amount * Math.min(1, e.probability * 1.3);
    }
    // Collections from invoices not yet issued: run-rate, ramped in as the open book is consumed.
    const ramp = Math.min(1, d / 45);
    const future = base.receiptsDaily * ramp;
    invBase += future; invLow += future * 0.8; invHigh += future * 1.1;
    drivers.receivables += invBase;
    let payOut = 0;
    for (const b of payables) if (b.due === day) payOut += b.amount;
    drivers.payables -= payOut;

    scen.base += sales + invBase - fixedOut - supplierOut - payOut;
    scen.low += sales * 0.9 + invLow - fixedOut - supplierOut * 1.05 - payOut;
    scen.high += sales * 1.1 + invHigh - fixedOut - supplierOut * 0.95 - payOut;
    series.push({ date: day, base: round2(scen.base), low: round2(scen.low), high: round2(scen.high) });
  }

  const at = (n) => series[Math.min(n, series.length) - 1];
  const minPoint = series.reduce((a, b) => (b.low < a.low ? b : a), series[0]);
  const firstBreach = series.find((p) => p.low < safetyBuffer) || null;
  const firstNegative = series.find((p) => p.base < 0) || null;
  Object.keys(drivers).forEach((k) => { drivers[k] = round2(drivers[k]); });

  return {
    tenant_id: tenant.profile.id,
    as_of: iso(asOfMs),
    currency: tenant.profile.currency,
    starting_balance: start,
    safety_buffer: safetyBuffer,
    horizons: [30, 60, 90].filter((h) => h <= horizon).map((h) => ({ days: h, ...at(h) })),
    lowest_point: { date: minPoint.date, low: minPoint.low },
    alerts: [
      ...(firstBreach ? [{ type: 'buffer_breach', severity: firstBreach.base < safetyBuffer ? 'high' : 'medium', date: firstBreach.date,
        message: `Cash may fall below the safety buffer (₹${Math.round(safetyBuffer).toLocaleString('en-IN')}) around ${firstBreach.date} in the pessimistic case.` }] : []),
      ...(firstNegative ? [{ type: 'negative_balance', severity: 'critical', date: firstNegative.date, message: `Base case goes negative on ${firstNegative.date}.` }] : []),
    ],
    drivers_90d: drivers,
    expected_receivables: expectedInflows.sort((a, b) => a.expected_date.localeCompare(b.expected_date)),
    method: 'Day-of-week sales baseline (90-day lookback) + calendar obligations + run-rate collections from future invoices (ramped over 45 days) + Laplace-smoothed per-customer pay probability and delay (decaying once an invoice is later than the customer norm) + scheduled payables. Low case: -10% sales, receivables at 70% of expected value, +5% supplier spend. High case: +10% sales, receivables at 130% of expected value (capped at face value).',
    series,
  };
}

/** Walk-forward backtest: forecast from asOf-N days and compare base case to actual balances. */
function backtest(tenant, days = 30) {
  const endMs = toMs(tenant.profile.as_of);
  const cutoff = iso(endMs - days * DAY);
  const f = forecast(tenant, { horizon: days, asOf: cutoff });
  const errs = [];
  let inBand = 0;
  for (const p of f.series) {
    const actual = balanceAt(tenant.transactions, toMs(p.date), tenant.profile.opening_balance);
    if (Math.abs(actual) > 1) errs.push(Math.abs(p.base - actual) / Math.abs(actual));
    if (actual >= p.low - 1 && actual <= p.high + 1) inBand += 1;
  }
  return { tenant_id: tenant.profile.id, cutoff, days, mape_pct: round2(mean(errs) * 100), band_coverage_pct: round2((inBand / f.series.length) * 100) };
}

module.exports = { forecast, backtest, customerStats, balanceAt };
