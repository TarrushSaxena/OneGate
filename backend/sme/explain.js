// ============================================================
// OneGate SME: "Why not?" cards
// Every refusal, escalation or block carries a structured explanation:
// which rule fired, the limit, the actual value where we know it, and
// what the owner can do about it. Reason codes stay machine-readable for
// tests and the audit chain; this module turns them into plain language.
// Nothing here changes a decision. It only explains decisions the
// policy engine, the mandate checker and the discount checker already made.
// ============================================================

const inr = (n) => `${n < 0 ? '-' : ''}₹${Math.abs(Math.round(Number(n))).toLocaleString('en-IN')}`;

// Ordered: first match wins. `m` is the regex match, `ctx` optional numbers.
const RULES = [
  [/^unknown_action$/, () => ({ title: 'Not a known action', rule: 'Allow-list of actions', detail: 'The agent can only use actions on a fixed allow-list.', fix: 'Ask in plain words; the copilot maps requests to allowed actions.' })],
  [/^unknown_tool_refused$/, () => ({ title: 'Tool does not exist', rule: 'Tool registry', detail: 'The language model asked for a tool that is not registered, so the call was refused.', fix: 'Nothing to do. The agent continues with registered tools only.' })],
  [/^prompt_injection$/, () => ({ title: 'Instruction to bypass controls', rule: 'Prompt-injection guard', detail: 'The message tried to override the agent’s rules (skip approvals, move money, reveal secrets). Guards run before any model sees it.', fix: 'Ask normally; payments always go through owner approval.' })],
  [/^phishing\w*$|^payment_redirection$/, () => ({ title: 'Looks like a payment scam', rule: 'Payment-redirection guard', detail: 'Urgent requests to pay a new or changed account are the most common SME fraud.', fix: 'Call the supplier on the number you already have on file before paying.' })],
  [/^action_never_delegated_to_agent$/, () => ({ title: 'Never delegated to AI', rule: 'DENY tier', detail: 'Adding beneficiaries, changing bank details and disabling the audit trail are never available to the agent, whoever asks.', fix: 'Do it yourself in your bank, after verifying by phone.' })],
  [/^role_(\w+?)_lacks_(\w+)$/, (m) => ({ title: `Your role can’t do this`, rule: 'Role permissions', detail: `The ${m[1]} role does not have ${m[2]} permission.`, fix: m[2] === 'EXECUTE' || m[2] === 'SUGGEST' ? 'Ask the owner or accountant.' : 'Ask the owner for access.' })],
  [/^owner_only$|^only_owner_can_approve$/, () => ({ title: 'Owner only', rule: 'Separation of duties', detail: 'Only the business owner can approve money movement or sign mandates. The accountant and the agent can only propose.', fix: 'The owner approves it from the Approvals panel.' })],
  [/^invalid_amount$/, () => ({ title: 'Amount missing or invalid', rule: 'Input validation', detail: 'The amount must be a positive number.', fix: 'Re-enter the amount.' })],
  [/^beneficiary_not_on_verified_allowlist$/, () => ({ title: 'Payee not on your verified list', rule: 'Verified-beneficiary allow-list', detail: 'Money only goes to beneficiaries already verified in your bank. New accounts can’t be added from chat.', fix: 'Verify the payee with your bank first. A common scam is a “new account” request.' })],
  [/^beneficiary_unverified$/, () => ({ title: 'Payee not verified yet', rule: 'Verified-beneficiary allow-list', detail: 'This payee exists but has not been verified.', fix: 'Complete verification with your bank.' })],
  [/^exceeds_per_payment_limit_(\d+)$/, (m, c) => ({ title: 'Above the single-payment limit', rule: 'Per-payment limit', detail: `One payment can be at most ${inr(m[1])}${c.amount ? `; this one is ${inr(c.amount)}` : ''}.`, fix: 'Split across days, or pay from your bank directly.' })],
  [/^exceeds_daily_cap_(\d+)$/, (m) => ({ title: 'Daily cap reached', rule: 'Daily payment cap', detail: `Total payments per day are capped at ${inr(m[1])}.`, fix: 'Schedule it for tomorrow.' })],
  [/^missing_product$/, () => ({ title: 'No loan product chosen', rule: 'Input validation', detail: 'A loan application needs a product.', fix: 'Run a financing match and pick a product.' })],
  [/^missing_invoice$|^invoice_not_found$/, () => ({ title: 'Invoice not found', rule: 'Input validation', detail: 'That invoice is not open in this business’s books.', fix: 'Pick an invoice from the receivables list.' })],
  [/^confirm_amount_mismatch$/, () => ({ title: 'Amount didn’t match', rule: 'Amount re-confirmation', detail: 'You must re-type the exact amount so a tampered or mistaken amount can’t be approved with one click.', fix: 'Re-type the exact amount shown on the card.' })],
  [/^stepup_required$/, () => ({ title: 'One-time code needed', rule: 'Step-up verification', detail: 'Payments, loans and mandates need a 6-digit code bound to this exact action and amount.', fix: 'Tap Approve to get a code.' })],
  [/^stepup_code_wrong$/, () => ({ title: 'Wrong code', rule: 'Step-up verification', detail: 'The code didn’t match. Three wrong tries lock it.', fix: 'Re-enter the code.' })],
  [/^stepup_locked$/, () => ({ title: 'Code locked', rule: 'Step-up verification', detail: 'Three wrong codes locked this challenge.', fix: 'Request a new code.' })],
  [/^stepup_code_expired$/, () => ({ title: 'Code expired', rule: 'Step-up verification', detail: 'Codes last 5 minutes.', fix: 'Request a new code.' })],
  [/^stepup_code_already_used$/, () => ({ title: 'Code already used', rule: 'Step-up verification', detail: 'Each code works once.', fix: 'Request a new code.' })],
  [/^stepup_code_bound_to_other_action$/, () => ({ title: 'Code is for a different action', rule: 'Step-up binding', detail: 'This code was issued for another action or amount, so it can’t approve this one.', fix: 'Request a code for this card.' })],
  [/^no_active_mandate_for_beneficiary$/, () => ({ title: 'No mandate for this supplier', rule: 'Spending mandate', detail: 'The agent can only pay on its own where you signed a mandate for that supplier.', fix: 'Sign a mandate, or approve this payment yourself.' })],
  [/^not_due_yet_(-?\d+)d$/, (m) => ({ title: 'Not due yet', rule: 'Mandate timing', detail: `The bill is due in ${m[1]} days; mandates only pay bills due within 3 days.`, fix: 'Nothing to do. The autopilot checks again daily.' })],
  [/^amount_above_mandate_per_payment_(\d+)$/, (m, c) => ({ title: 'Above your mandate’s ceiling', rule: 'Mandate per-payment ceiling', detail: `Your mandate allows up to ${inr(m[1])} per payment${c.amount ? `; this bill is ${inr(c.amount)}` : ''}.`, fix: 'Approve it yourself, or raise the ceiling (hard limit ₹2,00,000).' })],
  [/^monthly_cap_(\d+)_would_be_exceeded$/, (m) => ({ title: 'Monthly cap would be exceeded', rule: 'Mandate monthly cap', detail: `This payment would take the month past your ${inr(m[1])} mandate cap.`, fix: 'Approve it yourself.' })],
  [/^would_push_cash_below_buffer_on_(\d{4}-\d{2}-\d{2})$|^payment_pushes_cash_below_buffer_on_(\d{4}-\d{2}-\d{2})$/, (m, c) => ({ title: 'Would break your cash buffer', rule: 'Cash-buffer protection', detail: `In the pessimistic forecast, cash would fall below your ${c.buffer ? inr(c.buffer) + ' ' : ''}safety buffer on ${m[1] || m[2]}.`, fix: 'Collect overdue invoices or line up financing first, or approve it knowingly.' })],
  [/^early_payment_breaks_buffer_on_(\d{4}-\d{2}-\d{2})$/, (m, c) => ({ title: 'Paying early would break your buffer', rule: 'Cash-buffer protection', detail: `Paying ${c.amount ? inr(c.amount) + ' ' : ''}early pulls cash below the ${c.buffer ? inr(c.buffer) + ' ' : ''}safety buffer on ${m[1]} in the pessimistic case.`, fix: 'Pay on the normal due date instead; the discount isn’t worth a cash crunch.' })],
  [/^return_below_hurdle_(\d+(?:\.\d+)?)_vs_(\d+(?:\.\d+)?)$/, (m) => ({ title: 'Discount not worth it', rule: 'Return vs cost of money', detail: `The discount earns ${m[1]}% a year, below the ${m[2]}% your money can earn or costs to borrow.`, fix: 'Keep the cash and pay on the due date.' })],
  [/^discount_window_closed$/, () => ({ title: 'Discount window closed', rule: 'Supplier terms', detail: 'The early-payment date has passed.', fix: 'Pay on the normal due date.' })],
  [/^no_early_pay_terms$/, () => ({ title: 'No early-payment discount offered', rule: 'Supplier terms', detail: 'This supplier hasn’t offered a discount for paying early.', fix: 'Ask the supplier; many offer 1 to 2% for paying within 10 days.' })],
  [/^payee_not_verified$|^bill_or_verified_payee_not_found$/, () => ({ title: 'Payee not verified', rule: 'Verified-beneficiary allow-list', detail: 'The supplier on this bill is not a verified beneficiary.', fix: 'Verify the payee with your bank first.' })],
  [/^discount_terms_mismatch$/, () => ({ title: 'Discount doesn’t match the supplier’s terms', rule: 'Discount integrity', detail: 'An early payment must be exactly the bill minus the supplier’s offered discount.', fix: 'Use the discount the agent computed.' })],
  [/^possible_split_payment_(\d+)$/, (m) => ({ title: 'Looks like a split payment', rule: 'Structuring check', detail: `Payments to this payee that aren’t tied to a bill would add up to ${inr(m[1])} within 72 hours, above the ${inr(500000)} single-payment limit. Splitting a payment to get under a limit is blocked.`, fix: 'Pay against the actual supplier bill, or make one payment within the limit.' })],
  [/^too_many_unbilled_payments_to_one_payee$/, () => ({ title: 'Too many payments to one payee', rule: 'Structuring check', detail: 'Three or more payments to the same payee in 72 hours without a bill behind them is a common fraud pattern.', fix: 'Attach each payment to its supplier bill.' })],
  [/^invoice_under_dispute$/, () => ({ title: 'Invoice is under dispute', rule: 'Dispute hold', detail: 'This invoice is marked as disputed, so the agent won’t chase the customer until it’s settled.', fix: 'Settle the dispute (or issue a credit note), then mark it settled.' })],
  [/^bill_under_dispute$/, () => ({ title: 'Bill is under dispute', rule: 'Dispute hold', detail: 'This supplier bill is marked as disputed, so it can’t be paid, not even under a mandate.', fix: 'Resolve the dispute with the supplier, then mark it settled.' })],
  [/^kfs_not_acknowledged$/, () => ({ title: 'Key Facts Statement not confirmed', rule: 'RBI digital lending: Key Facts Statement', detail: 'A loan can only be submitted after the owner has seen this exact Key Facts Statement: all-in APR, fees, penal charges and the cooling-off period.', fix: 'Open the Key Facts Statement on the card, tick that you have read it, then approve.' })],
  [/^pass_through_disbursal$/, () => ({ title: 'Loan money must come straight to you', rule: 'RBI digital lending: direct disbursal', detail: 'This product routes the loan through a third party’s account. Loans must go directly from the regulated lender to your bank account.', fix: 'Choose a product that disburses directly to your account.' })],
  [/^cooling_off_expired$/, () => ({ title: 'Cooling-off period has ended', rule: 'Loan cooling-off', detail: 'The penalty-free exit window for this loan has passed.', fix: 'Ask the lender about prepayment terms in the Key Facts Statement.' })],
  [/^not_an_active_loan$/, () => ({ title: 'Not an active loan', rule: 'Loan cooling-off', detail: 'Only a loan that has been submitted and executed can be exited.', fix: 'Check the loan’s status on its card.' })],
  [/^proposal_budget_exhausted$/, () => ({ title: 'Too many proposals in one go', rule: 'Agent step budget', detail: 'The agent may queue at most 3 actions per request.', fix: 'Approve or reject the queued ones, then ask again.' })],
  [/^blocked_by_policy$/, () => ({ title: 'Blocked at execution', rule: 'Policy re-check', detail: 'Limits are checked again at the moment of execution, and this one no longer passed.', fix: 'See the other reasons on this card.' })],
  [/^max_per_payment_must_be_1_to_(\d+)$/, (m) => ({ title: 'Ceiling too high', rule: 'Mandate hard limits', detail: `A mandate’s per-payment ceiling can be at most ${inr(m[1])}.`, fix: 'Lower the ceiling.' })],
  [/^monthly_cap_must_be_1_to_(\d+)$/, (m) => ({ title: 'Monthly cap too high', rule: 'Mandate hard limits', detail: `A mandate’s monthly cap can be at most ${inr(m[1])}.`, fix: 'Lower the cap.' })],
  [/^max_per_payment_above_monthly_cap$/, () => ({ title: 'Ceiling above cap', rule: 'Mandate hard limits', detail: 'The per-payment ceiling can’t exceed the monthly cap.', fix: 'Lower the ceiling or raise the cap.' })],
  [/^valid_days_must_be_1_to_(\d+)$/, (m) => ({ title: 'Mandate too long', rule: 'Mandate hard limits', detail: `Mandates last at most ${m[1]} days.`, fix: 'Shorten it; you can sign a new one later.' })],
];

function explainOne(code, ctx = {}) {
  const c = String(code || '');
  for (const [re, fn] of RULES) {
    const m = c.match(re);
    if (m) return { code: c, ...fn(m, ctx) };
  }
  // Financing blockers and other free-text reasons: show them as-is.
  return { code: c, title: 'Not possible right now', rule: 'Eligibility check', detail: c.replace(/_/g, ' '), fix: 'See the details, or ask the copilot for alternatives.' };
}

/** explain(reasons[], ctx) -> card[] (deduplicated by code). */
function explain(reasons, ctx = {}) {
  const seen = new Set();
  return (Array.isArray(reasons) ? reasons : [reasons]).filter(Boolean).filter((r) => (seen.has(r) ? false : seen.add(r))).map((r) => explainOne(r, ctx));
}

module.exports = { explain, explainOne };
