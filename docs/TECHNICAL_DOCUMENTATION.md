---
title: "OneGate SME: A Permission-Tiered AI Finance Copilot for Small Businesses"
subtitle: "Technical Documentation · Team GateKeepers · 2026 Shenzhen International FinTech Competition, International Track (Topic E: SME Finance Copilot)"
author: "Tarrush Saxena (Lead), Yogya Mittal, Utkarsh Gupta · Bennett University, India"
date: "16 October 2026 · v1.8.1"
---

> **What this document claims.** Everything below describes behaviour that is implemented in the repository (`main`, mirrored to the `sme-copilot` branch) and covered by automated tests or the sandbox run, unless it is marked **Roadmap** or **Not yet run**. All data is synthetic. Nothing connects to a real bank, lender, GST portal, SMS gateway or email service.

**Links.** Repository: <https://github.com/TarrushSaxena/OneGate> (branch `sme-copilot`). Demo video (4:34, v1.8): <https://drive.google.com/file/d/1k9TLX-zRLWj-EsbKLIG_YcX9Gne9lPMM/view?usp=drivesdk>. Submission folder: <https://drive.google.com/drive/folders/1sksHP-oYGp0sC7nAqAZzvl535y9GnbHF>.

# 1. Summary

Small-business owners don't need another dashboard. They need someone to do the finance chores they never get to: chasing late invoices, spotting a cash crunch weeks out, and working out which loan they can actually get and what it really costs.

**OneGate SME** is an agentic finance copilot that does that work inside a strict safety envelope. For each SME it:

- reads a sandboxed ledger and forecasts cash at 30/60/90 days, with scenario ranges and a band calibrated on its own past errors
- ranks overdue invoices by risk, with Indian TDS and s.43B(h) rules applied
- **plans toward a goal**: "get me through the cash gap" becomes an 8-step plan over a guarded tool registry (forecast → rank debtors → queue reminders → size the residual gap → match financing → queue the loan → re-simulate)
- runs a daily **autopilot** that writes a morning brief and pays small recurring bills on its own, but only inside an owner-signed **spending mandate**
- takes supplier **early-pay discounts** only when they beat the cost of money and keep cash above the buffer
- explains every refusal with a **"Why not?"** card

An action that moves money or contacts a third party **executes only after the SME owner approves it**. Payments, loans and mandates also need the re-typed amount (payments) and a **one-time code** bound to that action and amount. The agent can never add a payee or change bank details, and nothing it says can change that: authority comes from a deterministic policy engine, not from language.

**Headline result (Ananya Textiles, sandbox date 12 Oct 2026).** The pessimistic forecast falls to **-₹7,62,344 on 24 Nov**, a gap of **₹11,74,344** below the ₹4,12,000 buffer (first breach 21 Oct). The planner queues **3 reminders** (expected ₹2,87,962) and **₹9,00,000 of TReDS invoice discounting** at 9.4% APR (estimated total cost **₹16,387**, funds in 3 days). With the plan the low point becomes **₹4,25,618**, above the buffer. Every figure is reproducible from `docs/sandbox-evidence/`.

| Scoring criterion | What we deliver |
|---|---|
| Task completion (40%) | Twelve agent tasks run end to end against three synthetic SMEs, including a multi-step cash-gap plan and a daily autopilot, with logged results (§3, §9) |
| Security & compliance (30%) | Four permission tiers, owner-only approval, amount re-type, one-time codes, hard limits, payee allowlist, mandates, a structuring check, an obfuscation-aware injection guard, a numeric grounding firewall for the LLM, tenant isolation, a hash-chained audit trail, a 21-attack red-team runner (21/21 blocked), an India rules pack and a written self-assessment (§6, §7) |
| Innovation & interaction (30%) | A treasury cockpit that opens on the cash runway and three action lanes, a calibrated forecast with a what-if stress test, dynamic discounting, GST-aware planning, an RBI Key Facts Statement gate, an owner's-phone panel for codes, a role switcher and a live red-team and tamper drill (§5, §8) |

