# Security policy

## Reporting
Please report vulnerabilities privately to the maintainers (GitHub: @TarrushSaxena) instead of opening a public issue.

## Secrets
- Never commit secrets. `.env` and `.env.*` are git-ignored; only `.env.example` (placeholders) is tracked.
- `backend/tests/sme-03-secret-hygiene.test.js` fails the test suite if a tracked file contains a known secret pattern (API keys, private keys, published demo passwords).
- Demo accounts have no password in the repo; see `DEMO_ACCESS.md`.

## Incident note (October 2026)
An LLM provider API key was committed in early history (`d5a76f9`, `f105965`) and removed from the working tree in `bc6f811`. The key has to be revoked at the provider, and history rewritten, before the repository is considered clean. Removing a file from the latest commit does not remove it from history.

See `docs/SECURITY_SELF_ASSESSMENT.md` for the threat model and controls of the SME Finance Copilot.
