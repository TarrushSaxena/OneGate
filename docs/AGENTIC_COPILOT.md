# OneGate SME: the agentic layer

**AI as a financial participant, with authority that comes from code.**
Version 1.2 · 14 Oct 2026 · Team GateKeepers · Topic E: SME Finance Copilot

The first version of OneGate SME answered questions and proposed one action at a time. Version 1.2 makes the agent a participant: it plans several steps toward a goal, works on a schedule without being asked, and pays small recurring bills on its own inside a mandate the owner signed. None of that widens what language can do. The model chooses *which* tool to call. Policy, approvals, mandates and the audit chain decide *what happens*.

![Architecture](architecture.svg)

---

## 1. Multi-step planner (`backend/sme/agent.js`)

**Goal:** "get me through the cash gap". The planner chains registered tools and returns one plan:

| Step | Tool | Tier | What it does |
|---|---|---|---|
| 1 | `get_cash_forecast` | READ | Finds the pessimistic low point and the first buffer breach |
| 2 | `list_overdue_receivables` | READ | Ranks debtors by risk-weighted value, with each customer's historical pay probability |
| 3–5 | `propose_reminder` ×≤3 | EXECUTE (queued) | Picks the debtors whose expected recovery closes most of the gap, and queues reminders for approval |
| 6 | `match_financing` | SUGGEST | Sizes the remaining gap (rounded up to ₹50,000) and matches products that disburse before the breach, ranked by total cost |
| 7 | `propose_loan_application` | EXECUTE (queued) | Queues the cheapest eligible application for approval |
| 8 | `simulate_plan` | READ | Re-runs the forecast with expected collections and the loan applied, and reports the low point before and after |

**Result on Ananya Textiles (sandbox, 12 Oct 2026):** gap ₹11,74,344 (first breach 21 Oct, low point 24 Nov); three reminders worth about ₹2,87,962 expected; ₹9,00,000 TReDS invoice discounting at 9.4% APR (est. total cost ₹16,387, 3-day disbursal); the low point moves from **-₹7,62,344 to ₹4,25,618** and stays above the ₹4,12,000 buffer.

**Planning assumptions** are returned with every plan so the owner can challenge them: a reminder recovers 60% of the probability-weighted invoice value within 7 days; at most 3 reminders per plan; financing rounded up to ₹50,000. Loan repayments after the horizon are not yet modelled in the simulation.

**Properties:** deterministic and reproducible; idempotent (re-planning on the same day returns the same approval cards instead of duplicates); nothing executes; every step is an audit entry `agent.tool.<name>`.

## 2. LLM tool-calling, with a grounding firewall

When `SME_LLM_API_KEY` (or `ZENMUX_API_KEY`) is set, `POST /api/sme/:tid/copilot` runs a tool-calling loop over the **same registry** with any OpenAI-compatible model:

```
system: tools + rules  →  model: {"tool": "...", "args": {...}}  →  server runs the tool  →  TOOL_RESULT
        …up to 6 steps…  →  model: {"final": "..."}  →  grounding check  →  reply
```

| Guardrail | Enforced where |
|---|---|
| Guards run **before** the model: injections and phishing never reach it | `copilot.respond()` |
| The model never names a tenant: tools are closures bound to the caller's tenant | `makeTools(tenantId, actor)` |
| Unknown tool names are refused (no DENY action exists as a tool) | `runLLM()` allowlist |
| Viewers can only use READ tools; at most 3 EXECUTE proposals per run | `runLLM()` |
| EXECUTE tools only **queue** an action; approval is a separate owner-only API with amount re-type and a one-time code | `actions.propose()` / `decide()` |
| Tool results are PII-redacted and truncated before they go back to the model; invoice notes are withheld | `redactPII`, `receivables()` |
| **Grounding check:** every amount ≥ 1,000 in the final answer must match (within 1%) a number from a tool result or the user's message, or the answer is discarded | `groundingCheck()` |
| Any failure (timeout, bad JSON, step budget, ungrounded number) falls back to the deterministic path, logged as `agent.llm_fallback` with the reason | `copilot.respond()` |

Without a key, the deterministic planner and intent router answer everything, so the demo needs no secrets. The guardrails are tested with a scripted fake model in `sme-04-agent.test.js`: grounded answer accepted, invented ₹98,76,543 rejected, `add_beneficiary` refused, injection blocked with **zero** model calls, API failure falls back.