# 2. Problem and users

**Target user:** owners of Indian micro and small businesses with 1–50 staff (traders, cafés, agencies, small manufacturers), usually with no finance team.

**Pain points:**

1. **Cash-flow blindness.** A shortfall is noticed only when it hits.
2. **Late receivables.** Chasing invoices is awkward and keeps getting postponed; TDS deductions make "what will actually arrive" unclear.
3. **Financing confusion.** Mudra loans, cash-credit overdrafts, TReDS invoice discounting and fintech lines differ in eligibility, fees and true cost.
4. **Statutory pressure.** GST, TDS, PF and ESIC dates arrive regardless of cash, and a supplier that hasn't filed GSTR-1 silently raises this month's GST cash payment.
5. **Risky automation.** Owners won't give a bot their bank account unless control is explicit, bounded and auditable.

# 3. Agent tasks (implemented)

| # | Task | Tier | Output | Endpoint |
|---|---|---|---|---|
| T1 | Treasury cockpit | READ | 45-day runway before/after the plan, three action lanes, guardrail status | `GET /api/sme/:tid/cockpit` |
| T2 | Forecast cash at 30/60/90 days | READ | Daily low/base/high path, calibrated band, lowest point, breach alert, backtest | `GET .../forecast` |
| T3 | What-if stress test | READ | New low point, first breach, cash needed, cheapest eligible financing; nothing stored | `POST .../whatif` |
| T4 | Rank overdue receivables | READ | Ageing, risk 0–100, net-of-TDS cash, 43B(h) flag, flagged notes, disputes | `GET .../receivables` |
| T5 | Chase a receivable | SUGGEST → EXECUTE | Reminder draft; "sent" to sandbox email only after owner approval | `.../receivables/:id/draft`, `POST .../actions` |
| T6 | Match financing | SUGGEST | Five products by total cost, eligibility reasons, an RBI-format Key Facts Statement each | `POST .../financing/match` |
| T7 | Pay a supplier / apply for a loan | EXECUTE | Pending approval; owner approves with amount, one-time code and (loans) KFS acknowledgement; sandbox receipt | `POST .../actions`, `.../stepup`, `.../approve` |
| T8 | Plan the cash gap (multi-step) | READ → EXECUTE (queued) | 8-step tool trace, approval cards, before/after simulation | `POST .../agent/plan` |
| T9 | Autopilot and mandates | SUGGEST; EXECUTE only inside a mandate | Morning brief, mandate payments, escalations | `.../autopilot`, `.../mandates` |
| T10 | GST and statutory planning | READ | GSTR-3B dues, ITC at risk, coverage, late cost; TDS/PF/ESIC/advance-tax calendar | `GET .../gst`, `GET .../compliance` |
| T11 | Supplier early-pay discounts | READ → EXECUTE | Annualised return vs hurdle, joint buffer check, queued card for the discounted amount | `GET .../discounts`, `POST .../discounts/:billId/propose` |
| T12 | Explain a refusal | READ | Why-not card: rule, real numbers, fix | every refusal body, `GET .../explain` |

All tasks can also be started in plain English (English or Hinglish) through the copilot, `POST /api/sme/:tid/copilot`. Disputes (`POST .../disputes`), the lender view (`GET .../privacy/lender-share`), the tamper drill and the red-team runner are covered in §6–§8.

# 4. System architecture

