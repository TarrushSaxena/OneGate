---
title: "OneGate SME: A Permission-Tiered AI Finance Copilot for Small Businesses"
subtitle: "Technical Documentation · Team GateKeepers · 2026 Shenzhen International FinTech Competition, International Track (Topic E: SME Finance Copilot)"
author: "Tarrush Saxena (Lead), Yogya Mittal, Utkarsh Gupta · Bennett University, India"
date: "October 2026 · v1.1"
---

> **What this document claims.** Everything below describes behaviour that is implemented in the `sme-copilot` branch and covered by automated tests or the sandbox run, unless it is explicitly marked **Roadmap**. All data is synthetic. Nothing connects to a real bank, lender or email service.

# 1. Summary

Small-business owners don't need another dashboard. They need someone to handle the finance chores they never get to: chasing late invoices, spotting a cash crunch weeks out, and working out which loan they can actually get.

**OneGate SME** is a finance copilot that does that work inside a strict safety envelope. For each SME it:

- reads a sandboxed ledger
- forecasts cash at 30/60/90 days with low, base and high scenarios
- ranks overdue invoices by risk
- matches the business to financing products, with reasons for each match
- **prepares real actions**: payment orders, customer reminders, loan applications

An action that moves money or contacts a third party **only executes after the SME owner approves it**. The owner also has to re-type the payment amount. The agent can never add a payee or change bank details.

OneGate SME is a new module inside **OneGate**, our existing AI helpdesk (Node/Express, Socket.IO). It reuses OneGate's authentication, sessions and core audit service.

| Scoring criterion | What we deliver |
|---|---|
| Task completion (40%) | Six agent tasks run end to end against three synthetic SMEs, with logged results for each (§3, §8) |
| Security & compliance (30%) | Four permission tiers, owner-only approval with amount re-confirmation, hard limits, payee allowlist, injection and phishing guards, tenant isolation, a hash-chained audit trail, and a written self-assessment (§6) |
| Innovation & interaction (30%) | A dashboard with an embedded copilot, approval cards, an explainable financing match, and a live "Try an attack" demo (§7) |

# 2. Problem and users

**Target user:** owners of micro and small businesses in India with 1–50 staff (shops, cafés, agencies, small traders), usually with no finance team.

**Pain points:**

1. **Cash-flow blindness.** A shortfall is often noticed only when it hits.
2. **Late receivables.** Chasing invoices is awkward and keeps getting postponed.
3. **Financing confusion.** Mudra term loans, cash-credit overdrafts, TReDS invoice discounting and fintech credit lines all have different eligibility rules and costs.
4. **Risky automation.** Owners won't hand a bot their bank account unless control is explicit and auditable.

# 3. Agent tasks (implemented)

| # | Task | Tier | Output | Endpoint |
|---|---|---|---|---|
| T1 | Business overview | READ | Cash today, forecast, overdue total, pending approvals | `GET /api/sme/:tid/overview` |
| T2 | Forecast cash at 30/60/90 days | READ | Daily low/base/high path, lowest point, buffer-breach alert, backtest | `GET /api/sme/:tid/forecast` |
| T3 | Rank overdue receivables | READ | Ageing buckets, risk score 0–100, priority order, flagged notes | `GET /api/sme/:tid/receivables` |
| T4 | Chase a receivable | SUGGEST → EXECUTE | Reminder draft; "sent" to sandbox email only after owner approval | `.../receivables/:id/draft`, `POST .../actions` |
| T5 | Match financing | SUGGEST | Five products ranked by total cost, with eligibility reasons and blockers | `POST /api/sme/:tid/financing/match` |
| T6 | Pay a supplier / submit a loan application | EXECUTE | Pending approval; on owner approval a sandbox receipt (`SBX-…`) | `POST .../actions`, `.../approve` |

All tasks can also be started in plain English through the copilot (`POST /api/sme/:tid/copilot`).

# 4. System architecture

