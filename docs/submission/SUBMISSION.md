# FinTechathon 2026 — International Track, Topic E (SME Finance Copilot)

**Team GateKeepers** — Tarrush Saxena (product, copilot design, pitch) · Yogya Mittal (forecasting and financing logic) · Utkarsh Gupta (backend, policy engine, security). Bennett University, India.

**Submission folder (PDF/PPTX, view-only):** https://drive.google.com/drive/folders/1sksHP-oYGp0sC7nAqAZzvl535y9GnbHF

| # | Checklist item | Where |
|---|---|---|
| 1 | Technical documentation (architecture, core algorithms, security design) | [`docs/TECHNICAL_DOCUMENTATION.md`](../TECHNICAL_DOCUMENTATION.md) · PDF in the Drive folder |
| 2 | Presentation deck (≤ 10 min) | [`PITCH_DECK.md`](PITCH_DECK.md) · PPTX and PDF in the Drive folder |
| 3 | Demo video (optional, ≤ 5 min) | Script: [`DEMO_VIDEO_SCRIPT.md`](DEMO_VIDEO_SCRIPT.md) |
| 4 | Source code with README, deployment instructions, test cases | This repository · [`README.md`](../../README.md) · `node backend/tests/run-all-tests.js` (42 suites, 28 SME) |
| 5 | Security self-assessment (permission tiers, known risks) | [`docs/SECURITY_SELF_ASSESSMENT.md`](../SECURITY_SELF_ASSESSMENT.md) · PDF in the Drive folder |
| 6 | Execution evidence (sandbox operation logs) | [`docs/sandbox-evidence/`](../sandbox-evidence/) — `sandbox-run.jsonl`, per-SME audit chains, dashboard screenshot |

## Run it

```bash
cd backend && npm install
npm run provision:demo                    # prints a one-time demo password
npm start                                 # then open http://localhost:3000/sme.html
node tests/run-all-tests.js               # full suite
```