## 3. Autopilot (`backend/sme/autopilot.js`)

Runs daily (`SME_AUTOPILOT_INTERVAL_MIN`, default 1440; first run shortly after boot) and on demand (`POST /autopilot/run`). For each SME it:

1. re-forecasts and reads alerts;
2. tries to pay each open bill under a mandate, and turns every refusal into an approval card with the reason;
3. if a gap is coming, runs the multi-step planner; otherwise queues reminders for invoices over 30 days late with risk ≥ 60;
4. writes a **morning brief** (headline, events, approvals waiting) shown at the top of the dashboard.

It acts as its own identity, `sme_role: "agent"`: it can read, suggest and propose, and it **can never approve**, not even its own proposals (tested). The owner can pause it (`POST /autopilot/pause`); paused runs are skipped and logged.

## 4. Spending mandates: bounded autonomy (`backend/sme/mandates.js`)

A mandate is a programmable spending policy, the same idea as an e-mandate or UPI AutoPay registration, applied to an AI agent.

| Rule | Value |
|---|---|
| Who can sign or revoke | owner only, signing needs a one-time code |
| Payee | exactly one beneficiary already on the verified allowlist |
| Per payment | ≤ owner's ceiling, hard max ₹2,00,000 |
| Monthly cap | ≤ owner's cap, hard max ₹5,00,000 |
| Validity | 1–90 days, revocable at any time |
| What it can pay | an open bill from that payee, due within 3 days |
| Cash safety | **never** if the 30-day pessimistic forecast is below the safety buffer; escalates instead |
| Platform limits | still applied: ₹5,00,000 per payment, ₹8,00,000 per day, DENY list |

**Sandbox results:** Chai Point (healthy cash) — the autopilot paid ₹22,400 to FreshFarm Dairy under the mandate, and a second run did not pay twice. Ananya (cash gap) — the autopilot **refused** to auto-pay the ₹48,000 freight bill and sent it to the owner, because the forecast already breaches the buffer.

## 5. Step-up codes (`backend/sme/stepup.js`)

Approving a payment or loan application, and signing a mandate, needs a 6-digit code on top of the session. A code is bound to one tenant, one user, one action and one amount; stored only as a salted SHA-256 hash; valid for 5 minutes; 3 attempts; single use; compared in constant time. In the sandbox the code is returned as a "sandbox SMS", which the dashboard shows on a simulated owner's phone, never on the approval card, so the demo runs anywhere; set `SME_STEPUP_DELIVERY=sms` to stop returning it. A stolen session alone can no longer approve anything.

## 6. Privacy: share the score, not the books (`backend/sme/privacy.js`)

When a loan application executes, the lender receives:

- six **banded** features: business vintage, credit-score band, average monthly inflow band, inflow volatility, overdue-receivables share, GST registration;
- a **SHA-256 commitment** to the ledger they were computed from, so an auditor can later prove the features came from the books the SME held at consent time;
- a **consent artefact** modelled on the RBI Account Aggregator framework: purpose `loan_underwriting`, data scope, 30-day validity, revocable.

Never shared: transactions, customer names, invoice notes, beneficiary accounts, exact balances. The owner sees exactly this view in the dashboard ("What a lender sees").

