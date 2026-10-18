# FinTechathon 2026 — International Track, Topic E (SME Finance Copilot)

**Team GateKeepers** — Tarrush Saxena (product, copilot design, pitch) · Yogya Mittal (forecasting and financing logic) · Utkarsh Gupta (backend, policy engine, security). Bennett University, India.

**Final version: v1.9, 18 Oct 2026** (git tag [`fintechathon-final`](https://github.com/TarrushSaxena/OneGate/releases/tag/fintechathon-final); `main` and `sme-copilot` point to the same commit).

**Submission folder (PDF/PPTX, view-only):** https://drive.google.com/drive/folders/1sksHP-oYGp0sC7nAqAZzvl535y9GnbHF

| # | Checklist item | Where |
|---|---|---|
| 1 | Technical documentation (architecture, core algorithms, security design) | [`docs/TECHNICAL_DOCUMENTATION.md`](../TECHNICAL_DOCUMENTATION.md) · PDF and DOCX in the Drive folder |
| 2 | Presentation deck (≤ 10 min) | [`PITCH_DECK.md`](PITCH_DECK.md) · PPTX and PDF in the Drive folder |
| 3 | Demo video (required, ≤ 5 min) | [OneGate SME demo, 4:34](https://drive.google.com/file/d/1k9TLX-zRLWj-EsbKLIG_YcX9Gne9lPMM/view?usp=drivesdk) (Google Drive, anyone with the link). **Recorded at v1.8**: its plan figures (₹9,00,000 of TReDS, low point ₹4,25,618) and "128 SME tests" predate the v1.9 fixes; the current figures are in row 13 |
| 4 | Source code with README, deployment instructions, test cases | This repository · [`README.md`](../../README.md) · `node backend/tests/run-all-tests.js` (49 suites, 216 tests, 147 SME tests) · [`LICENSE`](../../LICENSE) (MIT) · [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md) |
| 5 | Security self-assessment (permission tiers, known risks) | [`docs/SECURITY_SELF_ASSESSMENT.md`](../SECURITY_SELF_ASSESSMENT.md) · PDF and DOCX in the Drive folder |
| 6 | Execution evidence (sandbox operation logs) | [`docs/sandbox-evidence/`](../sandbox-evidence/) — `sandbox-run.jsonl`, per-SME audit chains, [`SUMMARY.md`](../sandbox-evidence/SUMMARY.md), dashboard screenshot, plus the demo video (row 3) |
| 7 | **Supplementary (14 Oct): agentic layer v1.2** — multi-step planner, LLM tool-calling with grounding check (tested with a scripted mock model only), daily autopilot, spending mandates, step-up codes, privacy-preserving lender share | [`docs/AGENTIC_COPILOT.md`](../AGENTIC_COPILOT.md) · [`architecture.svg`](../architecture.svg) |
| 8 | **Supplementary (14 Oct): innovation v1.3** — dynamic-discounting agent, GST-aware cash planning (GSTR-3B calendar, ITC at risk), "why not?" cards on every refusal | [`README.md#innovation-what-a-chatbot-cant-do`](../../README.md#innovation-what-a-chatbot-cant-do) · [`AGENTIC_COPILOT.md` §7–9](../AGENTIC_COPILOT.md) |
| 9 | **Supplementary (14 Oct): treasury cockpit v1.4**: the dashboard opens on the cash runway and three action lanes (paid under a mandate, waiting for you, blocked by policy), with a role switcher, an owner's-phone panel for one-time codes, the chat in a drawer, and an audit tamper drill | [`AGENTIC_COPILOT.md` §10](../AGENTIC_COPILOT.md) · [`screenshots/sme-cockpit.jpg`](../screenshots/sme-cockpit.jpg) |
| 10 | **Supplementary (14 Oct): v1.5 to v1.7**: forecast bands calibrated to 80% on 26 past runs (in-sample; on held-out newer start dates they covered 48–83%), with the optimism they revealed stated openly; a what-if stress test; an India rules pack (s.43B(h), TDS on receipts, a statutory calendar, an RBI Key Facts Statement with all-in APR, a hash-gated approval, direct disbursal and cooling-off exit, dispute holds); and a red-team runner (21 attacks, including Hinglish, Hindi, base64 and lookalike-letter injections, all blocked) plus a structuring check | [`AGENTIC_COPILOT.md` §11 to 13](../AGENTIC_COPILOT.md) · [`screenshots/sme-redteam.jpg`](../screenshots/sme-redteam.jpg) |
| 11 | **v1.8 (14 Oct): forecast fix.** Collections from new invoices are now lagged to the real issue-to-payment time, overdue invoices fade faster, and sales follow the recent level. Ananya's 30-day MAPE (single 30-day holdout, which v1.8 was tuned with) went from 26% to 14.82%. Every safety check uses the lower of the scenario low and the calibrated band. Gap ₹11,74,344 | [`AGENTIC_COPILOT.md` §11](../AGENTIC_COPILOT.md) · [`sandbox-evidence/SUMMARY.md`](../sandbox-evidence/SUMMARY.md) |
| 12 | **v1.8.1 (16 Oct): demo fixes.** The approval card keeps the typed amount and code; an approved reminder stays in the runway plan as done; the financing amount resets on business switch; "pay the full balance of invoice X" is no longer flagged (red-team still 21/21) | [`TECHNICAL_DOCUMENTATION.md` §7.2](../TECHNICAL_DOCUMENTATION.md) · [`SECURITY_SELF_ASSESSMENT.md` §6](../SECURITY_SELF_ASSESSMENT.md) |
| 13 | **v1.9 (18 Oct, final): audit fixes.** The plan simulation now nets financing repayments inside the 45-day horizon, and TReDS-style discounting is modelled as invoices sold and repaid by the buyer on the due date. New Ananya headline: low point **-₹7,62,344 → ₹4,21,816** (above the ₹4,12,000 buffer) with 3 reminders (₹2,87,962), TReDS-style discounting (sandbox) of ₹9,68,864 face value (cost ₹6,158; 9.4% rate, 15.59% all-in APR) and a ₹5,50,000 NBFC line (19% rate, 22.92% all-in APR, first instalment of ₹50,686 counted). The earlier ₹4,25,618 ignored repayment. Also: bill-backed payments capped at the bill and tied to its supplier; held-out band coverage reported; random dev JWT secret; LICENSE and third-party notices | [`TECHNICAL_DOCUMENTATION.md` §7.1](../TECHNICAL_DOCUMENTATION.md) · [`sandbox-evidence/SUMMARY.md`](../sandbox-evidence/SUMMARY.md) |

## Prior work

The SME copilot (`backend/sme/`, `frontend/sme.*`, `docs/` for the SME) was built for FinTechathon 2026 on top of the team's own **OneGate helpdesk** base (authentication, sessions, audit service, PII redaction), which the team earlier used at the PS18 hackathon (7–8 Oct 2026). Helpdesk documentation is in [`docs/helpdesk/`](../helpdesk/README.md).

## Run it

Requires Node.js 20.11+ (tested on 22).

```bash
cd backend && npm install
npm run provision:demo                    # prints a one-time demo password
npm start                                 # then open http://localhost:3000/sme.html
node tests/run-all-tests.js               # full suite: 49 suites, 216 tests (147 SME)
```
