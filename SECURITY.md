# Security policy

## Reporting
Please report vulnerabilities privately to the maintainers (GitHub: @TarrushSaxena) instead of opening a public issue.

## Secrets
- Never commit secrets. `.env` and `.env.*` are git-ignored; only `.env.example` (placeholders) is tracked.
- `backend/tests/sme-03-secret-hygiene.test.js` fails the test suite if a tracked file contains a known secret pattern (API keys, private keys, published demo passwords).
- Demo accounts have no password in the repo; see `DEMO_ACCESS.md`.

## Incident note (October 2026)
An LLM provider (Zenmux) API key was committed in early history (`d5a76f9`, `f105965`). It was removed from `.env`, `.env.example` and `backend/services/llm.js` in `f105965` and from the README in `018f489`; the current tree contains no key. **Status: key pending revocation by its owner at the provider.** History has not been rewritten (that would change every commit hash the submission cites); removing a file from the latest commit does not remove it from history, so until revocation the key should be treated as exposed.

The development JWT secret is no longer a constant: outside production an unset `JWT_SECRET` gets a random secret per process.

See `docs/SECURITY_SELF_ASSESSMENT.md` for the threat model and controls of the SME Finance Copilot.
