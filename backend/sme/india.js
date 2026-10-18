// ============================================================
// OneGate SME — India rules pack (deterministic, sandbox terms)
//   1. s.43B(h) Income-tax Act: a buyer may deduct a payment owed to a
//      Udyam-registered MICRO or SMALL enterprise (manufacturer or service
//      provider; traders are excluded) only in the year it is actually
//      paid, if it pays after the MSMED Act s.15 limit (15 days without a
//      written agreement, at most 45 days with one). It is a timing
//      penalty for the buyer, not a permanent loss.
//   2. TDS on receivables: B2B service buyers deduct TDS before paying, so
//      cash in = invoice minus TDS (claimable later as a tax credit via 26AS).
//   3. Statutory calendar: TDS deposit (7th), GSTR-1 (11th), PF and ESIC
//      (15th), GSTR-3B (20th), advance tax instalments.
//   4. Key Facts Statement for loans (RBI digital-lending rules): all-in
//      APR including fees, penal charges (never compounded), cooling-off
//      period, regulated entity, grievance officer, direct-to-borrower
//      disbursal.
// Not tax or legal advice: rates and sections are sandbox settings to be
// confirmed with the business's CA.
// ============================================================
const crypto = require('crypto');
const { DAY, iso, round2 } = require('./data/sandbox');

const toMs = (d) => Date.parse(`${d}T00:00:00Z`);

// Sandbox registration facts per SME (would come from Udyam / the CA).
const UDYAM = {
  sme_ananya_textiles: { registered: true, category: 'small', activity: 'trading', written_agreement_days: null },
  sme_chai_point_cafe: { registered: false, category: null, activity: 'services', written_agreement_days: null },
  sme_pixelforge_studio: { registered: true, category: 'micro', activity: 'services', written_agreement_days: 45 },
};
// TDS buyers deduct on this SME's invoices (sandbox; confirm section per contract).
const TDS_ON_RECEIPTS = {
  sme_pixelforge_studio: { section: '194J', rate_pct: 10, gst_rate_pct: 18, basis: 'professional services (some buyers deduct 2% under s.194C if they treat design as a works contract)' },
};

function fyEnd(dateIso) {
  const d = new Date(toMs(dateIso));
  const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
  return `${y}-03-31`;
}

/** s.43B(h) status of one of this SME's invoices from the buyer's side. */
function msme43bh(tenant, inv) {
  const u = UDYAM[tenant.profile.id];
  const asOf = tenant.profile.as_of;
  if (!u || !u.registered) return { applies: false, reason: 'not_udyam_registered' };
  if (!['micro', 'small'].includes(u.category)) return { applies: false, reason: 'medium_enterprise_not_covered' };
  if (u.activity === 'trading') return { applies: false, reason: 'traders_not_covered' };
  const limit = u.written_agreement_days ? Math.min(45, u.written_agreement_days) : 15;
  const days = Math.round((toMs(asOf) - toMs(inv.issued)) / DAY);
  return {
    applies: true, limit_days: limit, days_since_invoice: days, beyond_limit: days > limit,
    fy_end: fyEnd(asOf), category: u.category,
    note: `Under s.43B(h), a buyer paying a registered ${u.category} enterprise later than ${limit} days can deduct this cost only in the year it actually pays. Paying by ${fyEnd(asOf)} keeps the deduction in this financial year.`,
  };
}

/** Cash actually expected from an invoice after the buyer deducts TDS. */
function tdsOnReceipt(tenant, inv) {
  const t = TDS_ON_RECEIPTS[tenant.profile.id];
  if (!t) return null;
  const taxable = round2(inv.amount / (1 + t.gst_rate_pct / 100)); // TDS is on the value excluding GST
  const tds = round2((taxable * t.rate_pct) / 100);
  return { section: t.section, rate_pct: t.rate_pct, taxable_value: taxable, tds, net_cash: round2(inv.amount - tds), basis: t.basis };
}