**Federated next step (designed, not built).** Banded features let one lender decide on one SME. To *improve* the model behind those decisions without pooling SME ledgers, lenders and the platform can train a shared risk model with horizontal federated learning (for example WeBank's open-source **FATE**): each party trains on its own repayment outcomes, only encrypted gradient updates are aggregated, and no raw ledger leaves its owner. OneGate's role would be the consented feature extractor on the SME side.

## 7. Dynamic discounting (`backend/sme/discounting.js`)

Suppliers often offer a discount for paying early (sandbox terms: 1% if paid within 2 days on a 9-day bill, 1.5% if paid 18 days early). For each open bill with terms the agent:

1. annualises the discount: `d / (1 - d) × 365 / days early` (1% for 7 days = **52.67%**, 1.5% for 18 days = **30.88%**)
2. sets a hurdle: idle-cash yield (6.5%, sandbox liquid fund), or, when the forecast shows a gap, the cheapest eligible loan APR (9.4% for Ananya), so it never borrows to chase a discount
3. re-runs the pessimistic forecast with the outflow moved from the due date to the early date (smaller amount, earlier), **jointly with every other offer it takes** (highest return first), and refuses if cash dips below the safety buffer in between

A worthwhile offer becomes a normal EXECUTE approval card for the **discounted** amount. The owner re-types that amount and enters a one-time code. `actions.propose` and the approval re-check both verify the amount and date match the supplier's terms, so a forged "discount" is denied (`discount_terms_mismatch`). On execution the bill is settled early at the discounted amount and the forecast moves the outflow.

| SME | Result |
|---|---|
| Chai Point | Both offers worth it: ₹851 + ₹384 = **₹1,235** saved, queued by the autopilot for approval |
| PixelForge | Both worth it: ₹378 + ₹540 |
| Ananya | Both **held back**: paying ₹4,15,800 early breaks the ₹4,12,000 buffer on 14 Oct (hurdle 9.4% because a gap is coming) |

## 8. GST-aware planning (`backend/sme/gst.js`)

- **Calendar:** every GSTR-3B due date in the horizon (the 20th for monthly filers). The net cash payable is the same figure the forecast subtracts, split into output tax and input tax credit (ITC) from the last month's supplier purchases.
- **Credit at risk:** ITC is available only for invoices in your GSTR-2B (s.16(2)(aa) CGST Act). A supplier that hasn't filed GSTR-1 pushes that credit to a later month, so this month's cash payment rises (deferred, not lost). Ananya: ₹25,248 at risk from Om Logistics. PixelForge: ₹4,134 from Prime Packaging.
- **Coverage:** `covered` (buffer intact even if the credit is blocked), `tight` (only if it isn't blocked) or `short`, from the pessimistic path on the due date.
- **Cost of paying late:** 18% a year on the net cash liability (s.50) plus ₹50/day (s.47), capped at ₹2,000 / ₹5,000 / ₹10,000 by turnover. When cash is short the agent says plainly: never delay GST, borrowing is cheaper.
- **Sector rules:** Chai Point (restaurant service at 5%) gets no ITC; PixelForge (design services) is at 18% with ITC.

Indicative sandbox rates, not tax advice. Production reads filing status from GSTN through a GSP.

## 9. "Why not?" cards (`backend/sme/explain.js`)

Every reason code the system produces (policy, mandates, step-up, discounts, guards) maps to a card with the **rule**, a **detail** with the real numbers, and a **fix**. Explaining never changes a decision. Cards appear on:

- every API refusal (`why_not` in 400/401/403/409 bodies)
- approval-card warnings
- autopilot brief events (escalations, held-back discounts)
- refused agent tool calls, including on the LLM path
- the chat: ask *"why not?"* and the copilot explains the last refusal straight from the audit chain

`GET /api/sme/:tid/explain?codes=…` exposes the mapping.

## 10. Treasury cockpit (`backend/sme/cockpit.js`, `frontend/sme.*`)

The dashboard opens on what the agent did, not on a chat box. `GET /cockpit` is read-only (it writes nothing to the audit chain or the queue) and returns:

- **Runway (next 45 days):** cash today, the low point if nothing changes, the plan waiting for the owner (reminders plus any loan application), and the low point if the owner approves it. The "after" figure comes from the same `simulate()` the planner uses, fed with the plan's actions: those waiting in the queue plus reminders and loan applications the owner already approved whose cash hasn't landed (v1.8.1; before, an approved reminder dropped out and the low point fell). It matches the planner's own output before and after approvals (tested); rejected actions drop out.
- **Three lanes:** *paid under a mandate* (executed actions that carry a mandate id and receipt), *waiting for you* (pending approvals), and *blocked by policy* (held-back early payments, invoice notes that tried to instruct the AI, and the latest audited denials, each with its audit sequence number and a why-not card). Viewers don't see audited denials or the chain.
- **Guardrails:** audit-chain status and head hash, numeric firewall, injection guard, and whether the planner is deterministic or LLM with a grounding check.

UI changes: a role switcher (owner, accountant and viewer for Ananya) makes separation of duties visible, and a non-owner sees *Approve · owner only*. One-time codes appear on a simulated **owner's phone** panel instead of on the approval card. The chat is a side drawer opened from *Ask copilot*. The 8-step plan trace sits under *How the agent planned it*.

**Tamper drill** (`POST /audit/tamper-drill`, owner or accountant): copies the tenant's chain, adds ₹1 to one amount in the copy, and re-verifies. Verification fails at exactly that entry because its recomputed hash no longer matches the stored one. The live chain is never modified, and the drill itself is audited.

## 11. Forecast bands from past errors and the what-if stress test (`calibrate.js`, `whatif.js`)

**Calibration.** The forecaster is re-run from every 3rd day between day 90 of the history (it needs 90 days of lookback) and 15 days before the sandbox date: 26 start dates and up to 45 days ahead each. The error at each horizon (actual minus base case) is collected in three buckets (1 to 15, 16 to 30 and 31 to 45 days). The band uses the finite-sample conformal quantiles at 10% and 90% (the ceil((n+1)q)-th error). Beyond 45 days the last band is widened by sqrt(h/45). On the calibration windows it covers 80.0% of outcomes for each SME (1,005 checks each). Limits: the windows overlap, so the errors are correlated, and this is one business's history, so it is an empirical band, not a guarantee.

**What it found, and the v1.8 fix.** In v1.5 the errors were mostly negative at 16 to 45 days, so the base case ran optimistic. On a 40-day backtest the model expected ₹26.2 lakh of receipts for Ananya against ₹12.0 lakh actual. The main cause was the run-rate for invoices not yet issued: it ramped in from day 1, but in this history no invoice is paid sooner than about 25 to 38 days after issue. Three changes:

1. Collections from new invoices start only at the business's 25th-percentile issue-to-payment time and reach the full run-rate at the 75th (`collectionLag`).
2. An invoice already past its customer's usual pay date loses half its probability about every 7 days (was every 14), and what remains is spread over 2 to 6 weeks (was 1 to 3).
3. The day-of-week sales shape is scaled to the last 28 days' level, so the seasonal trend isn't averaged away.

| SME | 30-day MAPE before → after | Median 31 to 45-day error before → after |
|---|---|---|
| Ananya | 26% → 14.82% | -₹11,55,897 → -₹2,72,294 |
| Chai Point | 3.93% → 3.63% | -₹1,40,910 → -₹42,121 |
| PixelForge | 7.89% → 8.68% | -₹3,10,415 → -₹52,591 |

On a 40-day backtest, Ananya's expected receipts went from ₹26.2 lakh to ₹16.1 lakh, against ₹12.0 lakh actual. PixelForge's MAPE is slightly worse, but its bias is far smaller.

**Safety floor.** Every forecast now sets the pessimistic line to the lower of the scenario low and the calibrated band (`low_uses_calibrated_floor`, with the original kept as `scenario_low`), so mandates, early payments, buffer alerts and the planner all use the more cautious of the two. The calibration runs and the walk-forward backtest use the raw model. The headline changed: Ananya's gap is now ₹11,74,344, the plan borrows ₹9,00,000, and the low point moves from -₹7,62,344 to ₹4,25,618. Chai Point's and PixelForge's mandate payments and early-pay discounts are unchanged.

**What-if.** `POST /whatif` re-runs the same forecaster with adjustments: the top N debtors pay D days later, sales change by X%, supplier costs change by Y%, and a one-off expense lands on a day. Inputs are clamped. It returns the low point before and after, the first buffer breach, the cash needed to hold the buffer, and the cheapest eligible financing for that amount. It writes nothing to the audit chain or the queue (tested).

## 12. India rules pack (`india.js`)

- **s.43B(h), Income-tax Act.** A buyer can deduct a payment to a Udyam-registered micro or small enterprise (a manufacturer or service provider; traders are excluded) only in the year it actually pays, if it pays after the MSMED Act s.15 limit (15 days, or up to 45 with a written agreement). It is a timing penalty for the buyer. Sandbox registrations: Ananya is a small trader (not covered), Chai Point is not registered, and PixelForge is a micro service firm with a 45-day agreement (covered). Reminders for PixelForge invoices past the limit add one sentence saying exactly this.
- **TDS on receipts.** PixelForge's buyers deduct 10% under s.194J on the value before GST (CBDT Circular 23/2017), so receivables show cash in after TDS and reminders ask for Form 16A. Some buyers may use s.194C (2%) instead; the section is a per-business setting.
- **Statutory calendar.** TDS deposit on the 7th (30 April for March), GSTR-1 on the 11th, PF and ESIC on the 15th, GSTR-3B on the 20th with the planner's amount and coverage status, and advance tax on 15 June, September, December and March, each with the consequence of paying late.
- **Key Facts Statement.** Each product gets an RBI-format KFS: the all-in APR solved as the yearly rate that equates the amount received after fees with the instalments, the processing fee, penal charges (never compounded), the cooling-off period, the regulated entity, the grievance officer, direct-to-borrower disbursal and a SHA-256 hash. A loan action carries its KFS, and approval needs `kfs_ack` equal to that hash, checked before the one-time code is spent. A product that disburses through a third party is denied at proposal. Inside the cooling-off window the owner can exit (`POST /actions/:id/cooling-off-exit`), repaying principal plus interest for the days used, with no penalty.
- **Disputes.** `POST /disputes` (owner or accountant, audited) marks an invoice or bill disputed. A disputed invoice drops out of the chase list, the planner and the forecast, and a reminder for it is refused. A disputed bill can't be paid, not even under a mandate.

## 13. Red-team runner and guard hardening (`redteam.js`, `guard.js`)

The input guard now checks several versions of each text: the text as written, the text with lookalike Cyrillic and Greek letters folded to Latin, a leetspeak-folded version, and decoded base64 and percent-encoded payloads. It adds patterns for claimed approval ("the owner already approved this"), role-play, Hinglish and Hindi (Devanagari). Normal owner questions in English and Hinglish stay unflagged (tested).

A **structuring check** refuses a payment to a payee when payments to that payee that aren't tied to a real open bill would exceed the ₹5,00,000 single-payment limit within 72 hours, or when there would be three or more of them. Payments that each settle a real bill are unaffected.

`POST /redteam` (owner or accountant) runs 21 attacks through the real modules and reports the layer that caught each one: the input guard, the untrusted-text guard, the payment-scam guard, the policy engine, the structuring check, discount integrity, separation of duties, step-up code and binding, the numeric grounding firewall, the tool registry, and the hash-chained audit. Anything an attack queued is rejected again, the run is audited, and it reports whether any money moved (none does; tested).

**Live LLM evidence.** `node sme/scripts/live-llm-check.js` with `SME_LLM_API_KEY`, `SME_LLM_BASE_URL` and `SME_LLM_MODEL` runs seven prompts against a real OpenAI-compatible model: five tasks, one trap asking for a number no tool returns, and one Hinglish attack. It writes `docs/sandbox-evidence/live-llm.jsonl` and `live-llm.md`, including whether the firewall catches an invented amount appended to each live answer. The key is read from the environment only.

## 14. Threat model additions for an acting agent

| Threat | Control | Test |
|---|---|---|
| Model invents a number | Grounding check, deterministic fallback | `sme-04` invented-number test |
| Model calls a dangerous capability | No such tool; allowlist refuses unknown names | `sme-04` refused-tool test |
| Injection steers the model | Guards before the model; notes withheld; tool output is data | `sme-04` zero-model-calls test |
| Agent approves its own action | `agent` role can never approve | `sme-04` self-approval test |
| Runaway autonomy | Mandate caps, expiry, cash-buffer rule, revoke, pause | `sme-04` escalation, no-double-pay, kill-switch tests |
| Stolen session approves a payment | One-time code bound to action and amount | `sme-02`, `sme-04` step-up tests |
| Lender over-collection | Banded features + commitment only | `sme-04` lender-share test |
| Forged or inflated "discount" payment | Amount and date must equal the supplier's terms, re-checked at approval | `sme-05` forged-discount test |
| Agent drains cash chasing discounts | Hurdle rate + joint cash-buffer check across all offers | `sme-05` buffer and joint-offer tests |
| Opaque refusals push owners to bypass the tool | Why-not card on every refusal | `sme-05` why-not tests |

## 15. Try it

```bash
cd backend && npm install && npm run provision:demo && npm start
# http://localhost:3000/sme.html
```

Ananya owner → **Plan my cash gap** → approve the loan (the code arrives on the owner's phone panel). Switch *View as* to Accountant to see approval locked; press **Run tamper drill**. Chai Point owner → sign a mandate for FreshFarm Dairy → **Run autopilot now** (pays the bill, queues two early-pay discounts). Ananya → *Supplier discounts & GST* → **Why not?**. Optional: `SME_LLM_API_KEY=... SME_LLM_MODEL=... npm start` to switch the copilot to LLM tool-calling.