```
Browser: treasury cockpit (frontend/sme.html) + copilot drawer + owner's-phone panel
   │  HttpOnly SameSite=Strict session cookie (JWT, HS256, 8 h)
   ▼
Express (backend/server.js) ── core authenticate ──▶ /api/sme router (routes.js)
                                    1. membership → tenant + SME role (tenancy.js)
                                    2. :tid must equal the caller's tenant
                                    3. policy.evaluate(action, role, params)
  ┌──────────────────────────── READ / SUGGEST ────────────────────────────┐
  │ forecast · calibrate · whatif · receivables · financing · gst · india   │
  │ discounting · explain · privacy · cockpit                               │
  │ copilot.js ─ guard.js (before any model) ─▶ intent router  or           │
  │             agent.js: tool registry ─ deterministic planner             │
  │                                     └ optional LLM loop + grounding check│
  │ autopilot.js (role "agent": proposes, never approves) ─ mandates.js     │
  └────────────────────────────────────────────────────────────────────────┘
                                  │ EXECUTE (queued)
                                  ▼
  actions.js: pending ─(owner · amount re-type · stepup.js OTP · KFS hash ·
                         policy + structuring re-check)─▶ sandbox executor
                                  ▼
  auditChain.js: SHA-256 hash chain per tenant (mirrored to the core audit service)
```

**Modules (`backend/sme/`, 23 modules plus `data/sandbox.js`, about 2,900 lines):**

| File | Role |
|---|---|
| `data/sandbox.js` | Three synthetic SMEs, 180 days of transactions, invoices with payment history, payables with discount terms, verified beneficiaries, five loan products |
| `forecast.js`, `calibrate.js`, `whatif.js` | Forecaster with walk-forward backtest; conformal error band; stress test |
| `receivables.js`, `financing.js` | Ageing, risk, reminder drafts; explainable eligibility and cost |
| `agent.js` | Tool registry, deterministic multi-step planner, `simulate()`, optional LLM tool-calling with grounding check |
| `copilot.js` | Guards first, then intent router, planner or LLM loop |
| `autopilot.js`, `mandates.js`, `stepup.js` | Scheduled agent runs; bounded spending mandates; one-time codes |
| `discounting.js`, `gst.js`, `india.js` | Dynamic discounting; GSTR-3B planning; 43B(h), TDS, statutory calendar, KFS, cooling-off |
| `policy.js`, `actions.js`, `tenancy.js` | Tiers, limits, role matrix; propose/approve/execute with idempotency and structuring check; membership |
| `guard.js`, `privacy.js`, `explain.js` | Injection, phishing, PII redaction; banded lender share; why-not cards |
| `cockpit.js`, `auditChain.js`, `redteam.js`, `routes.js` | Cockpit summary; tamper-evident audit; 21-attack runner; REST API (35 routes) |

**Stack:** Node.js 20+, Express, plain HTML/CSS/JS dashboard, `node:test`. No database for the demo: state is in memory and rebuilt deterministically on start.

# 5. Core algorithms

## 5.1 Cash-flow forecast (`forecast.js`)

A transparent model with no training step. For each future day:

- **Sales:** mean sales per weekday over the last 90 days, scaled to the last 28 days' level.
- **Recurring obligations:** rent, salaries, utilities, supplier spend and GST on their calendar days.
- **Open receivables:** each open invoice arrives at *due date + the customer's average delay*, weighted by a Laplace-smoothed pay probability (paid + 1) / (n + 2). An invoice already past the customer's usual pay date loses half its probability about every 7 days, and what remains is spread over 2 to 6 weeks. Disputed invoices are excluded; TDS-deducting buyers pay net of TDS.
- **New invoices:** a collections run-rate that starts at the business's 25th-percentile issue-to-payment time and reaches full rate at the 75th (`collectionLag`).
- **Payables:** open bills on their due dates (or their scheduled early date).

**Scenarios:** low = sales ×0.9, receivables ×0.7 (×0.8 future), supplier spend ×1.05; high = sales ×1.1, receivables ×1.3 capped at 100% (×1.1 future), supplier spend ×0.95.

**Safety floor:** the pessimistic line used by every safety check (alerts, mandates, early payments, the planner) is the **lower of the scenario low and the calibrated band** (`low_uses_calibrated_floor`; the original is kept as `scenario_low`).

**Backtest:** walk-forward from 30 days back, without seeing later data; base case vs actual balance.

