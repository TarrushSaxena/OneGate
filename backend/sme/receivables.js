// ============================================================
// OneGate SME — Receivables: ageing, risk ranking, reminder drafts
// ============================================================
const { DAY, iso, round2 } = require('./data/sandbox');
const { customerStats } = require('./forecast');
const { sanitizeUntrustedText } = require('./guard');

const toMs = (d) => Date.parse(`${d}T00:00:00Z`);

function bucket(days) {
  if (days <= 0) return 'current';
  if (days <= 30) return '1-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

const india = require('./india');

function receivables(tenant) {
  const asOf = toMs(tenant.profile.as_of);
  const stats = customerStats(tenant.invoices, asOf);
  const open = tenant.invoices.filter((i) => i.status === 'open');
  const ageing = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  const items = open.map((i) => {
    const daysOverdue = Math.round((asOf - toMs(i.due)) / DAY);
    const b = bucket(daysOverdue);
    ageing[b] = round2(ageing[b] + i.amount);
    const s = stats[i.customer] || { pay_probability: 0.7, avg_delay_days: 15 };
    // Risk score 0-100: lateness relative to the customer's own norm, plus their history.
    const lateness = Math.max(0, daysOverdue - s.avg_delay_days);
    const risk = Math.min(100, Math.round(lateness * 0.9 + (1 - s.pay_probability) * 60));
    const notes = sanitizeUntrustedText(i.notes);
    return {
      invoice: i.id, customer: i.customer, amount: i.amount, due: i.due, days_overdue: daysOverdue,
      bucket: b, risk_score: risk, customer_pay_probability: s.pay_probability,
      customer_usual_delay_days: s.avg_delay_days,
      priority_value: round2(i.amount * (risk / 100)),
      untrusted_note: notes.flagged ? { flagged: true, reason: notes.reason } : (i.notes ? { flagged: false } : undefined),
      tds: india.tdsOnReceipt(tenant, i) || undefined,
      msme_43bh: (() => { const m = india.msme43bh(tenant, i); return m.applies ? m : undefined; })(),
      dispute: i.dispute || undefined,
    };
  });
  // Disputed invoices are never chased: they wait until the dispute is settled.
  const overdue = items.filter((x) => x.days_overdue > 0 && !x.dispute).sort((a, b) => b.priority_value - a.priority_value);
  return {
    tenant_id: tenant.profile.id,
    as_of: tenant.profile.as_of,
    total_open: round2(items.reduce((a, b) => a + b.amount, 0)),
    total_overdue: round2(overdue.reduce((a, b) => a + b.amount, 0)),
    ageing,
    top_overdue: overdue.slice(0, 10),
    disputed: items.filter((x) => x.dispute).map((x) => ({ invoice: x.invoice, customer: x.customer, amount: x.amount, dispute: x.dispute })),
    net_of_tds_overdue: round2(overdue.reduce((a, b) => a + (b.tds ? b.tds.net_cash : b.amount), 0)),
    flagged_notes: items.filter((x) => x.untrusted_note && x.untrusted_note.flagged).map((x) => x.invoice),
  };
}

function draftReminder(tenant, invoiceId) {
  const inv = tenant.invoices.find((i) => i.id === invoiceId);
  if (!inv) return null;
  const days = Math.round((toMs(tenant.profile.as_of) - toMs(inv.due)) / DAY);
  const tone = days > 45 ? 'firm' : days > 15 ? 'polite-firm' : 'friendly';
  const m = india.msme43bh(tenant, inv);
  const t = india.tdsOnReceipt(tenant, inv);
  const extra = [
    m.applies && m.beyond_limit ? `We are a Udyam-registered ${m.category} enterprise. ${m.note}` : '',
    t ? `If you deduct TDS (s.${t.section}, about ${inv.currency} ${Math.round(t.tds).toLocaleString('en-IN')}), please send the TDS certificate (Form 16A) with the payment.` : '',
  ].filter(Boolean).join('\n\n');
  const opener = { friendly: 'Hope you are well.', 'polite-firm': 'Following up on the invoice below.', firm: 'This invoice is now significantly overdue.' }[tone];
  return {
    invoice: inv.id, customer: inv.customer, tone, channel: 'email', status: 'draft_requires_approval',
    subject: `Payment reminder: ${inv.id} (${inv.currency} ${inv.amount.toLocaleString('en-IN')})`,
    body: `Dear ${inv.customer} team,\n\n${opener} Invoice ${inv.id} for ${inv.currency} ${inv.amount.toLocaleString('en-IN')} was due on ${inv.due}${days > 0 ? ` and is ${days} days overdue` : ''}.\n\nPlease arrange payment to our registered account on file, or reply with an expected payment date. Our bank details have not changed; please disregard any message claiming otherwise.${extra ? `\n\n${extra}` : ''}\n\nRegards,\nAccounts, ${tenant.profile.name}`,
  };
}

module.exports = { receivables, draftReminder };