```
Browser: dashboard (frontend/sme.html) + copilot chat
   │  HttpOnly SameSite=Strict session cookie (JWT, HS256, 8 h)
   ▼
Express (backend/server.js) ── core authenticate ──▶ /api/sme router (backend/sme/routes.js)
                                                      1. membership → tenant + SME role
                                                      2. :tid must equal caller's tenant
                                                      3. policy.evaluate(action, role, params)
            ┌───────────────────────── READ / SUGGEST ─────────────────────────┐
            │ forecast.js · receivables.js · financing.js · copilot.js (router) │
            └───────────────────────────────────────────────────────────────────┘
                                   │ EXECUTE
                                   ▼
            actions.js: pending approval ─(owner + amount + policy re-check)─▶ sandbox executor
                                   │
                                   ▼
            auditChain.js: SHA-256 hash chain per tenant (mirrored to core audit service)
```

**Modules (`backend/sme/`, about 850 lines):**

| File | Role |
|---|---|
| `data/sandbox.js` | Deterministic synthetic data. Three SMEs, 180 days of transactions, invoices with payment history, payables, verified beneficiaries, five loan products. |
| `forecast.js` | Cash forecaster and walk-forward backtest |
| `receivables.js` | Ageing, risk ranking, reminder drafts |
| `financing.js` | Explainable eligibility and cost matching |
| `guard.js` | Prompt-injection and phishing detection, PII redaction |
| `policy.js` | Permission tiers, role matrix, hard limits |
| `tenancy.js` | Tenant membership and SME roles |
| `actions.js` | Propose, approve and reject actions; idempotency; sandbox execution |
| `auditChain.js` | Tamper-evident audit trail |
| `copilot.js` | Deterministic natural-language intent router over the tools above |
| `routes.js` | REST API |

**Stack:** Node.js 20+, Express, Socket.IO (existing platform), plain HTML/CSS/JS for the dashboard, and `node:test` for tests. No database is needed for the demo: state is held in memory and rebuilt deterministically on start.

**Design choice: no LLM in the action path.** By default the copilot maps a message to an intent with keyword rules, or runs the multi-step cash-gap planner, and calls deterministic tools. Every figure it states comes from a tool result. Since v1.2 an optional LLM can pick which tool to call next, but its answers must pass a numeric grounding check, and it can only *propose* actions through the same `actions.propose()` path a human uses. The planner, autopilot, mandates, step-up codes and lender data minimisation are documented in [AGENTIC_COPILOT.md](AGENTIC_COPILOT.md).

# 5. Core algorithms

## 5.1 Cash-flow forecast (`forecast.js`)

The model is transparent and has no training step. For each future day:

- **Sales baseline:** mean sales per weekday over the last 90 days.
- **Recurring obligations:** rent, salaries, utilities and supplier spend, placed on their calendar days.
- **Expected receivables:** each open invoice arrives at *due date + the customer's average delay*. It is weighted by the customer's payment probability, Laplace-smoothed as (paid + 1) / (n + 2). An invoice already past the customer's usual pay date decays as p·e^(−days_late/20) and is spread over the next 1–3 weeks.
- **Future collections:** a run-rate for invoices not issued yet, ramped in over 45 days.
- **Scheduled payables:** open bills, on their due dates.

**Scenarios:**

- **Low:** sales ×0.9, receivables ×0.7 (×0.8 for future ones), supplier spend ×1.05.
- **High:** sales ×1.1, receivables ×1.3 capped at 100% (×1.1 for future ones), supplier spend ×0.95.

**Outputs:**

- the daily path
- 30/60/90-day values
- the lowest point
- a **buffer-breach alert** on the first day the low case drops below the safety buffer
- the main drivers

**Backtest:** a walk-forward check. The model forecasts from 30 days ago without seeing later data, and the base case is compared with actual balances.

| SME | Profile | MAPE (30 d) | Days actual inside low–high |
|---|---|---|---|
| Chai Point Cafe | Retail café, steady daily sales | **3.93%** | 86.7% |
| PixelForge Design Studio LLP | B2B services, lumpy invoices | **7.89%** | 13.3% |
| Ananya Textiles Pvt Ltd | Wholesale, slow payers | **26%** | 63.3% |