| SME | Profile | 30-day MAPE (v1.8) | Before the v1.8 fix |
|---|---|---|---|
| Chai Point Cafe | Café, steady daily sales | **3.63%** | 3.93% |
| PixelForge Design Studio LLP | B2B services, lumpy invoices | **8.68%** | 7.89% |
| Ananya Textiles Pvt Ltd | Wholesale, slow payers | **14.82%** | 26% |

**Why v1.8 changed the model.** The calibration (§5.2) showed the base case ran optimistic at 16–45 days: on a 40-day backtest it expected ₹26.2 lakh of receipts for Ananya against ₹12.0 lakh actual, mainly because the new-invoice run-rate ramped in from day 1 although no invoice in this history is paid sooner than about 25–38 days after issue. The three changes above (collection lag, faster overdue decay, recent sales level) brought expected receipts to ₹16.1 lakh and Ananya's MAPE from **26% to 14.82%**. PixelForge's MAPE is slightly worse but its median 31–45-day bias fell from -₹3,10,415 to -₹52,591.

## 5.2 Calibrated band and what-if (`calibrate.js`, `whatif.js`)

The forecaster is re-run from every 3rd day between day 90 of the history and 15 days before the sandbox date: 26 start dates, up to 45 days ahead each. Errors (actual − base) are bucketed by horizon (1–15, 16–30, 31–45 days) and the band uses finite-sample conformal quantiles at 10% and 90% (the ⌈(n+1)q⌉-th error), widened by √(h/45) beyond 45 days. On the calibration windows it covers **80.0%** of outcomes for each SME (1,005 checks each). **Limits:** windows overlap, so errors are correlated, and this is one synthetic history: an empirical band, not a guarantee.

**What-if** re-runs the same forecaster with clamped adjustments (top N debtors pay D days later, sales ±X%, supplier costs ±Y%, a one-off expense on a day) and returns the new low point, the first breach, the cash needed to hold the buffer and the cheapest eligible financing for that amount. It writes nothing to the queue or the audit chain (tested).

## 5.3 Receivable risk and Indian rules (`receivables.js`, `india.js`)

`risk = min(100, round(0.9 × lateness + 60 × (1 − pay_probability)))`, where lateness is days past the customer's *own* usual delay; invoices are ranked by `amount × risk` in ageing buckets.

- **TDS on receipts:** PixelForge's buyers deduct 10% under s.194J on the pre-GST value (CBDT Circular 23/2017), so the table shows cash in after TDS and reminders ask for Form 16A. The section is a per-business setting (s.194C at 2% is possible).
- **s.43B(h), Income-tax Act:** a buyer can deduct a payment to a Udyam-registered micro or small manufacturer/service provider (traders excluded) only in the year it pays, if it pays after the MSMED Act s.15 limit (15 days, up to 45 by agreement). It is worded as a **timing penalty for the buyer**. Sandbox: Ananya is a small trader (not covered), Chai Point is not registered, PixelForge is a micro service firm with a 45-day agreement (covered); its reminders past the limit add one sentence saying so.
- **Disputes:** a disputed invoice drops out of the chase list, the planner and the forecast, and reminders for it are refused; a disputed bill can't be paid, not even under a mandate.

## 5.4 Financing and the Key Facts Statement (`financing.js`, `india.js`)

Five sandbox products: PMMY Tarun 10.25%, PMMY Kishor 10.75%, cash-credit OD 11.5%, TReDS invoice discounting 9.4%, fintech NBFC line 19%. Hard eligibility rules (amount range, vintage, credit score, open receivables for discounting, time to disburse vs need), then cost by EMI plus processing fee; the cheapest eligible option is recommended and every ineligible one names its blocking rule.

Each product carries an RBI-format **KFS**: all-in APR (the yearly rate equating the amount received after fees with the instalments), fees, penal charges (never compounded), cooling-off period, regulated entity, grievance officer, direct-to-borrower disbursal and a SHA-256 hash. Loan approval requires `kfs_ack` equal to that hash, checked **before** the one-time code is spent. A product that disburses through a third party is denied at proposal. Inside the cooling-off window the owner can exit (`POST /actions/:id/cooling-off-exit`), repaying principal plus interest for the days used, with no penalty. Terms are illustrative, not a credit offer.

