# OneGate SME: sandbox execution evidence

Run ID: `2026-10-14T03-27-05-720Z`. Sandbox date: 2026-10-12. Synthetic data only, and no real money or messages leave the sandbox.

| SME | Cash today | 30d base (low to high) | 90d base | Backtest MAPE (30d) | Overdue | Attacks blocked | Phishing warned | Policy denials | Owner-approved payment (amount + OTP) | Agent plan (tool steps / approval cards) | Autopilot with mandate | Audit chain |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Ananya Textiles Pvt Ltd | ₹9,59,546 | ₹3,59,826 (-₹1,91,395 to ₹7,58,398) | ₹4,97,625 | 26% | ₹27,65,230 | 2/2 | yes | 3/3 | executed after approval | 8 / 4 | escalated to owner (would breach buffer) | valid (60 entries) |
| Chai Point Cafe | ₹5,27,403 | ₹4,34,535 (₹3,33,014 to ₹5,17,404) | ₹5,42,256 | 3.93% | ₹1,69,445 | 2/2 | yes | 3/3 | executed after approval | 1 / 0 | paid inside mandate | valid (32 entries) |
| PixelForge Design Studio LLP | ₹5,12,845 | ₹9,34,754 (₹5,49,109 to ₹11,98,264) | ₹5,66,920 | 7.89% | ₹16,52,875 | 2/2 | yes | 3/3 | executed after approval | 1 / 0 | paid inside mandate | valid (32 entries) |

Files:
- `sandbox-run.jsonl`: every step, prompt, decision and result
- `<tenant>.audit.jsonl`: the hash-chained audit trail per SME (verify with `GET /api/sme/:tid/audit/verify`)