*How to read this:* the base case is accurate for steady businesses and weaker for lumpy B2B receipts. The low/high band is a **scenario range, not a calibrated confidence interval**. PixelForge's low coverage shows that, and we report it rather than hide it (§10).

## 5.2 Receivable risk score (`receivables.js`)

`risk = min(100, round(0.9 × lateness + 60 × (1 − pay_probability)))`. Here `lateness` is how far past the customer's *own* usual delay the invoice is. Invoices are shown in ageing buckets (current, 1–30, 31–60, 61–90, 90+) and ranked by `amount × risk`.

Reminder drafts:

- are polite and quote the invoice
- tell the customer that OneGate never changes bank details by email
- stay drafts until the owner approves sending them

## 5.3 Financing matcher (`financing.js`)

There are five sandbox products, with terms modelled on Indian SME credit:

| Product | APR |
|---|---|
| PMMY Tarun | 10.25% |
| PMMY Kishor | 10.75% |
| Cash-credit OD | 11.5% |
| TReDS invoice discounting | 9.4% |
| Fintech NBFC line | 19% |

1. **Hard eligibility rules:** amount range, business vintage, credit score, open receivables (for invoice discounting) and time to disburse compared with the need.
2. **Cost:** a standard EMI formula over 12 months (or the longest tenure available), plus the processing fee, gives the estimated monthly payment and total cost.
3. **Recommendation:** the cheapest eligible option. Every product lists its reasons, and ineligible ones list the exact rule that blocked them.

Terms are illustrative and labelled "not a credit offer".

## 5.4 Guards (`guard.js`)

Input is first normalised: NFKC, zero-width characters removed, spaced-out letters collapsed. Then:

- **Prompt-injection patterns:** overriding instructions or guidance, "you are now…", requests to reveal prompts or secrets, "send the entire balance or everything", and "approve without asking".
- **Phishing signals, scored:** bank-detail change or new account, urgency, unusual payment rails, and OTP/CVV requests.
- **PII redaction** before anything is written to the audit log: PAN, Aadhaar, card, account, IFSC and phone numbers.

# 6. Security design

The full threat model, test mapping and red-team results are in **`docs/SECURITY_SELF_ASSESSMENT.md`**. The main points:

## 6.1 Permission tiers (`policy.js`)

| Tier | Actions | Who |
|---|---|---|
| READ | View overview, forecast, receivables, financing | owner, accountant, viewer |
| SUGGEST | Draft reminder, recommend financing | owner, accountant |
| EXECUTE | Send reminder, schedule payment, submit loan application | owner or accountant may *propose*; **only the owner approves** |
| DENY | Add beneficiary, change bank details, disable audit | never available through OneGate |

## 6.2 Execution safeguards (`actions.js`)

- **Hard limits:**
  - ₹5,00,000 per payment
  - ₹8,00,000 per tenant per day
  - payments only to **verified** beneficiaries on the tenant allowlist
- **Amount re-confirmation:** the owner must re-type the exact amount. A mismatch is refused and audited.
- **Re-check at execution:** policy and limits are evaluated again at approval time.
- **Expiry and idempotency:** approvals expire after 24 h, idempotency keys stop double submissions, and an action already decided cannot be decided again.
- **Cash warning:** an approval card warns when a payment would push forecast cash below the buffer.

## 6.3 Isolation and audit

- **Membership comes from the server-side session.** A request for another tenant's `:tid` is refused and audited. Platform roles, even organisation manager, grant no access to SME data.
- **Audit trail:** every proposal, decision, denial, blocked attack and execution is chained with SHA-256 and canonical JSON. `GET /api/sme/:tid/audit/verify` finds the first altered entry.

## 6.4 Red-team outcome

Our own testing found three detection gaps:

- paraphrased injections
- letter-spaced injections
- a bank-change scam scoring 0

All three are fixed and regression-tested. In **every** case, including messages the detector misses on purpose, **no money moved**, because authority comes from the policy engine, not from language.

## 6.5 Compliance alignment (indicative, not certified)

- **RBI Digital Lending Directions:** loan applications need the borrower's explicit approval, with APR and total cost shown first.
- **DPDP Act 2023:** PII is minimised in logs and tenant data is isolated.
- **CERT-In:** a timestamped, tamper-evident decision log.