## 5.5 Agentic planner and tool registry (`agent.js`)

Tools are closures bound to the caller's tenant and actor, each with a tier:

| Tier | Tools |
|---|---|
| READ | `get_cash_forecast`, `list_overdue_receivables`, `list_open_bills`, `simulate_plan`, `get_gst_calendar` |
| SUGGEST | `match_financing`, `draft_reminder`, `find_early_pay_discounts` |
| EXECUTE (queue only) | `propose_reminder`, `propose_payment`, `propose_loan_application`, `propose_early_payment` |

No DENY capability exists as a tool. The deterministic **cash-gap planner** runs 8 steps: forecast → rank overdue invoices → `propose_reminder` for up to 3 debtors whose expected recovery (60% of the probability-weighted value within 7 days) closes most of the gap → size the residual (rounded up to ₹50,000) → `match_financing` for products that disburse before the breach → `propose_loan_application` → `simulate_plan`. Assumptions are returned with every plan. It is reproducible and idempotent (re-planning returns the same cards), nothing executes, and every step is an audit entry `agent.tool.<name>`. Loan repayments after the 45-day horizon are not yet modelled.

## 5.6 Optional LLM tool-calling with a grounding check

When `SME_LLM_API_KEY` (or `ZENMUX_API_KEY`) is set, the copilot runs a tool-calling loop over the **same registry** with any OpenAI-compatible model (up to 6 steps). Guards run **before** the model, so injections never reach it; unknown tool names are refused; viewers get READ tools only; at most 3 EXECUTE proposals per run; tool results are PII-redacted and invoice notes withheld. **Grounding check:** every amount ≥ 1,000 in the final answer must match (within 1%) a number from a tool result or the user's message, or the answer is discarded. Any failure (timeout, bad JSON, step budget, ungrounded number) falls back to the **deterministic** answer, logged as `agent.llm_fallback`.

**Not yet run live.** The guardrails are tested with a scripted fake model (grounded answer accepted, an invented ₹98,76,543 rejected, `add_beneficiary` refused, injection blocked with zero model calls, API failure falls back). A live-model evidence script exists (`backend/sme/scripts/live-llm-check.js`, seven prompts including a trap and a Hinglish attack), but it has **not been run against a real model yet**, because no key was available; the demo and all results here use the deterministic planner.

## 5.7 Autopilot and mandates (`autopilot.js`, `mandates.js`)

The autopilot runs daily (and on demand) as its own identity, `sme_role: "agent"`, which can read, suggest and propose but **never approve**, not even its own proposals. Each run re-forecasts, tries to pay open bills under a mandate (turning each refusal into an approval card with the reason), runs the planner if a gap is coming, and writes a **morning brief**. The owner can pause it.

A **mandate** (owner-only, signing needs a one-time code) names one verified payee, a per-payment ceiling (hard max ₹2,00,000), a monthly cap (hard max ₹5,00,000) and 1–90 days of validity; it pays only an open bill from that payee due within 3 days, and **never** when the 30-day pessimistic forecast is below the buffer. Platform limits still apply. Sandbox: Chai Point's autopilot paid ₹22,400 to FreshFarm Dairy and did not pay twice; Ananya's escalated its bill to the owner instead of paying, because cash already breaches the buffer.

## 5.8 Dynamic discounting and GST (`discounting.js`, `gst.js`)

Discounts are annualised as `d/(1−d) × 365/days early` (1% for 7 days = 52.67%; 1.5% for 18 days = 30.88%) and compared with a hurdle: idle-cash yield (6.5%) or, when a gap is coming, the cheapest eligible loan APR, so the agent never borrows to chase a discount. Offers are checked **jointly** on the pessimistic path; a worthwhile one becomes an EXECUTE card for the discounted amount, and a forged amount is denied (`discount_terms_mismatch`). Chai Point takes both offers (₹1,235); PixelForge takes ₹378, and its second ₹540 offer only when the joint cash check allows; Ananya's are **held back** because paying ₹4,15,800 early would break the buffer.

