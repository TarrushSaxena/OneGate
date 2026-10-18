// ============================================================
// OneGate SME — Forecast bands calibrated on past errors
// Conformal-style quantiles, calibrated in-sample: run the forecaster from many past start
// dates (walk-forward), record how far the actual balance landed
// from the base case at each horizon, and take empirical quantiles
// of those errors. The band then says "in our own backtest, the
// actual balance fell inside this range about 80% of the time".
// Honest limits: one SME's history, overlapping windows (errors are
// correlated), and the 80% is measured on the same runs that set the
// band (no held-out split), so it is an empirical band, not a guarantee.
// heldOutCoverage() gives the honest out-of-sample check: calibrate on the
// older half of start dates, score the newer half.
// ============================================================
const { forecast, balanceAt } = require('./forecast');
const { DAY, iso } = require('./data/sandbox');

const toMs = (d) => Date.parse(`${d}T00:00:00Z`);
const BUCKETS = [[1, 15], [16, 30], [31, 45]];
const ALPHA = 0.2;          // 80% two-sided band
const STEP_DAYS = 3;        // spacing between walk-forward start dates
const LOOKBACK_MIN = 90;    // the forecaster needs 90 days of history
const cache = new Map();

// Finite-sample conformal quantile: the ceil((n+1)q)-th smallest value.
function cq(sorted, q) {
  const n = sorted.length;
  if (!n) return 0;
  const k = Math.min(n, Math.max(1, Math.ceil((n + 1) * q)));
  return sorted[k - 1];
}

function calibrate(tenant) {
  const key = `${tenant.profile.id}:${tenant.profile.as_of}:${tenant.transactions.length}`;
  if (cache.has(key)) return cache.get(key);
  const endMs = toMs(tenant.profile.as_of);
  const firstMs = toMs(tenant.transactions[0].date) + LOOKBACK_MIN * DAY;
  const res = BUCKETS.map(() => []);
  let origins = 0;
  for (let o = endMs - 15 * DAY; o >= firstMs; o -= STEP_DAYS * DAY) {
    const maxH = Math.min(45, Math.round((endMs - o) / DAY));
    const f = forecast(tenant, { horizon: maxH, asOf: iso(o), raw: true });
    origins += 1;
    f.series.forEach((p, i) => {
      const h = i + 1;
      const b = BUCKETS.findIndex(([lo, hi]) => h >= lo && h <= hi);
      if (b < 0) return;
      res[b].push(balanceAt(tenant.transactions, toMs(p.date), tenant.profile.opening_balance) - p.base);
    });
  }
  const buckets = BUCKETS.map(([lo, hi], b) => {
    const s = res[b].slice().sort((x, y) => x - y);
    return { days: [lo, hi], n: s.length, q_low: Math.round(cq(s, ALPHA / 2)), q_high: Math.round(cq(s, 1 - ALPHA / 2)), median_error: Math.round(s.length ? s[Math.floor(s.length / 2)] : 0) };
  });
  const out = { method: 'walk-forward residual quantiles (finite-sample conformal quantile, calibrated in-sample: no held-out split)', target_coverage_pct: (1 - ALPHA) * 100, step_days: STEP_DAYS, origins, buckets,
    caveat: 'Empirical band from this business\'s own backtest; start dates overlap, so errors are correlated. Beyond 45 days the 31-45 day band is widened by sqrt(h/45).' };
  cache.set(key, out);
  return out;
}

function bandFor(cal, h) {
  const b = cal.buckets.find((x) => h >= x.days[0] && h <= x.days[1]);
  if (b) return b;
  const last = cal.buckets[cal.buckets.length - 1];
  const k = Math.sqrt(h / 45);
  return { q_low: Math.round(last.q_low * k), q_high: Math.round(last.q_high * k), n: last.n, widened: true };
}

