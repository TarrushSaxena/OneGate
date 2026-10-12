# OneGate SME — Pitch Deck (10 minutes)

**Files:** [PPTX and PDF on Google Drive](https://drive.google.com/drive/folders/1sksHP-oYGp0sC7nAqAZzvl535y9GnbHF) (view-only link). 23 slides, speaker notes with timings in the PPTX.

Photographs in the deck are AI-generated illustrations of fictional people; charts and screenshots come from this repository's real code and test output.

## Slide outline

1. **OneGate SME** — Open with the promise in one breath: the copilot does the chores small businesses never get to, and money never moves without the owner
2. **The problem** — Ninety seconds on why this matters.
3. **Cash runs out first** — Make it personal: a textile wholesaler with a full order book still cannot pay a yarn supplier because three customers pay late
4. **The gap in India** — Sources: TransUnion CIBIL MSME report (Dec 2025 data): 7.7 crore Udyam-registered enterprises, about 3.6 crore credit-active, 47% penetration
5. **Three daily blockers** — The fourth blocker is trust: owners will not hand a bot their bank account
6. **One tap to approve** — This is the turn from 'what is' to 'what could be'
7. **What we built** — Four minutes: the tasks, the screen, the numbers
8. **Six tasks end to end** — All six are implemented as REST endpoints under /api/sme and reachable in plain English through the copilot
9. **How it decides** — Every request passes the prompt guard first
10. **One screen** — Live demo point
11. **Forecast versus reality** — Walk-forward backtest: forecast from 30 days ago without later data, compare base case with actual balances, MAPE
12. **Cheapest credit first** — Estimated total cost to borrow ₹5,00,000 for Ananya Textiles
13. **Safe by design** — Security is 30% of the score and the main reason owners say no
14. **Four tiers of authority** — Hard limits: ₹5,00,000 per payment, ₹8,00,000 per day, verified beneficiaries only, approvals expire after 24 hours, idempotency keys, and policy re-checked at execution
15. **Attack blocked** — Live demo: press Try an attack
16. **We attacked ourselves** — Our red team found three detection gaps; all are fixed and regression-tested
17. **Words cannot move money** — The copilot routes intents to deterministic tools
18. **Why we win** — Close with proof, difference, team and the ask.
19. **Proof** — Run node backend/tests/run-all-tests.js
20. **Why it is different** — Innovation is 30%
21. **Next steps** — Roadmap items are plans, not built
22. **Team GateKeepers** — B.Tech Computer Science students at Bennett University, India
23. **Let small businesses delegate safely** — End on the ask
