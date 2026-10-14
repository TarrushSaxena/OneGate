# OneGate SME: sandbox execution evidence

Run ID: `2026-10-14T06-54-02-644Z`. Sandbox date: 2026-10-12. Synthetic data only, and no real money or messages leave the sandbox.

| SME | Cash today | 30d base (low to high) | 90d base | Backtest MAPE (30d) | Overdue | Attacks blocked | Phishing warned | Policy denials | Owner-approved payment (amount + OTP) | Agent plan (tool steps / approval cards) | Autopilot with mandate | Next GST (status, credit at risk) | Early-pay discounts | Audit chain |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Ananya Textiles Pvt Ltd | ₹9,59,546 | -₹1,74,926 (-₹6,33,024 to ₹1,48,112) | -₹4,69,505 | 14.82% | ₹27,65,230 | 2/2 | yes | 3/3 | executed after approval | 8 / 4 | escalated to owner (would breach buffer) | ₹1,44,000 on 2026-10-20: covered, ₹25,248 at risk | held back: paying early would break your buffer; forged discount denied | valid (61 entries) |
| Chai Point Cafe | ₹5,27,403 | ₹4,12,509 (₹3,16,398 to ₹4,92,490) | ₹5,18,690 | 3.63% | ₹1,69,445 | 2/2 | yes | 3/3 | executed after approval | 1 / 0 | paid inside mandate | ₹38,400 on 2026-10-20: covered, ₹0 at risk | saved ₹384 (owner-approved); forged discount denied | valid (37 entries) |
| PixelForge Design Studio LLP | ₹5,12,845 | ₹7,77,632 (₹4,24,414 to ₹10,23,212) | ₹2,08,948 | 8.68% | ₹16,52,875 | 2/2 | yes | 3/3 | executed after approval | 1 / 0 | paid inside mandate | ₹54,000 on 2026-10-20: covered, ₹4,134 at risk | saved ₹540 (owner-approved); forged discount denied | valid (37 entries) |

Files:
- `sandbox-run.jsonl`: every step, prompt, decision and result
- `<tenant>.audit.jsonl`: the hash-chained audit trail per SME (verify with `GET /api/sme/:tid/audit/verify`)
