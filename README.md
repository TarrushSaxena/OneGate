<div align="center">

# OneGate SME

### An AI finance agent for small businesses: it plans, chases and pays, but only inside limits the owner signs

**FinTechathon 2026 · International Track · Topic E: SME Finance Copilot · Team GateKeepers**

[![Tests](https://img.shields.io/badge/tests-48%20suites%20passing-2ea44f)](#-tests)
[![SME tests](https://img.shields.io/badge/SME%20tests-128-2ea44f)](backend/tests)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Data](https://img.shields.io/badge/data-synthetic%20sandbox%20only-6f42c1)](docs/sandbox-evidence/SUMMARY.md)
[![Security](https://img.shields.io/badge/security-self--assessed-0969da)](docs/SECURITY_SELF_ASSESSMENT.md)

[Submission index](docs/submission/SUBMISSION.md) ·
[Technical docs](docs/TECHNICAL_DOCUMENTATION.md) ·
[Security self-assessment](docs/SECURITY_SELF_ASSESSMENT.md) ·
[Execution evidence](docs/sandbox-evidence/SUMMARY.md) ·
[Agentic layer](docs/AGENTIC_COPILOT.md) ·
[Deck and PDFs (Drive)](https://drive.google.com/drive/folders/1sksHP-oYGp0sC7nAqAZzvl535y9GnbHF)

<img src="docs/screenshots/sme-cockpit.jpg" alt="OneGate SME treasury cockpit: the cash runway for the next 45 days (cash today, the low point if nothing changes, the plan waiting for the owner, the low point if they approve), the autopilot morning brief, and the guardrail strip (audit chain, numeric firewall, injection guard, tamper drill)" width="900">

</div>

---

## The problem

A small business owner in India finds out about a cash crunch when a payment bounces. Overdue invoices sit in a spreadsheet, credit options are hard to compare on total cost, and any AI that can "just pay the supplier" is one forged invoice note away from paying a scammer.

## AI as a financial participant, in 30 seconds

Ask *"plan how I get through the cash gap"* (or let the daily autopilot notice it first). The agent:

1. **forecasts** cash and finds the gap: Ananya Textiles dips **₹11,74,344** below its buffer by 24 Nov 2026
2. **ranks** debtors by risk-weighted value and **queues reminders** for the three that close most of the gap
3. **sizes what's left** and **matches financing** that lands before the breach (₹9,00,000 of TReDS discounting, 9.4% APR, ₹16,387 total cost)
4. **queues the loan application**, sharing only banded features with the lender, never the ledger
5. **re-simulates** the forecast with the plan applied: the low point moves from **-₹7,62,344 to ₹4,25,618**

Every step is a guarded tool call you can see on screen and in the audit chain. Steps that move money or contact customers wait for the owner, who approves with the exact amount and a one-time code. For small recurring bills the owner can sign a **spending mandate**, and the autopilot pays them on its own, but never when that would push forecast cash below the buffer. Details: [`docs/AGENTIC_COPILOT.md`](docs/AGENTIC_COPILOT.md).

| Agentic capability | How it works |
|---|---|
| 🧭 **Multi-step planning** | Goal → 8 chained tool calls → one plan with approval cards and a before/after simulation |
| 🤖 **LLM tool-calling (optional)** | Any OpenAI-compatible model picks the next tool from a fixed registry. A **grounding check** rejects any ₹ amount not found in a tool result and falls back to the deterministic planner |
| ⏰ **Autopilot** | Runs daily without being asked: re-forecasts, pays mandated bills, escalates the rest, plans gaps, writes a morning brief. Owner can pause it instantly |
| ✍️ **Spending mandates** | Bounded autonomy: one verified payee, ≤ ₹2,00,000 per payment, ≤ ₹5,00,000 a month, ≤ 90 days, revocable, signed with a one-time code |
| 🔐 **Step-up codes** | Payments, loan applications and mandates need a 6-digit code bound to that action and amount (5 min, 3 tries, single use) |
| 🫥 **Share the score, not the books** | A lender sees 6 banded features and a SHA-256 ledger commitment, never transactions, customer names or balances |
| 💹 **Dynamic discounting** | Finds supplier early-pay discounts, annualises them (1% for 7 days early = **52.67% a year**), and takes one only if it beats the cost of money **and** keeps cash above the buffer |
| 🧾 **GST-aware planning** | Puts every GSTR-3B on the cash calendar, flags input tax credit at risk from suppliers who haven't filed GSTR-1, and checks the money is there on the 20th |
| ❓ **"Why not?" cards** | Every refusal says which rule fired, the limit, the actual number and what the owner can do, in the dashboard, the chat, the brief and the API |

<img src="docs/screenshots/sme-autopilot-mandate.jpg" alt="Chai Point Cafe: financing match, what a lender sees (banded features only), a signed spending mandate with one autonomous payment, and the hash-chained audit trail" width="900">

## Innovation: what a chatbot can't do

Most finance copilots answer questions. OneGate SME **acts**, and every act is bounded by code rather than by the model's judgement.

1. **AI as a financial participant, safely.** The agent proposes, schedules and (inside an owner-signed mandate) pays. Authority lives in a policy engine checked twice, never in a prompt. The agent has its own identity and can't approve anything, including its own proposals.
2. **A grounding firewall for LLM answers.** An optional LLM picks tools from a fixed registry. Any ₹ amount in its answer that no tool returned is rejected and the deterministic planner answers instead. Hallucinated money never reaches the owner.
3. **Dynamic discounting: spare cash earns 30 to 50% a year.** Suppliers often offer 1 to 2% for paying early. The agent annualises each offer (`d/(1-d) × 365/days early`) and compares it with a hurdle: what idle cash earns (6.5%), or, when a cash gap is coming, the cheapest eligible loan (it won't borrow at 9.4% to chase a discount). Then it re-runs the pessimistic forecast with the payment moved earlier, counting every other offer it takes. On Chai Point it queues both offers (**₹1,235 saved**, owner approves each). On Ananya it **holds both back**, because paying ₹4,15,800 early would breach the buffer on 14 Oct. Forged discounts (wrong amount or date) are denied.
4. **GST-aware cash planning for India.** GST is the one outflow an SME can't move. The agent puts each GSTR-3B (the 20th, monthly filers) on the cash calendar and splits it into output tax and input tax credit. It flags credit at risk: since s.16(2)(aa) CGST Act, credit only counts if the supplier's invoice is in your GSTR-2B. Ananya's ₹25,248 of credit from Om Logistics is at risk, which would raise the 20 Oct payment. It also checks coverage (covered, tight or short) and the cost of paying late: 18% a year (s.50) plus ₹50 a day (s.47), capped by turnover. A café at 5% without ITC is modelled correctly.
5. **"Why not?" cards: explainable refusals.** Every denial, escalation and block carries the rule, the limit, the real number and a fix. For example: *"Paying ₹4,15,800 early pulls cash below the ₹4,12,000 safety buffer on 2026-10-14. What you can do: pay on the normal due date instead."* Ask the copilot *"why not?"* and it explains the last refusal straight from the audit chain.
6. **Share the score, not the books.** Lenders get banded features, a ledger commitment and an Account-Aggregator-style consent artefact, never the ledger itself.
7. **A treasury cockpit, not a chat window (v1.4).** The dashboard opens on what the agent already did. A runway strip shows cash today, the low point if nothing changes, the plan waiting for the owner and the low point if they approve it (Ananya: -₹7,62,344 to ₹4,25,618). Below it, the work sits in three lanes: **paid under a mandate**, **waiting for you**, and **blocked by policy**, where every card has a why-not. A role switcher shows separation of duties live: the accountant sees *Approve · owner only*, and the viewer sees no actions. One-time codes go to a simulated **owner's phone**, never onto the approval card. The chat moves to a side drawer. A guardrail strip shows the audit chain, the firewalls and a **tamper drill**: it edits one amount in a copy of the chain and shows verification failing at that exact entry, while the live chain stays valid.
8. **Forecast bands from past errors, and a what-if stress test (v1.5).** The forecaster is re-run from 26 past start dates. The gaps between what it predicted and where the balance actually landed set an 80% band, and that band covers 80% of past outcomes for each of the three SMEs. Ananya's band is far wider than Chai Point's, as it should be. **It also caught a real bias, which v1.8 fixes:** the base case ran high, mainly because cash from newly issued invoices was counted before it could arrive. Collections from new invoices now start only once they reach the business's usual issue-to-payment time; overdue invoices fade faster and are spread over 2 to 6 weeks; and sales follow the last 28 days' level. The typical 31-to-45-day miss fell from ₹11,55,897 to ₹2,72,294 for Ananya, ₹1,40,910 to ₹42,121 for Chai Point and ₹3,10,415 to ₹52,591 for PixelForge. Every safety check now uses the lower of the scenario low and the calibrated band. Four sliders (top customers pay later, sales change, supplier costs, a one-off expense) re-run the same model. They show the new low point, how much cash would be needed and the cheapest eligible loan, with nothing queued.
9. **India rules pack (v1.6).** *s.43B(h):* PixelForge is a Udyam micro service firm, so its reminders tell the buyer that paying later than 45 days moves its tax deduction to the year it actually pays. Ananya is a trader, which the rule excludes, so it gets no such line. *TDS:* PixelForge's receivables show cash in after 10% TDS under s.194J (on the value before GST) and ask for Form 16A. *Statutory calendar:* TDS on the 7th, GSTR-1 on the 11th, PF and ESIC on the 15th, GSTR-3B on the 20th with its amount, and advance tax, each with the cost of paying late. *Key Facts Statement:* every loan shows an all-in APR including fees (the NBFC line's 19% becomes 22.92%), penal charges that are never compounded, and a cooling-off period. Approval needs the owner to tick that they've read that exact KFS, checked by hash before the one-time code is used. Disbursal routed through a third party is denied, and the owner can exit inside the cooling-off window with no penalty. *Disputes:* a disputed invoice is never chased or forecast, and a disputed bill can't be paid, not even under a mandate.
10. **Red-team runner and an obfuscation-aware guard (v1.7).** One button fires 21 real attacks at the real guards: injection in English, Hinglish, Hindi, base64, lookalike Cyrillic letters, leetspeak and zero-width characters; "the owner already approved this"; a bank-change scam; unknown payees; a ₹6,00,000 payment; ₹6,00,000 split into three ₹2,00,000 payments (caught by a new structuring check); a forged discount; the accountant and the autopilot trying to approve; one-time-code replay and re-binding; an invented ₹3,21,450 saving; an unknown `wire_transfer` tool; and an audit edit. All 21 are blocked, by 12 different layers, no money moves, and anything queued is rejected again.

## What OneGate SME does

| | Task | What the owner gets |
|---|---|---|
| 📈 | **Forecast cash** | Daily low / base / high path for 30, 60 and 90 days, the lowest point, and an alert when cash will dip below the safety buffer |
| 🧾 | **Rank receivables** | Ageing buckets, a 0–100 risk score per invoice, and the order to chase them in |
| ✉️ | **Chase a payment** | A ready reminder draft. It goes to the (sandbox) customer only after the owner approves |
| 🏦 | **Match financing** | Five products (PMMY Tarun and Kishor, cash credit, TReDS, NBFC line) ranked by **total cost**, each with the reason it fits or doesn't |
| 💸 | **Pay a supplier / apply for a loan** | Becomes an approval card. Nothing executes until the owner re-types the exact amount and enters a one-time code |
| 💹 | **Pay suppliers early when it pays** | Early-pay offers scored against the cost of money and the cash buffer; worthwhile ones become approval cards for the discounted amount |
| 🧾 | **Plan for GST** | Next GSTR-3B with output tax, input credit, credit at risk, whether cash covers it, and the cost of paying late |
| 🛡️ | **Refuse attacks** | Prompt injections hidden in invoice notes and phishing "bank details changed" emails are flagged, blocked and logged |

## Why it's safe: authority comes from policy, not from language

The copilot can say anything; it can only **do** what the policy engine allows. Every request passes three server-side checks before any tool runs: tenant membership, `:tid` matches the caller's tenant, then `policy.evaluate(action, role, params)`.

| Tier | Actions | Who |
|---|---|---|
| **READ** | Overview, forecast, receivables, financing, GST calendar, early-pay offers | owner, accountant, viewer |
| **SUGGEST** | Draft a reminder, recommend financing | owner, accountant |
| **EXECUTE** | Send reminder, schedule payment, submit loan application, sign or revoke a mandate | owner, accountant or the autopilot agent *propose*; **only the owner approves** |
| **DENY** | Add a beneficiary, change bank details, disable audit | nobody, ever, through OneGate |

**Hard limits on EXECUTE:** ₹5,00,000 per payment · ₹8,00,000 per tenant per day · verified beneficiaries only · exact-amount re-confirmation · one-time code bound to the action · policy re-checked at approval · 24 h expiry · idempotency keys · warning when a payment would push forecast cash below the buffer. The autopilot agent has its own identity and **can never approve**, even its own proposals.

**Every** proposal, decision, denial, blocked attack and execution lands in a per-tenant **SHA-256 hash chain**. `GET /api/sme/:tid/audit/verify` finds the first altered entry.

In red-team testing, even messages the detector was built to miss moved **no money**, because language never carries authority.

## Results on three synthetic SMEs

Walk-forward backtest of the 30-day forecast, plus the scripted sandbox run ([full evidence](docs/sandbox-evidence/SUMMARY.md)):

| SME | Profile | Forecast MAPE (30 d) | Attacks blocked | Policy denials | Owner-approved payment (amount + code) | Agent plan | Autopilot + mandate | Audit chain |
|---|---|---|---|---|---|---|---|---|
| Chai Point Cafe | Retail café, steady sales | **3.63%** | 2/2 | 3/3 | executed after approval | no gap, nothing proposed | paid ₹22,400 inside mandate | valid |
| PixelForge Design Studio LLP | B2B services, lumpy invoices | **8.68%** | 2/2 | 3/3 | executed after approval | no gap in 45 days | paid ₹18,500 inside mandate | valid |
| Ananya Textiles Pvt Ltd | Wholesale, slow payers | **14.82%** | 2/2 | 3/3 | executed after approval | 8 tool steps, 4 approval cards | **refused to auto-pay** (would breach buffer), escalated | valid |

The same run takes **₹384 and ₹540** of early-pay discounts on Chai Point and PixelForge (owner-approved, one-time code). It **holds back** Ananya's discounts with a why-not card, denies a forged discount on every tenant, and flags GST credit at risk (₹25,248 for Ananya, ₹4,134 for PixelForge). The Chai Point figure is ₹384 because that run had already paid the FreshFarm bill in full, so only one offer was left.

Ananya's error is the honest one: slow, irregular payers are hard to forecast, which is exactly why the copilot shows a low–high band and a buffer alert instead of a single number.

## Run it in two minutes

Requires Node.js 18+ (20 recommended). No API keys or secrets are needed for the SME demo.

```bash
git clone https://github.com/TarrushSaxena/OneGate.git
cd OneGate/backend
npm install
npm run provision:demo        # creates demo users, prints a one-time password
npm start                     # open http://localhost:3000/sme.html
```

On the sign-in screen pick a demo user (development mode only, see [`DEMO_ACCESS.md`](DEMO_ACCESS.md)):

| User | Role | Try this |
|---|---|---|
| `owner.ananya@company.com` | owner | Press **Plan my cash gap**, then approve a payment with the amount and the one-time code |
| `accounts.ananya@company.com` | accountant | Propose a payment, then see that you can't approve it |
| `viewer.ananya@company.com` · `viewer.pixelforge@company.com` | viewer | Read-only: every action button is gone |
| `owner.chai@company.com` | owner | Sign a mandate for FreshFarm Dairy, press **Run autopilot now** and watch it pay the bill on its own and queue two early-pay discounts. Other tenants' data is refused |

Then press **Try an attack** in the copilot chat.

### Demo script (about 3 minutes)

1. **(0:00)** Sign in as the Ananya owner. The cockpit opens on the runway: the low point if nothing changes is -₹7,62,344, and the autopilot brief already says *"Cash gap of ₹11,74,344 ahead. I've built a plan."*
2. **(0:20)** Press **Plan my cash gap** (expand *How the agent planned it* to see the 8 tool calls). The runway's last box shows ₹4,25,618 if you approve, and four cards wait in **Waiting for you**.
3. **(0:50)** Switch **View as → Accountant**: the same cards show *Approve · owner only*. Switch back to Owner and approve the loan application. The code arrives on the **owner's phone**, not on the card.
4. **(1:20)** Press **Run red-team** in the bottom bar: 21 attacks, 21 blocked, with the layer that caught each one and no money moved. Then **Run tamper drill**: the edited copy fails at that exact entry, and the live chain stays valid.
5. **(1:40)** In *What if?*, drag *Top 3 customers pay later* to 30 days. The red line drops, and the panel says how much cash you'd need and which loan is cheapest. Nothing is queued.
6. **(2:00)** Switch to Chai Point. Sign a mandate for FreshFarm Dairy (code again), press **Run autopilot now**: it pays the ₹22,400 bill on its own, queues two early-pay discounts (52.67% and 30.88% a year, ₹1,235 saved) and shows the GST due on the 20th is covered.
7. **(2:20)** Back on Ananya, the same autopilot **holds back** both discounts. Press **Why not?** in *Supplier discounts & GST*: paying early would breach the buffer. Note the ₹25,248 of GST credit at risk.
8. **(2:45)** Switch to PixelForge: receivables show cash in after TDS, and the reminder carries the s.43B(h) line. Revoke the mandate, pause the autopilot, show the audit chain is valid.

## 🧪 Tests

```bash
cd backend
node tests/run-all-tests.js   # 48 suites, including 128 SME tests
```

SME suites: `sme-01-core` (forecast, receivables, financing, policy, guards, audit chain), `sme-02-api` (tenancy, tiers, approvals with step-up codes, limits over HTTP), `sme-03-secret-hygiene` (no keys or passwords in the tree), `sme-04-agent` (multi-step planner, LLM tool-calling guardrails with a scripted model: grounding fallback, refused tools, injection blocked before the model, API failure; step-up codes; mandates; autopilot escalation, no double payment, kill switch; lender data minimisation), `sme-05-innovation` (discount maths, idle-cash vs loan hurdle, buffer refusal, offers checked together, early payment end-to-end with amount and code, forged-discount denial, role and tenant limits; GST calendar, credit at risk, no-ITC restaurant, covered/tight/short, late-cost caps; why-not cards on every API refusal, in the brief, the chat and the LLM path, with the grounding check catching an invented saving), `sme-06-cockpit` (the runway matches the planner's own simulation, the cockpit is read-only, the blocked lane links denials to audit entries with why-not cards, viewers see no audit data, the mandate lane lists only mandate payments, tenant scoping, the tamper drill catches the edited entry while the live chain stays valid, role-switcher accounts, codes never printed on cards), `sme-07-forecast-whatif` (conformal quantile, about 80% coverage for every SME, wider band for the harder business, scenario numbers unchanged, what-if monotonic, gap sizing and financing, clamped inputs, read-only), `sme-08-india-rules` (43B(h) coverage by enterprise type and agreement, FY end, reminder wording, TDS on the pre-GST value, statutory dates, all-in APR, KFS hash gate before the code, cooling-off exit, pass-through denial, disputes in chase, forecast, planner, payments and mandates), `sme-09-redteam` (10 obfuscated injections caught, no false positives on normal English and Hinglish questions, split-payment and repeated-payment checks, all 21 red-team attacks blocked with no money moved and a clean queue, viewers can't run it).

## API

| Method | Endpoint | Tier |
|---|---|---|
| `GET` | `/api/sme/:tid/overview` | READ |
| `GET` | `/api/sme/:tid/forecast` | READ |
| `GET` | `/api/sme/:tid/receivables` | READ |
| `GET` | `/api/sme/:tid/receivables/:invoiceId/draft` | SUGGEST |
| `POST` | `/api/sme/:tid/financing/match` | SUGGEST |
| `POST` | `/api/sme/:tid/copilot` | LLM agent if configured, else routed per intent |
| `POST` | `/api/sme/:tid/agent/plan` | SUGGEST (proposals queue as EXECUTE) |
| `GET` | `/api/sme/:tid/agent/tools` | READ: the tool registry the agent can use |
| `GET` · `POST` | `/api/sme/:tid/autopilot` · `/autopilot/run` · `/autopilot/pause` | READ · SUGGEST · owner |
| `GET` · `POST` | `/api/sme/:tid/mandates` · `/mandates/challenge` · `/mandates` · `/mandates/:id/revoke` | owner + one-time code |
| `POST` | `/api/sme/:tid/actions/:id/stepup` | owner: one-time code for this action |
| `GET` | `/api/sme/:tid/privacy/lender-share` | SUGGEST |
| `GET` | `/api/sme/:tid/gst` | READ: GSTR-3B calendar, credit at risk, coverage, late cost |
| `GET` · `POST` | `/api/sme/:tid/discounts` · `/discounts/:billId/propose` | READ · queues an EXECUTE approval card (or 409 with why-not) |
| `POST` | `/api/sme/:tid/whatif` | READ: stress test (debtor delay, sales, supplier costs, one-off expense); nothing queued |
| `GET` | `/api/sme/:tid/compliance` | READ: statutory calendar for the next 45 days |
| `POST` | `/api/sme/:tid/disputes` | owner or accountant: mark an invoice or bill disputed or settled |
| `POST` | `/api/sme/:tid/actions/:id/cooling-off-exit` | owner: exit a loan inside its cooling-off period |
| `POST` | `/api/sme/:tid/redteam` | owner or accountant: run 21 attacks against the live guards |
| `GET` | `/api/sme/:tid/cockpit` | READ: runway before and after the waiting plan, three action lanes, guardrail status (no side effects) |
| `POST` | `/api/sme/:tid/audit/tamper-drill` | owner or accountant: edits a copy of the chain and shows where verification fails; the live chain is untouched |
| `GET` | `/api/sme/:tid/explain?codes=…` | plain-language why-not cards for reason codes |
| `POST` | `/api/sme/:tid/actions` | EXECUTE (propose) |
| `POST` | `/api/sme/:tid/actions/:id/approve` · `/reject` | owner only |
| `GET` | `/api/sme/:tid/audit` · `/audit/verify` | READ |

## Architecture

<img src="docs/screenshots/sme-redteam.jpg" alt="Red-team runner: 21 of 21 attacks blocked, including Hinglish, Hindi, base64 and lookalike-letter prompt injections, with the layer that caught each one" width="700">

<img src="docs/architecture.svg" alt="Layered architecture: identity and tenant scope, input guard, LLM or deterministic planner, tool registry with READ/SUGGEST/EXECUTE tiers, policy engine checked twice, owner approval with amount and one-time code or bounded mandate, sandbox executor, privacy-preserving lender share, hash-chained audit, grounding check" width="900">

**Fallbacks:** LLM timeout, unparseable output, an unknown tool or an ungrounded amount → deterministic planner (logged as `agent.llm_fallback`). No LLM key → deterministic planner by default. Mandate check fails → normal approval card. Autopilot paused → run skipped and logged.

| File (`backend/sme/`) | Role |
|---|---|
| `data/sandbox.js` | Deterministic synthetic data: 3 SMEs, 180 days of transactions, invoices, payables, verified beneficiaries, 5 loan products |
| `forecast.js` | Cash forecaster and walk-forward backtest |
| `receivables.js` | Ageing, risk ranking, reminder drafts |
| `financing.js` | Explainable eligibility and total-cost matching |
| `guard.js` | Prompt-injection and phishing detection, PII redaction |
| `policy.js` | Permission tiers, role matrix, hard limits |
| `tenancy.js` | Tenant membership and SME roles |
| `actions.js` | Propose / approve / reject, idempotency, sandbox execution |
| `auditChain.js` | Tamper-evident audit trail |
| `copilot.js` | Entry point: guards first, then the LLM agent or the deterministic intent router |
| `agent.js` | Tool registry, multi-step cash-gap planner, what-if simulation, LLM tool-calling loop with grounding check |
| `autopilot.js` | Scheduled monitoring runs, morning brief, kill switch |
| `mandates.js` | Owner-signed spending mandates (bounded autonomy) |
| `stepup.js` | One-time codes bound to an action and amount |
| `privacy.js` | Lender share: banded features + ledger commitment |
| `discounting.js` | Dynamic discounting: annualised return vs hurdle, joint cash-buffer check, early-pay proposals |
| `gst.js` | GSTR-3B calendar, output tax vs input credit, credit at risk, coverage, late-payment cost |
| `explain.js` | "Why not?" cards: reason code → rule, limit, actual value, fix |

## Compliance alignment (indicative, not certified)

- **RBI Digital Lending Directions:** a Key Facts Statement in the RBI format (all-in APR including fees, penal charges never compounded, cooling-off period, regulated entity, grievance officer) must be confirmed by hash before a loan is submitted; money goes straight from the lender to the borrower; penalty-free exit inside the cooling-off period.
- **Income-tax Act:** s.43B(h) payment-timing line on MSE invoices (not for traders), TDS netted on receipts (s.194J), TDS and advance-tax dates in the calendar.
- **DPDP Act 2023:** PII minimised in logs and in model prompts, tenant data isolated, lenders get derived features only (purpose limitation, data minimisation).
- **RBI Account Aggregator framework:** each loan application carries a purpose-bound, time-boxed, revocable consent artefact.
- **NPCI e-mandate / UPI AutoPay pattern:** autonomous payments only under an owner-registered mandate with a cap, a validity period and revocation.
- **CERT-In:** timestamped, tamper-evident decision log.
- **GST (CGST Act):** GSTR-3B due dates, ITC only via GSTR-2B (s.16(2)(aa)), 18% interest (s.50) and ₹50/day late fee capped by turnover (s.47). Sector rates are indicative sandbox settings, not tax advice.

## Known limits and what's next

In-memory state, a static membership table, and rule-based injection detection (now aware of Hinglish, Hindi, base64, lookalike letters and leetspeak, but still rules). One-time codes are delivered in the sandbox to a simulated phone panel, where a real deployment sends them by SMS or uses a passkey. Planning assumes reminder recovery of 60% of probability-weighted value within 7 days, stated in every plan. The forecast still runs slightly optimistic for Ananya at 31 to 45 days (a typical miss of ₹2,72,294), which the calibrated floor absorbs in every safety check. The live LLM path has only been run against a scripted model so far: `node sme/scripts/live-llm-check.js` with `SME_LLM_API_KEY` set records real traces into `docs/sandbox-evidence/live-llm.md`. Udyam status, TDS sections and KFS terms are sandbox settings. Early-pay terms and GSTR-1 filing status supplied by the sandbox (a real deployment reads them from e-invoices and the GSTN/GSP APIs), and indicative GST rates. Federated learning is described, not built. Next: persistent append-only storage, passkeys, learned per-customer payment curves, real Account Aggregator connectors, TReDS and lender APIs, a federated credit model across lenders (FATE), and Docker Compose deployment. Details in the [security self-assessment](docs/SECURITY_SELF_ASSESSMENT.md).

## Repository layout

```
OneGate/
├── backend/
│   ├── sme/             # SME Finance Copilot (this submission)
│   ├── tests/           # 48 suites, sme-01..09 are the SME ones
│   ├── auth/ routes/ services/ ml/   # OneGate platform core (auth, audit, sessions)
│   └── server.js
├── frontend/
│   ├── sme.html sme.js sme.css   # SME dashboard and copilot
│   └── ...                       # platform UI
├── docs/
│   ├── submission/      # FinTechathon checklist index and deck outline
│   ├── TECHNICAL_DOCUMENTATION.md
│   ├── SECURITY_SELF_ASSESSMENT.md
│   ├── SME_COPILOT.md
│   ├── AGENTIC_COPILOT.md   # planner, LLM guardrails, autopilot, mandates, privacy
│   ├── architecture.svg
│   ├── sandbox-evidence/   # run log, per-SME audit chains, screenshot
│   └── helpdesk/        # docs for the underlying OneGate helpdesk platform
├── DEMO_ACCESS.md  SECURITY.md  .env.example
└── package.json
```

## Built on the OneGate platform

OneGate SME reuses the security core of **OneGate**, our enterprise AI helpdesk (DistilBERT routing across 11 departments, PII redaction, RBAC, SLA escalation). Its documentation lives in [`docs/helpdesk/`](docs/helpdesk/README.md).

## Team GateKeepers, Bennett University, India

| Member | Role |
|---|---|
| **Tarrush Saxena** (Lead) | Product, copilot design, pitch |
| **Yogya Mittal** | Forecasting and financing logic |
| **Utkarsh Gupta** | Backend, policy engine, security |

All data in this repository is synthetic. No real money or messages leave the sandbox. Report security issues as described in [`SECURITY.md`](SECURITY.md).