/** Statutory due dates in the next `days` days, with amounts where the books give them. */
function complianceCalendar(tenant, days = 45, gstDues = []) {
  const asOfMs = toMs(tenant.profile.as_of);
  const p = tenant.profile;
  const out = [];
  const payroll = tenant.recurring && tenant.recurring.payroll ? tenant.recurring.payroll.amount : p.payroll;
  for (let d = 1; d <= days; d++) {
    const m = asOfMs + d * DAY; const dt = new Date(m); const day = dt.getUTCDate(); const mon = dt.getUTCMonth(); const date = iso(m);
    if (day === 7 && mon !== 3) out.push({ date, item: 'TDS deposit for last month (challan ITNS 281)', law: 'Income-tax Act s.200', amount: null, amount_note: 'from your TDS register (salaries, rent, contractors)', if_late: 'Interest of 1.5% a month from the date of deduction (s.201(1A))' });
    if (day === 30 && mon === 3) out.push({ date, item: 'TDS deposit for March', law: 'Income-tax Act s.200', amount: null, amount_note: 'from your TDS register', if_late: 'Interest of 1.5% a month from the date of deduction (s.201(1A))' });
    if (day === 11 && p.gst_registered) out.push({ date, item: 'GSTR-1 (outward supplies) for last month', law: 'CGST Act s.37', amount: 0, amount_note: 'a return, no payment', if_late: 'Late fee of ₹50 a day (₹20 for nil returns), capped; your buyers also lose input credit until you file' });
    if (day === 15) out.push({ date, item: 'PF and ESIC contributions for last month', law: 'EPF Act / ESI Act', amount: null, amount_note: `from payroll (wage bill about ₹${Math.round(payroll).toLocaleString('en-IN')} a month)`, if_late: 'Interest and damages under the EPF Act; 12% a year interest under the ESI Act' });
    if (day === 15 && [5, 8, 11, 2].includes(mon)) out.push({ date, item: 'Advance tax instalment', law: 'Income-tax Act s.211', amount: null, amount_note: 'depends on estimated profit for the year', if_late: 'Interest under s.234B and s.234C' });
  }
  for (const g of gstDues) if (toMs(g.due) > asOfMs && toMs(g.due) <= asOfMs + days * DAY) {
    out.push({ date: g.due, item: `GSTR-3B and GST payment (${g.period})`, law: 'CGST Act s.39', amount: g.net_cash_payable, amount_note: g.itc_at_risk ? `includes ₹${Math.round(g.itc_at_risk).toLocaleString('en-IN')} of input credit at risk` : '', if_late: '18% a year interest (s.50) plus ₹50 a day late fee (s.47)', status: g.status });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- Key Facts Statement ----------
const KFS_TERMS = {
  lp_mudra_tarun: { regulated_entity: 'Public sector bank (sandbox)', cooling_off_days: 3, penal_charge: '2% a year on the overdue instalment only, never compounded' },
  lp_mudra_kishor: { regulated_entity: 'Public sector bank (sandbox)', cooling_off_days: 3, penal_charge: '2% a year on the overdue instalment only, never compounded' },
  lp_od_cashcredit: { regulated_entity: 'Private bank (sandbox)', cooling_off_days: 3, penal_charge: '2% a year on the amount over the limit, never compounded' },
  lp_invoice_discount: { regulated_entity: 'TReDS financier, an RBI-regulated bank or NBFC (sandbox)', cooling_off_days: 1, penal_charge: 'none: repaid by the buyer on the invoice due date' },
  lp_fintech_wc: { regulated_entity: 'NBFC registered with RBI (sandbox)', cooling_off_days: 3, penal_charge: '24% a year on the overdue instalment only, never compounded' },
};

function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
}

/** All-in APR: the yearly rate at which (amount - fee) received equals the instalments paid. */
function allInApr(amount, ratePct, months, feePct) {
  const r = ratePct / 1200;
  const emi = r === 0 ? amount / months : (amount * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  const received = amount * (1 - feePct / 100);
  const pv = (i) => { let s = 0; for (let k = 1; k <= months; k++) s += emi / Math.pow(1 + i, k); return s; };
  let lo = 0; let hi = 1;
  for (let n = 0; n < 80; n++) { const mid = (lo + hi) / 2; if (pv(mid) > received) lo = mid; else hi = mid; }
  return { apr_pct: round2(((lo + hi) / 2) * 1200), emi: round2(emi), total_repayable: round2(emi * months) };
}

function keyFactsStatement(product, amount, tenure, opts = {}) {
  const t = KFS_TERMS[product.id] || { regulated_entity: 'Regulated entity (sandbox)', cooling_off_days: 3, penal_charge: 'not compounded' };
  let terms;
  if (product.type === 'invoice_financing') {
    // TReDS-style discounting: no instalments. The financier pays face value minus interest
    // for the days to each due date and a fee; the buyer repays the financier on the due date.
    const fin = require('./financing');
    const inv = Array.isArray(opts.invoices) && opts.invoices.length ? opts.invoices : [{ invoice_id: null, face: amount, tenor_days: opts.tenor_days || 30 }];
    const pr = fin.priceDiscount(product, inv);
    const scale = pr.face ? amount / pr.face : 1;
    terms = {
      amount, tenure_months: null, tenor_days: pr.avg_tenor_days, interest_rate_pct: product.apr,
      discount_interest: round2(pr.interest * scale), processing_fee: round2(pr.fee * scale),
      apr_all_in_pct: pr.all_in_apr_pct, instalment: null, total_repayable: round2(amount),
      repaid_by: 'the buyer, to the financier, on each invoice due date',
      invoices: inv.filter((x) => x.invoice_id).map((x) => ({ invoice_id: x.invoice_id, due: x.due, face: x.face })),
      net_disbursed: round2(pr.net_received * scale),
    };
  } else {
    const months = tenure || (product.tenure_months.includes(12) ? 12 : product.tenure_months[product.tenure_months.length - 1]);
    const fee = round2((amount * product.processing_fee_pct) / 100);
    const a = allInApr(amount, product.apr, months, product.processing_fee_pct);
    terms = { amount, tenure_months: months, interest_rate_pct: product.apr, processing_fee: fee, apr_all_in_pct: a.apr_pct, instalment: a.emi, total_repayable: a.total_repayable, net_disbursed: round2(amount - fee) };
  }
  const body = {
    product_id: product.id, lender: product.lender, regulated_entity: t.regulated_entity,
    ...terms,
    penal_charges: t.penal_charge,
    cooling_off_days: t.cooling_off_days,
    cooling_off_rule: `You can exit within ${t.cooling_off_days} day(s) by repaying the principal and interest for the days used, with no penalty.`,
    disbursal_route: product.disbursal_route || 'direct_to_borrower_account',
    recovery: 'Recovery agents, if any, are named to you in advance and must follow RBI conduct rules.',
    grievance_officer: `Grievance redressal officer, ${t.regulated_entity} (sandbox contact)`,
    data_shared: 'Banded features and a ledger commitment only, under a revocable consent.',
    basis: 'Sandbox terms in the format of the RBI Key Facts Statement. Not a credit offer.',
  };
  return { ...body, hash: crypto.createHash('sha256').update(canonical(body)).digest('hex') };
}

module.exports = { UDYAM, TDS_ON_RECEIPTS, msme43bh, tdsOnReceipt, complianceCalendar, keyFactsStatement, allInApr, fyEnd, KFS_TERMS };