# 7. Interaction design (`frontend/sme.html`)

- **Sign-in:** pick one of five demo SME users (owner, accountant or viewer).
- **KPI cards:** cash today, 30-day and 90-day forecast, overdue total, pending approvals.
- **Forecast chart:** a 90-day base line with the low–high band, the safety-buffer line and breach alerts.
- **Receivables table:** risk badges, a flag on invoices whose notes tried to instruct the AI, and a one-click **Remind** that creates an approval request.
- **Copilot chat:** quick prompts (cash outlook, who owes me, remind, financing, pay a bill) and a red **Try an attack** button. Blocked or phishing replies are highlighted with a security note.
- **Approvals queue:** shows the proposer, tier, warnings, an email preview, an amount box and Approve/Reject. These controls are visible to the owner only.
- **Financing table:** APR, monthly payment, total cost, an eligibility reason and a "best" badge.
- **Audit trail:** the latest entries and a live "chain valid" badge.

What each user sees follows their tier: viewers get read-only panels, and only owners see approval controls.

# 8. Testing and execution evidence

- **Automated tests:** `node backend/tests/run-all-tests.js` runs **42 test files, all passing**. Of these, **28 SME tests** in `sme-01-core`, `sme-02-api` and `sme-03-secret-hygiene` cover:
  - deterministic data
  - forecast shape and backtest
  - receivable ranking and the planted injection note
  - financing logic
  - guards, including paraphrase, obfuscation and false positives on normal questions
  - the policy matrix
  - audit tamper detection
  - unauthenticated and non-member access
  - tenant isolation
  - viewer and accountant limits
  - the full payment approval flow
  - the allowlist and the bank-detail DENY
  - copilot grounding and blocking
  - secret hygiene: the suite fails if a tracked file contains a key or a published password
- **Sandbox run:** `node backend/sme/scripts/sandbox-run.js` runs the same script against all three SMEs and writes `docs/sandbox-evidence/`:

| SME | Attacks blocked | Phishing warned | Policy denials | Owner-approved payment | Audit chain |
|---|---|---|---|---|---|
| Ananya Textiles | 2/2 | yes | 3/3 | executed after approval | valid (17 entries) |
| Chai Point Cafe | 2/2 | yes | 3/3 | executed after approval | valid (16 entries) |
| PixelForge Design | 2/2 | yes | 3/3 | executed after approval | valid (16 entries) |

  It also writes `sandbox-run.jsonl` (every prompt, decision and result), one audit file per SME, and a dashboard screenshot.

# 9. Running it

```
cd backend
npm install
npm run provision:demo      # creates demo users, incl. the 5 SME users
npm start                   # http://localhost:3000/sme.html
node tests/run-all-tests.js
```

Environment variables are documented in the README. No secrets are needed for the SME demo.

# 10. Limitations and roadmap

**Known limitations (also in the self-assessment):**

- State is held in memory.
- Membership is a static demo table.
- Detection uses rules and heuristics.
- One-time codes are shown on screen in the sandbox instead of being sent by SMS.
- The forecast band is a scenario range, not a calibrated interval.
- Platform CORS is open, and there is no CSP or per-route rate limit yet.

**Roadmap:**

- Persistent append-only storage, with the chain head anchored to an external log
- Real SMS delivery or passkeys for step-up codes
- A calibrated forecast interval (quantile or Monte Carlo) and transaction categorisation
- A classifier as a second opinion beside the rule guards, trained on a growing red-team set
- A federated credit model across lenders (FATE), fed by the banded features OneGate already shares
- Account Aggregator (open-banking) consent connectors, TReDS and lender APIs, and accounting-software import
- Docker Compose deployment

# 11. Team

| Member | Role |
|---|---|
| Tarrush Saxena (Lead) | Product, copilot and agent design, pitch |
| Yogya Mittal | Forecasting and financing logic |
| Utkarsh Gupta | Backend, policy engine and security |

All three are B.Tech Computer Science and Engineering students at Bennett University, India.