GST planning lists each GSTR-3B due date with net cash payable (output tax less ITC), **ITC at risk** from suppliers who haven't filed GSTR-1 (Ananya ₹25,248 from Om Logistics), coverage (`covered`/`tight`/`short`) and the cost of paying late (18% a year under s.50 plus the late fee). The statutory calendar adds TDS (7th), GSTR-1 (11th), PF/ESIC (15th) and advance tax dates. Indicative sandbox rates, not tax advice.

## 5.9 Treasury cockpit (`cockpit.js`)

`GET /cockpit` is read-only and returns the **45-day runway** (cash today → low point if nothing changes → the plan → low point with the plan), three **lanes** (paid under a mandate; waiting for you; blocked by policy, each with an audit sequence number and why-not card) and guardrail status. The "with the plan" figure comes from the same `simulate()` the planner uses, fed with the plan's actions: those **waiting** for the owner plus reminders and loan applications the owner has **already approved** whose cash has not landed (sandbox execution produces a receipt but posts no cash to the ledger, so nothing is counted twice). Rejected or expired actions drop out.

# 6. Security design

The full threat model, test mapping and red-team results are in `docs/SECURITY_SELF_ASSESSMENT.md`.

## 6.1 Permission tiers (`policy.js`)

| Tier | Actions | Who |
|---|---|---|
| READ | overview, forecast, receivables, financing, GST, discounts, compliance | owner, accountant, viewer |
| SUGGEST | draft reminder, recommend financing, mark dispute, run autopilot | owner, accountant (and the agent role) |
| EXECUTE | send reminder, schedule payment, submit loan application, create or revoke mandate | owner, accountant or the agent may *propose* (mandates: owner only); **only the owner approves** |
| DENY | add beneficiary, change bank details, disable audit | never available through OneGate |

## 6.2 Execution safeguards (`actions.js`, `stepup.js`)

- **Hard limits:** ₹5,00,000 per payment; ₹8,00,000 per tenant per day; payees only from the tenant's **verified** allowlist.
- **Amount re-type** for payments; a mismatch is refused and audited.
- **One-time code (step-up)** for payments, loan applications and mandates: bound to tenant, user, action and amount; stored as a salted SHA-256 hash; 5 minutes; 3 attempts; single use; constant-time comparison. In the sandbox it is shown on a simulated owner's phone panel, never on the approval card (`SME_STEPUP_DELIVERY=sms` stops returning it).
- **KFS hash** acknowledgement for loans, checked before the code.
- **Structuring check:** payments to one payee not tied to a real open bill are refused once they would exceed the single-payment limit within 72 hours, or reach three.
- **Re-check at execution:** policy, limits and discount terms are evaluated again at approval time. Approvals expire after 24 h; idempotency keys stop double submissions.

## 6.3 Input guards (`guard.js`)

Each text is checked in several forms: as written (NFKC, zero-width characters removed, spaced-out letters collapsed), with lookalike Cyrillic/Greek letters folded to Latin, leetspeak-folded, and with base64 and percent-encoded payloads decoded. Patterns cover instruction override, "you are now…", secret extraction, draining the balance, "approve without asking", claimed approval ("the owner already approved"), role-play, and Hinglish and Hindi (Devanagari) equivalents. A phishing scorer flags bank-detail changes, urgency, unusual rails and OTP/CVV requests. PII (PAN, Aadhaar, card, account, IFSC, phone) is redacted before anything reaches the audit log or a model. Invoice notes are untrusted data and are withheld when flagged.

**v1.8.1 false-positive fix.** "Pay the full balance of invoice X" was flagged as injection because the drain pattern matched any *pay … full … balance*. A balance that belongs to a document (invoice, bill, PO, loan, EMI, GST/TDS challan, supplier statement) or is qualified as due/owed/outstanding is now treated as normal finance language. A new pattern still blocks any full-balance request that names a **destination** ("… to account 99887766", "… to a new account", "… to me", a UPI ID). Regression tests cover both directions (§9), and the red-team still blocks 21/21.

