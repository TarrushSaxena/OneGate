# Pilot implementation status — 2026-10-05

Release gate: NOT PASSED. This is a staged implementation, not a production-ready release.

## Implemented foundation

- Public signup is denied; private APIs require an active session. Legacy memory-backed operational endpoints are retired instead of bypassing the new service.
- Socket authentication derives rooms from the account. Arbitrary join identities are ignored. Ticket access is scoped to owner, assignee, department head or director.
- Durable transactional support aggregate: PostgreSQL JSONB when DATABASE_URL is configured; atomic local JSON for development. Production startup refuses a missing database URL. Tickets, conversations, messages, lifecycle events, feedback, subscriptions and workplace records share transaction boundaries.
- Version-checked ticket actions and per-actor, per-route idempotency keys. Replies, waiting for information, resolution, feedback, escalation, self-service confirmation and reopening retain the ticket/thread. Offline/full/unregistered specialists are excluded from new assignment.
- Shared light role workspace replaces sample ticket/history screens. Saved transcripts load on entry, socket reconnect fetches snapshots, employee drafts survive failed sends, Markdown is escaped before formatting, and subscriptions disconnect on navigation/logout.
- Company-managed holiday, announcement, menu, parking, shuttle, room and navigation records. Transactional reservations, cancellation, invitation response API, announcement receipts, manual attendance review and opaque expiring single-use meal QR tokens. The QR token is an unguessable server-validated bearer token, not a signed offline token.

## Verified evidence

Run from backend:

```powershell
node --test tests/pilot-security.test.js tests/pilot-store.test.js
npm audit --omit=dev
```

Two test groups pass. Assertions cover anonymous REST/socket denial, forged identity, cross-account ticket/conversation access, ignored forged socket rooms, resolution replay, stale-version conflict, feedback, same-ticket reopening, concurrent reservation conflicts, cross-department reservation denial, QR duplicate redemption, durable local reload and failed-transaction rollback. Dependency audit reports zero known vulnerabilities.

Live employee browser: greeting creates no ticket, transcript survives reload and application-server restart, socket indicates Live, calendar renders truthful empty company records and month controls. These checks are NOT all-role end-to-end acceptance or two-second delivery evidence.

## Remaining release blockers / implementation work

1. Configure PostgreSQL and verify real database restart, concurrency, backup/restore and migration rollback. No PostgreSQL service is running in this environment; Docker engine is stopped. Accounts/password resets still use the existing account store and need PostgreSQL migration with safe import. The JSONB aggregate is an initial transactional storage implementation, not the final normalized relational schema.
2. Finish transactional SLA escalation, automatic queue drain when specialists become available, attendance shift/location/correction rules and approval workflows. Legacy SLA mutation timer is disabled to prevent uncommitted changes; do not mistake legacy startup logs for active features.
3. Extend routing beyond the orchestrator's four canonical departments; do not claim complete eleven-department support yet. Move slow ML/LLM work outside the aggregate lock and verify timeout/provider failure behavior.
4. Complete all 13 backend-triggered chat UX states, bounded thinking indicators, draft restoration across route changes, separate Active/Resolved pagination, meeting participant picker/response UI, navigation maps, richer menu display, editable location-aware company administration and outage administration.
5. Face recognition enrollment/liveness and badge integration remain disabled; manual submission is pending verification, never automatic absence. Calling remains disabled pending authenticated signaling, browser call states, TURN configuration and call-event acceptance tests.
6. Implement multi-process outbox/event delivery, socket session revocation/expiry enforcement after connection, full event/version deduplication, monitoring/alerts and latency/stale-dashboard metrics.
7. Exercise every employee/specialist/head/director journey in separate sessions, every workplace failure/ownership scenario, mobile/desktop screenshots, keyboard/screen-reader/contrast checks and the healthy-environment two-second update gate. Existing legacy tests expect retired endpoints and require deliberate migration, not silent acceptance.

## Development recovery

Start backend with `npm start` from backend; it also serves the frontend on port 3000. Preserve backend/data/runtime/accounts.json and pilot.json together. For development backups, stop the application before copying both files; restore only while stopped and verify account login plus ticket/transcript counts before reopening access. This is not a verified PostgreSQL recovery procedure.

For a configured database, use the organization's secret manager to supply DATABASE_URL and a strong JWT_SECRET; do not paste secrets into reports or commit them. A database backup/restore drill and audited director bootstrap tooling are mandatory before pilot authorization.
