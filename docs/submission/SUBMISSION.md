# FinTechathon 2026 — International Track, Topic E (SME Finance Copilot)

**Team GateKeepers** — Tarrush Saxena (product, copilot design, pitch) · Yogya Mittal (forecasting and financing logic) · Utkarsh Gupta (backend, policy engine, security). Bennett University, India.

**Submission folder (PDF/PPTX, view-only):** https://drive.google.com/drive/folders/1sksHP-oYGp0sC7nAqAZzvl535y9GnbHF

| # | Checklist item | Where |
|---|---|---|
| 1 | Technical documentation (architecture, core algorithms, security design) | [`docs/TECHNICAL_DOCUMENTATION.md`](../TECHNICAL_DOCUMENTATION.md) · PDF in the Drive folder |
| 2 | Presentation deck (≤ 10 min) | [`PITCH_DECK.md`](PITCH_DECK.md) · PPTX and PDF in the Drive folder |
| 3 | Demo video (optional, ≤ 5 min) | Not submitted. The live demo path is in the README and the deck. |
| 4 | Source code with README, deployment instructions, test cases | This repository · [`README.md`](../../README.md) · `node backend/tests/run-all-tests.js` (48 suites, 128 SME tests) |
| 5 | Security self-assessment (permission tiers, known risks) | [`docs/SECURITY_SELF_ASSESSMENT.md`](../SECURITY_SELF_ASSESSMENT.md) · PDF in the Drive folder |
| 7 | **Supplementary (14 Oct): agentic layer v1.2** — multi-step planner, LLM tool-calling with grounding check, daily autopilot, spending mandates, step-up codes, privacy-preserving lender share | [`docs/AGENTIC_COPILOT.md`](../AGENTIC_COPILOT.md) · [`architecture.svg`](../architecture.svg) |
| 8 | **Supplementary (14 Oct): innovation v1.3** — dynamic-discounting agent, GST-aware cash planning (GSTR-3B calendar, ITC at risk), "why not?" cards on every refusal | [`README.md#innovation-what-a-chatbot-cant-do`](../../README.md#innovation-what-a-chatbot-cant-do) · [`AGENTIC_COPILOT.md` §7–9](../AGENTIC_COPILOT.md) |
| 9 | **Supplementary (14 Oct): treasury cockpit v1.4**: the dashboard opens on the cash runway and three action lanes (paid under a mandate, waiting for you, blocked by policy), with a role switcher, an owner's-phone panel for one-time codes, the chat in a drawer, and an audit tamper drill | [`AGENTIC_COPILOT.md` §10](../AGENTIC_COPILOT.md) · [`screenshots/sme-cockpit.jpg`](../screenshots/sme-cockpit.jpg) |
| 10 | **Supplementary (14 Oct): v1.5 to v1.7**: forecast bands calibrated on past errors (about 80% coverage), with the optimism they reveal stated openly; a what-if stress test; an India rules pack (s.43B(h), TDS on receipts, a statutory calendar, an RBI Key Facts Statement with all-in APR, a hash-gated approval, direct disbursal and cooling-off exit, dispute holds); and a red-team runner (21 attacks, including Hinglish, Hindi, base64 and lookalike-letter injections, all blocked) plus a structuring check | [`AGENTIC_COPILOT.md` §11 to 13](../AGENTIC_COPILOT.md) · [`screenshots/sme-redteam.jpg`](../screenshots/sme-redteam.jpg) |
| 11 | **v1.8 (14 Oct): forecast fix.** Collections from new invoices are now lagged to the real issue-to-payment time, overdue invoices fade faster, and sales follow the recent level. Ananya's 30-day MAPE went from 26% to 14.82%. Every safety check uses the lower of the scenario low and the calibrated band. New headline: gap ₹11,74,344; the low point moves from -₹7,62,344 to ₹4,25,618 with ₹9,00,000 of TReDS discounting | [`AGENTIC_COPILOT.md` §11](../AGENTIC_COPILOT.md) · [`sandbox-evidence/SUMMARY.md`](../sandbox-evidence/SUMMARY.md) |
| 6 | Execution evidence (sandbox operation logs) | [`docs/sandbox-evidence/`](../sandbox-evidence/) — `sandbox-run.jsonl`, per-SME audit chains, dashboard screenshot |

## Run it

```bash
cd backend && npm install
npm run provision:demo                    # prints a one-time demo password
npm start                                 # then open http://localhost:3000/sme.html
node tests/run-all-tests.js               # full suite
```