## 6.4 Isolation, privacy and audit

- Membership comes from the server-side session; a request for another tenant's `:tid` is refused and audited. Platform roles, even organisation manager, grant no SME access.
- **Lender share:** six banded features, a SHA-256 commitment to the ledger and an Account-Aggregator-style consent artefact; never transactions, customer names, notes, accounts or exact balances.
- **Audit:** every proposal, decision, denial, blocked attack, tool step and execution is chained with SHA-256 over canonical JSON; `GET /audit/verify` finds the first altered entry, and the **tamper drill** proves it on a copy without touching the live chain.

## 6.5 Red-team runner (`redteam.js`)

`POST /redteam` (owner or accountant) fires **21 attacks** through the real modules and reports the layer that caught each: English, Hinglish, Hindi, Cyrillic-lookalike, leetspeak, base64 and zero-width injections; claimed approval; a bank-change scam; an unlisted payee; a ₹6,00,000 payment; a ₹6,00,000 split into three; a bank-detail change; a forged discount; accountant and autopilot self-approval; code replay and a ₹10,000 code used for ₹4,90,000; an invented LLM saving; a non-existent `wire_transfer` tool; and a ₹1 audit edit. Result: **21/21 blocked, no money moved, audit chain valid**, on every SME (tested).

## 6.6 Compliance alignment (indicative, not certified)

- **RBI Digital Lending Directions:** KFS with all-in APR before applying, explicit borrower approval, direct disbursal, cooling-off exit, recorded consent.
- **DPDP Act 2023:** data minimisation (redaction, banded lender share), purpose-limited consent, tenant isolation.
- **GST / Income-tax:** s.16(2)(aa) ITC timing, s.50 interest, s.43B(h), s.194J TDS, as sandbox rules.
- **CERT-In:** timestamped, tamper-evident decision log.

# 7. v1.8.1 fixes found while recording the demo

| Bug | Root cause | Fix |
|---|---|---|
| Typing the amount, then clicking the code field or "Preview email", wiped the amount, so Confirm failed with "Amount does not match" | `#approvals.onclick` re-rendered the whole approval list on **any** click inside it, and inputs were rendered empty | The handler acts only on real action buttons (Approve, Confirm, Reject, Exit loan) and returns early otherwise; typed amounts and codes are kept per action and restored on every re-render (a wrong code keeps the amount) |
| Approving one plan reminder made the runway show 2 reminders, the "with the plan" low fall to about ₹2.6 lakh "still below buffer", and the headline flip to "The plan helps, but cash still dips…" | `cockpit.planFromPending()` simulated only actions with status `pending_approval`; an approved reminder vanished from the plan although its cash had not arrived | Approved reminders and submitted loans count as **done or in progress**; the runway shows "3 reminders + ₹9,00,000 loan · 1 done · 3 waiting" and the low stays at **₹4,25,618**; when everything is approved the headline reads "Plan approved: cash stays above the buffer" |
| The financing amount (e.g. ₹9,00,000) carried over after "Switch business" | `boot()` reset chat and what-if but not the financing form | The amount, days, KFS panel, typed values and pending code state reset on every business switch |
| "Pay the full balance of invoice X" flagged as injection | Over-broad drain pattern | See §6.3 |

None of these changed the headline numbers or the screens before approval; they change what the screen shows **after** an approval and what the guard lets through.

# 8. Interaction design (`frontend/sme.html`)

