# OneGate SME Finance Copilot (FinTechathon 2026, Topic E)

OneGate SME adds a permission-tiered AI finance copilot for small businesses to the OneGate platform. It runs entirely on **synthetic sandbox data**. No real bank, money or messages are touched.

## What it does (agent tasks)
| # | Task | Tier | Endpoint |
|---|---|---|---|
| T1 | 30/60/90-day cash-flow forecast with low, base and high scenarios, alerts and a walk-forward backtest | READ | `GET /api/sme/:tid/forecast` |
| T2 | Overdue receivables: ageing buckets, per-customer pay probability, risk-ranked chase list | READ | `GET /api/sme/:tid/receivables` |
| T3 | Payment-reminder drafts (tone adapts to lateness) | SUGGEST, and sending is EXECUTE | `GET /api/sme/:tid/receivables/:inv/draft` |
| T4 | Financing match: explainable eligibility, EMI and total cost across 5 sandbox products | SUGGEST | `POST /api/sme/:tid/financing/match` |
| T5 | Sandbox payment scheduling to verified beneficiaries | EXECUTE (owner approval) | `POST /api/sme/:tid/actions` |
| T6 | Sandbox loan application | EXECUTE (owner approval) | `POST /api/sme/:tid/actions` |
| Chat | Natural-language copilot that routes to the tools above | mixed | `POST /api/sme/:tid/copilot` |

## Security and compliance controls
- **Permission tiers** (`backend/sme/policy.js`): READ, SUGGEST, EXECUTE and DENY. The agent acts alone only on READ and SUGGEST. Every EXECUTE becomes a pending approval card.
- **Human approval**: only the SME `owner` can approve. Accountants can propose but never approve. For payments, the owner must re-type the amount (`confirm_amount`). Approvals expire after 24h. An action executes at most once, and policy is re-checked at execution time.
- **Hard limits**: verified-beneficiary allowlist, ₹5,00,000 per payment, and ₹8,00,000 per day. Payments that push forecast cash below the safety buffer carry a warning on the card.
- **Never delegated**: adding beneficiaries, changing bank details and disabling audit are always denied.
- **Prompt-injection defence** (`backend/sme/guard.js`): user messages and all document text (invoice notes and similar) are treated as untrusted. Injection attempts are blocked and audited. A planted malicious invoice note in the sandbox is detected and never echoed.
- **Phishing defence**: bank-detail-change, urgency, unusual payment rails and OTP requests are scored. Flagged messages never reach payment tools.
- **PII redaction**: card, PAN, Aadhaar, account, IFSC and phone numbers are redacted before anything is logged.
- **Tenant isolation**: each user belongs to exactly one SME. Cross-tenant requests return 403 and are audited, and platform roles grant no cross-tenant access.
- **Tamper-evident audit** (`backend/sme/auditChain.js`): SHA-256 hash-chained log per tenant. `GET /api/sme/:tid/audit/verify` detects any edit or deletion.

## Forecast method
Day-of-week sales baseline (90-day lookback), calendar obligations (payroll, rent, GST, utilities), sales scaled to the last 28 days' level, collections from not-yet-issued invoices at the run rate (starting only at the business's 25th-percentile issue-to-payment time, full by the 75th), Laplace-smoothed per-customer pay probability and delay (halving about weekly once an invoice is later than that customer's norm, then spread over 2 to 6 weeks), and scheduled payables. Low and high cases flex sales, receivables and supplier spend, and the low is floored at the band calibrated on past errors. The 30-day walk-forward backtest MAPE is reported in every forecast response and in `docs/sandbox-evidence/SUMMARY.md`.

## Dashboard
Open `http://localhost:3000/sme.html` after `npm run provision:demo`, then pick an SME demo user. It shows KPI cards, a 90-day forecast chart with the low-to-high band and safety buffer, risk-ranked receivables with one-click reminder proposals, the copilot chat (including a "Try an attack" button), an owner-only approvals queue with amount re-confirmation, a financing comparison and the live hash-chain audit trail. Viewers and accountants see only what their tier allows.

## Run it
```bash
cd backend && npm install
node sme/scripts/sandbox-run.js          # regenerates docs/sandbox-evidence/
node --test tests/sme-01-core.test.js tests/sme-02-api.test.js
node tests/run-all-tests.js              # full suite (core + SME)
npm start                                # API on :3000
```
Demo SME users (created by `npm run provision:demo` and listed on the dashboard's sign-in screen): `owner.ananya@company.com` (owner), `accounts.ananya@company.com` (accountant), `owner.chai@company.com`, `owner.pixelforge@company.com` and `viewer.pixelforge@company.com`. See `backend/sme/tenancy.js`.

## Status
Done: backend module, dashboard (`frontend/sme.html`), tests and sandbox evidence. v1.2 adds the agentic layer: multi-step planner, optional LLM tool-calling with a grounding check, daily autopilot, owner-signed spending mandates, step-up codes and privacy-preserving lender sharing. See [AGENTIC_COPILOT.md](AGENTIC_COPILOT.md).