/** Add calibrated low/high to a forecast series, plus coverage stats on the calibration set. */
function withCalibratedBand(tenant, f) {
  const cal = calibrate(tenant);
  const series = f.series.map((p, i) => { const b = bandFor(cal, i + 1); return { ...p, cal_low: Math.round(p.base + b.q_low), cal_high: Math.round(p.base + b.q_high) }; });
  const h30 = series[Math.min(29, series.length - 1)];
  const minCal = series.slice(0, 45).reduce((a, b) => (b.cal_low < a.cal_low ? b : a), series[0]);
  return {
    series,
    calibration: {
      ...cal,
      in_sample: true,
      held_out: heldOutCoverage(tenant),
      lowest_cal_low_45d: { date: minCal.date, low: minCal.cal_low },
      day30: { scenario_low: Math.round(h30.scenario_low ?? h30.low), calibrated_low: h30.cal_low, safety_low: Math.round(h30.low), policy_is_more_cautious: h30.low <= h30.cal_low },
    },
  };
}

/** Coverage of the calibrated band on the calibration windows themselves (sanity check). */
function empiricalCoverage(tenant) {
  const cal = calibrate(tenant);
  const endMs = toMs(tenant.profile.as_of);
  const firstMs = toMs(tenant.transactions[0].date) + LOOKBACK_MIN * DAY;
  let inside = 0; let n = 0;
  for (let o = endMs - 15 * DAY; o >= firstMs; o -= STEP_DAYS * DAY) {
    const maxH = Math.min(45, Math.round((endMs - o) / DAY));
    forecast(tenant, { horizon: maxH, asOf: iso(o), raw: true }).series.forEach((p, i) => {
      const b = bandFor(cal, i + 1);
      const a = balanceAt(tenant.transactions, toMs(p.date), tenant.profile.opening_balance);
      n += 1; if (a >= p.base + b.q_low && a <= p.base + b.q_high) inside += 1;
    });
  }
  return { n, coverage_pct: n ? Math.round((inside / n) * 1000) / 10 : 0 };
}

/**
 * Held-out check: calibrate the bands on the OLDER half of the walk-forward start dates and
 * measure how often the actual balance fell inside them on the NEWER half. This is the number
 * to quote as "out of sample"; the 80% target is only guaranteed in-sample.
 */
const heldCache = new Map();
function heldOutCoverage(tenant) {
  const key = `${tenant.profile.id}:${tenant.profile.as_of}:${tenant.transactions.length}`;
  if (heldCache.has(key)) return heldCache.get(key);
  const endMs = toMs(tenant.profile.as_of);
  const firstMs = toMs(tenant.transactions[0].date) + LOOKBACK_MIN * DAY;
  const origins = [];
  for (let o = endMs - 15 * DAY; o >= firstMs; o -= STEP_DAYS * DAY) origins.push(o);
  const rows = origins.map((o) => {
    const maxH = Math.min(45, Math.round((endMs - o) / DAY));
    return forecast(tenant, { horizon: maxH, asOf: iso(o), raw: true }).series.map((p, i) => ({ h: i + 1, e: balanceAt(tenant.transactions, toMs(p.date), tenant.profile.opening_balance) - p.base }));
  });
  const half = Math.floor(origins.length / 2); // origins run newest first
  const test = rows.slice(0, half).flat(); const calib = rows.slice(half).flat();
  let inside = 0; let n = 0;
  for (const [lo, hi] of BUCKETS) {
    const sorted = calib.filter((r) => r.h >= lo && r.h <= hi).map((r) => r.e).sort((a, b) => a - b);
    const ql = cq(sorted, ALPHA / 2); const qh = cq(sorted, 1 - ALPHA / 2);
    for (const r of test.filter((x) => x.h >= lo && x.h <= hi)) { n += 1; if (r.e >= ql && r.e <= qh) inside += 1; }
  }
  const out = { calibration_origins: origins.length - half, test_origins: half, n, coverage_pct: n ? Math.round((inside / n) * 1000) / 10 : 0 };
  heldCache.set(key, out);
  return out;
}

module.exports = { calibrate, withCalibratedBand, empiricalCoverage, heldOutCoverage, bandFor, cq };
