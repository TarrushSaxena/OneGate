// ============================================================
// OneGate SME — Financing matcher (explainable eligibility + cost)
// ============================================================
const { LOAN_PRODUCTS, round2 } = require('./data/sandbox');

function emi(principal, aprPct, months) {
  const r = aprPct / 1200;
  if (r === 0) return principal / months;
  return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

/**
 * matchFinancing(tenant, { amount, purpose, urgency_days, forecast, receivables })
 */
function matchFinancing(tenant, need = {}) {
  const p = tenant.profile;
  const amount = Number(need.amount) || 0;
  const urgency = Number(need.urgency_days) || 30;
  const openReceivables = need.receivables ? need.receivables.total_open : 0;
  const results = LOAN_PRODUCTS.map((lp) => {
    const reasons = [];
    const fails = [];
    if (amount < lp.min_amount) fails.push(`amount below product minimum ${lp.min_amount}`);
    if (amount > lp.max_amount) fails.push(`amount above product maximum ${lp.max_amount}`);
    if (p.vintage_months < lp.min_vintage_months) fails.push(`business vintage ${p.vintage_months}m < required ${lp.min_vintage_months}m`);
    else reasons.push(`vintage ${p.vintage_months}m meets ${lp.min_vintage_months}m`);
    if (p.credit_score < lp.min_credit_score) fails.push(`credit score ${p.credit_score} < ${lp.min_credit_score}`);
    else if (lp.min_credit_score) reasons.push(`credit score ${p.credit_score} meets ${lp.min_credit_score}`);
    if (lp.requires_open_receivables) {
      if (openReceivables < amount) fails.push(`open receivables ${Math.round(openReceivables)} do not cover ${amount}`);
      else reasons.push('backed by open receivables');
    }
    if (lp.max_days_to_disburse > urgency) fails.push(`disbursal in ~${lp.max_days_to_disburse} days is slower than the ${urgency}-day need`);
    const tenure = lp.tenure_months.includes(12) ? 12 : lp.tenure_months[lp.tenure_months.length - 1];
    const monthly = amount ? emi(amount, lp.apr, tenure) : 0;
    const totalCost = amount ? monthly * tenure - amount + (amount * lp.processing_fee_pct) / 100 : 0;
    return {
      product_id: lp.id, lender: lp.lender, type: lp.type, apr_pct: lp.apr,
      processing_fee_pct: lp.processing_fee_pct, collateral_required: lp.collateral,
      tenure_months: tenure, est_monthly_payment: round2(monthly), est_total_cost: round2(totalCost),
      disbursal_days: lp.max_days_to_disburse, eligible: fails.length === 0, reasons, blockers: fails,
    };
  });
  const eligible = results.filter((r) => r.eligible).sort((a, b) => a.est_total_cost - b.est_total_cost);
  return {
    tenant_id: p.id, requested_amount: amount, purpose: need.purpose || 'working capital', urgency_days: urgency,
    recommendation: eligible[0] ? { product_id: eligible[0].product_id, why: `Lowest total cost among ${eligible.length} eligible option(s): ${eligible[0].reasons.join('; ')}.` } : null,
    options: [...eligible, ...results.filter((r) => !r.eligible)],
    disclaimer: 'Sandbox products with illustrative terms. Not a credit offer; final terms are set by the lender.',
  };
}

module.exports = { matchFinancing, emi };
