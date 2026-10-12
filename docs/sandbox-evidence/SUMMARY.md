# OneGate SME: sandbox execution evidence

Run ID: `2026-10-12T09-37-48-555Z`. Sandbox date: 2026-10-12. Synthetic data only, and no real money or messages leave the sandbox.

| SME | Cash today | 30d base (low to high) | 90d base | Backtest MAPE (30d) | Overdue | Attacks blocked | Phishing warned | Policy denials | Owner-approved payment | Audit chain |
|---|---|---|---|---|---|---|---|---|---|---|
| Ananya Textiles Pvt Ltd | ₹9,59,546 | ₹4,07,826 (-₹1,43,395 to ₹8,06,398) | ₹5,45,625 | 26% | ₹27,65,230 | 2/2 | yes | 3/3 | executed after approval | valid (17 entries) |
| Chai Point Cafe | ₹5,27,403 | ₹4,56,935 (₹3,55,414 to ₹5,39,804) | ₹5,64,656 | 3.93% | ₹1,69,445 | 2/2 | yes | 3/3 | executed after approval | valid (16 entries) |
| PixelForge Design Studio LLP | ₹5,12,845 | ₹9,53,254 (₹5,67,609 to ₹12,16,764) | ₹5,85,420 | 7.89% | ₹16,52,875 | 2/2 | yes | 3/3 | executed after approval | valid (16 entries) |

Files:
- `sandbox-run.jsonl`: every step, prompt, decision and result
- `<tenant>.audit.jsonl`: the hash-chained audit trail per SME (verify with `GET /api/sme/:tid/audit/verify`)
