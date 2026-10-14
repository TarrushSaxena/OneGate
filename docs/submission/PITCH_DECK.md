# OneGate SME: pitch deck (v1.8, 14 Oct 2026)

28 slides. Files: `OneGate_SME_Pitch_Deck.pptx` and `.pdf` in the submission Drive folder. Every number matches `docs/sandbox-evidence/SUMMARY.md`.

1. **OneGate SME**
2. **The problem**
3. **Cash runs out first** — Small businesses run out of cash long before they run out of customers.
4. **The gap in India** — 7.7 cr Udyam-registered MSMEs (Dec 2025); 47% Of them are credit-active; 24% Of credit demand unmet: ₹30 lakh crore
5. **Three daily blockers** — Cash No forecast. The shortfall is a surprise.; Dues Chasing customers is awkward and always postponed.; Credit Mudra, OD, TReDS and NBFC lines differ in rules and cost.
6. **One tap to approve** — A copilot that does the chores and asks before it spends a rupee.
7. **What we built**
8. **The cockpit** — It opens on what the agent already did, with the plan waiting for one tap.
9. **The agent plans the fix** — Forecast Finds the low point of -₹7,62,344 on 24 Nov; Chase Queues reminders on the three best overdue invoices, about ₹2,87,962; Finance Sizes the rest and picks credit that lands before 21 Oct; Re-simulate Checks the plan keeps cash above the buffer
10. **Ananya's gap closes** — ‑₹7.6L Low point if nothing changes, 24 Nov; ₹9L TReDS discounting at 9.4%, cost ₹16,387; ₹4.26L Low point after approval, above the ₹4.12L buffer
11. **Cheapest credit first** — ₹16,387 TReDS discounting · 9.4% · 3 days; ₹55,248 PMMY Tarun loan · 10.25% · 21 days; ₹66,043 Bank overdraft · 11.5% · 14 days; ₹1,13,291 Fintech NBFC line · 19% · 2 days
12. **How it decides** — Guard, plan, check policy, wait for the owner, then log.
13. **Honest forecast bands** — The shaded band is where cash really landed 80% of the time.
14. **Backtesting fixed the forecast** — Ananya Textiles · 26% → 14.82% · -₹11.56L → -₹2.72L; Chai Point Cafe · 3.93% → 3.63% · -₹1.41L → -₹0.42L; PixelForge Studio · 7.89% → 8.68% · -₹3.10L → -₹0.53L
15. **Built for India**
16. **India rules built in** — MSME 45-day rule · s.43B(h) · Reminder explains the buyer's delayed deduction; TDS on receipts · Plans on net cash and asks for Form 16A; Statutory calendar · TDS 7th · GSTR-1 11th · PF 15th · GSTR-3B 20th; RBI Key Facts Statement · All-in APR shown and consent bound to it; Disputes · Disputed invoices never chased or paid
17. **A 19% loan is really 22.92% once fees count** — Every loan card shows the all-in APR before the owner can approve it.
18. **Safe by design**
19. **Four tiers of authority** — READ Books and forecasts. The agent acts alone.; SUGGEST Drafts and plans. Nothing leaves the sandbox.; EXECUTE Owner approves with a one-time code bound to the amount.; DENY New payees or bank changes. Never delegated.
20. **Red-team on demand** — One button fires 21 live attacks at the running system.
21. **21 attacks and 21 blocks** — Prompt injection · 7 · Hinglish · Hindi · base64 · lookalike letters · No; Scams and social engineering · 2 · Bank details changed · owner already approved · No; Money movement · 5 · ₹6L split into three ₹2L payments · No; Duties and codes · 4 · Agent self-approval · code replay · No; LLM output and audit · 3 · Invented ₹3,21,450 saving · ₹1 audit edit · No
22. **Words cannot move money** — Policy A deterministic engine decides, not the model; Limits Verified payees and hard rupee caps; Audit Every decision hash-chained per tenant
23. **Why we win**
24. **Proof** — 48/48 Test suites pass, with 128 SME tests; 21/21 Live attacks blocked and no money moved; 80% Forecast band coverage on all three SMEs
25. **Why it is different** — Chatbots Give advice. Cannot act or prove what they did.; Banking apps Hold the money. Do no forecasting or chasing for you.; OneGate SME Plans and acts inside owner-signed limits with an audit trail.
26. **Next steps** — Now Working sandbox with cockpit, autopilot, red-team and evidence; Next Live LLM traces, passkeys and persistent audit storage; Then Account Aggregator consent plus TReDS and lender APIs; Later Pilot with Greater Noida SMEs
27. **Team GateKeepers** — Tarrush Saxena Lead. Product, copilot design and pitch; Yogya Mittal Forecasting and financing logic; Utkarsh Gupta Backend, policy engine and security
28. **Let small businesses delegate safely** — Bring OneGate SME to the Shenzhen finals and we will show it live.; Repo github.com/TarrushSaxena/OneGate; Try it /sme.html then press Run red-team