- **Sign-in:** six demo SME users (Ananya owner/accountant/viewer, Chai Point owner, PixelForge owner/viewer); a **role switcher** ("View as") makes separation of duties visible.
- **Treasury cockpit:** headline, 45-day runway, the morning brief, the 8-step plan trace with tiers, and three lanes.
- **Approval cards:** proposer, tier, why-not warnings, email preview, KFS with acknowledgement, amount box, one-time code delivered to the **owner's-phone** panel; non-owners see "Approve · owner only".
- **Forecast chart** with scenario band, calibrated band and buffer line, plus **what-if sliders**.
- **Receivables** with risk, TDS and 43B(h) tags, Remind and Dispute; **financing** with all-in APR and KFS; **supplier discounts & GST**; **statutory calendar**; **mandates**; **what a lender sees**; **audit trail** with a live chain badge.
- **Copilot drawer:** quick prompts, "Try an attack", why-not cards inline; **Run red-team** and **Run tamper drill** in the guardrail strip.

# 9. Testing and execution evidence

- **Automated tests:** `node backend/tests/run-all-tests.js` runs **48 test suites, all passing** (16 Oct 2026). **135 SME tests** across `sme-01`…`sme-09` cover the forecast and backtest, calibration coverage, what-if, receivables and the planted injection note, financing and KFS, guards (paraphrase, obfuscation, Hinglish/Hindi, no false positives), policy, structuring, audit tamper detection, tenancy, step-up codes, mandates, autopilot, the planner, LLM guardrails with a scripted model, discounting, GST, India rules, disputes, the cockpit and the red-team. The v1.8.1 fixes added 7 regression tests (128 → 135): the runway after approving one reminder, after approving everything, and after rejecting one; the approval-card and financing-reset code paths; benign full-balance phrasing allowed; destination-naming drains still blocked; and the red-team staying 21/21.
- **Red-team runner:** 21/21 blocked, no money moved, chain valid (Ananya and Chai Point re-run 16 Oct 2026).
- **Real-browser check (Playwright, 16 Oct 2026):** click into the code field after typing the amount → amount kept, payment executed; approve one reminder → runway still "₹4,25,618, stays above the buffer"; type ₹9,00,000 in financing, switch business → ₹5,00,000.
- **Sandbox run:** `node backend/sme/scripts/sandbox-run.js` writes `docs/sandbox-evidence/` (every prompt, decision and result, plus one hash-chained audit file per SME and `SUMMARY.md`): attacks blocked, phishing warned and policy denials on all three SMEs; owner-approved payments executed; the plan for Ananya (8 steps, 4 cards); mandate payments for Chai Point and PixelForge and an escalation for Ananya; all chains valid.

# 10. Running it

```
git clone https://github.com/TarrushSaxena/OneGate.git && cd OneGate/backend
npm install
npm run provision:demo        # creates the demo users and prints a one-time password
npm start                     # http://localhost:3000/sme.html
node tests/run-all-tests.js   # 48 suites
```

No secrets are needed for the SME demo. Optional: `SME_LLM_API_KEY`, `SME_LLM_BASE_URL`, `SME_LLM_MODEL` switch the copilot to LLM tool-calling.

# 11. Limitations and roadmap

**Known limitations:** state is in memory; membership is a static demo table; detection is rule-based (novel phrasing can evade it, which is why authority never depends on it); one-time codes are shown on screen in the sandbox; the calibrated band is empirical on one synthetic history; the planner doesn't yet model loan repayments after the horizon; **the live-LLM path has not been run against a real model**; platform CORS is open and there is no CSP or per-route rate limit yet; an old LLM-provider (Zenmux) API key remains in early git history, removed from the working tree and **pending revocation by the key owner** (history has not been rewritten).

**Roadmap:** persistent append-only storage with the chain head anchored externally; real SMS or passkeys for step-up; learned per-customer payment curves; a classifier second opinion beside the rule guards; live-LLM evidence runs; Account Aggregator, GSTN (via a GSP), TReDS and lender APIs; a federated credit model across lenders (for example FATE) fed by the banded features; Docker deployment.

# 12. Team

| Member | Role |
|---|---|
| Tarrush Saxena (Lead) | Product, copilot and agent design, pitch |
| Yogya Mittal | Forecasting and financing logic |
| Utkarsh Gupta | Backend, policy engine and security |

All three are B.Tech Computer Science and Engineering students at Bennett University, India.
