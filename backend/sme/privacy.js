// ============================================================
// OneGate SME — "Share the score, not the books"
// When an SME applies for credit, the lender gets a small set of derived,
// banded features plus a SHA-256 commitment to the ledger they were computed
// from. Raw transactions, customer names and invoice notes never leave the
// tenant. The commitment lets an auditor later prove the features came from
// the ledger the SME held at consent time, without the lender storing it.
// This is the data-minimisation half of a privacy-preserving lending design;
// the federated half (lenders training a shared risk model across SMEs with
// FATE-style horizontal FL, without pooling ledgers) is described in
// docs/AGENTIC_COPILOT.md and is not built here.
// ============================================================
const crypto = require('crypto');
const { receivables } = require('./receivables');

const band = (v, edges, labels) => labels[edges.findIndex((e) => v < e) === -1 ? labels.length - 1 : edges.findIndex((e) => v < e)];

function monthlyInflows(tenant) {
  const by = new Map();
  for (const t of tenant.transactions || []) {
    if (!(t.amount > 0)) continue;
    const k = String(t.date).slice(0, 7);
    by.set(k, (by.get(k) || 0) + t.amount);
  }
  return [...by.values()];
}

function lenderShare(tenant) {
  const p = tenant.profile;
  const inflows = monthlyInflows(tenant);
  const mean = inflows.length ? inflows.reduce((a, b) => a + b, 0) / inflows.length : 0;
  const sd = inflows.length ? Math.sqrt(inflows.reduce((a, b) => a + (b - mean) ** 2, 0) / inflows.length) : 0;
  const cv = mean ? sd / mean : 1;
  const r = receivables(tenant);
  const overdueShare = r.total_open ? r.total_overdue / r.total_open : 0;
  const features = {
    business_vintage_band: band(p.vintage_months, [24, 60, 120], ['<2y', '2-5y', '5-10y', '10y+']),
    credit_score_band: band(p.credit_score, [650, 700, 750, 800], ['<650', '650-699', '700-749', '750-799', '800+']),
    avg_monthly_inflow_band_inr: band(mean, [5e5, 2e6, 5e6, 2e7], ['<5L', '5L-20L', '20L-50L', '50L-2Cr', '2Cr+']),
    inflow_volatility: band(cv, [0.15, 0.35], ['low', 'medium', 'high']),
    receivables_overdue_share: band(overdueShare, [0.2, 0.5], ['low', 'medium', 'high']),
    gst_registered: !!p.gst_registered,
  };
  const ledgerCommitment = crypto.createHash('sha256')
    .update(JSON.stringify((tenant.transactions || []).map((t) => [t.date, t.amount, t.category])))
    .digest('hex');
  return {
    fields_shared: Object.keys(features),
    features,
    ledger_commitment_sha256: ledgerCommitment,
    withheld: ['transactions', 'customer_names', 'invoice_notes', 'beneficiary_accounts', 'exact_balances'],
  };
}

module.exports = { lenderShare };
