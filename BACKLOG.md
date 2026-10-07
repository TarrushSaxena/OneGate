# PS18 Backlog

Ordered implementation items with acceptance criteria per PS18 Loop Prompts and Handoff UX Spec.

- [x] **01 Migrations / Data Model**: Tickets have `priority_reason`, `eta_low_min`, `eta_high_min`, `first_reply_at`, `escalation_history`; employees have `display_name` / `tier` / `department`.
      *Acceptance*: State model and fake datasets load clean, tickets and employees contain all required fields.

- [x] **02 Priority Service**: Rules plus sentiment returns `{priority, priority_reason}`.
      *Acceptance*: Incident phrases trigger `urgent`, stated deadlines trigger `high`/`urgent`, default is `normal`/`low`. Word + plain reason always provided.

- [x] **03 ETA Service**: Implements the formula in Part 1 (`queue_wait + avg_first_reply`), range rounded to 5 min, clamped to SLA, clock time formatted.
      *Acceptance*: Range is formatted as "About X to Y min, by H:MM AM/PM", adapts to online agents, queue size, and SLA deadline.

- [x] **04 Level Label Mapper**: Maps internal tiers (`L1`, `L2`, `L3`, `Manager`) to user-friendly labels (`Level 1 support`, `Level 2 specialist`, `Level 3 senior specialist`, `Team lead`).
      *Acceptance*: Returns friendly labels, never exposes raw tier names or internal scoring to users.

- [x] **05 Handoff Payload Builder**: Serializes ticket to user-facing DTO.
      *Acceptance*: Passes deny-list test (zero `score`, `load`, `employee_id`, `rolling_score`), outputs `{ ticket_ref, department, priority, priority_reason, assigned_first_name, level_label, status_step, eta_low_min, eta_high_min, eta_clock, can_change_priority }`.

- [x] **06 Realtime Socket Events**: Events for `ticket:created`, `ticket:assigned`, `ticket:status`, `ticket:escalated`, `outage:announced`, `ai:typing`.
      *Acceptance*: Multi-client WebSocket communication routes user and agent updates without cross-user leak.

- [x] **07 Orchestrator Pipeline**: DistilBERT classifier + Naive Bayes fallback + TF-IDF KB retrieval + multi-intent detection and sequential follow-up resolver.
      *Acceptance*: Correctly distinguishes single vs. multi-intent queries, asks clarification on multi-topic, resolves follow-up choices back to original context.

- [x] **08 Filters & Guards**: PII redaction (card, SSN, phone, email, bank account) + offensive language gentle filter + prompt injection defense.
      *Acceptance*: Masked PII shown calmly, raw sensitive data redacted before LLM and logs, zero leaks.

- [x] **09 Warm Handoff Summary & Agent Assist**: AI generates 3-line summary (Issue, Tried, Needs) and suggested response citing exact policy clauses.
      *Acceptance*: Agent sees suggested reply with clickable policy clause; employee never sees internal metadata.

- [x] **10 Escalation & Reopen Service**: Emits `ticket:escalated` with plain reason and recalculated ETA; reopen bumps priority one step and puts ticket at front of line.
      *Acceptance*: Escalation carries notes forward; reopen increases urgency.

- [x] **11 Off-Hours & Queue Position Flow (States 9 & 10)**:
      - State 9 (Off Hours): "Support is offline until 9:00 AM. Your ticket is first in line. Here's a self-serve fix to try now." + cited article.
      - State 10 (No One Free): "Everyone at this level is busy. You're Nth in line, about X to Y min." Live queue position updates.
      *Acceptance*: Fake clock / offline agent status triggers offline card with KB fallback; high queue load displays live queue position banner.

- [x] **12 User Chat UI Overhaul (Light Mode Liquid Glass)**:
      - Complete implementation of the 13 UX states from Part 1.
      - Liquid glass tokens: `surface-canvas`, `surface-glass`, `surface-glass-strong`, `border-glass`.
      - Color-coded timeline event cards with left accent bars (Ticket created, Priority changed, Assigned, Waiting on user, Escalated, Reopened, Resolved, SLA at risk, Outage).
      - Inline citation chips with popover clause viewer (`📎 Source: IT Policy §3.1`).
      - Collapsible routing reasoning trace (`Routed to IT Support · checked 2 policy sources`).
      - Sticky active ticket context header while scrolling.
      - `PeekRating` post-resolution card (1-tap rating with 5 labels).
      - `LatticeLoader` for ambient thinking / in-flight states.
      *Acceptance*: All 13 states render crisply in Light Mode Liquid Glass; no glass-on-glass nesting (>3-4 blur layers); contrast and accessibility pass.

- [x] **13 Employee Agent Portal Overhaul (Light Mode Liquid Glass)**:
      - Redesign of Agent Portal matching image 1's architecture in pure Light Glass.
      - Profile card with presence toggle pills (Online, Away, Busy).
      - 4-Stat card grid (Active, Resolved, Avg Reply, CSAT).
      - Performance bar.
      - My Queue sorted by SLA urgency with circular SVG countdown timer.
      - Priority filter pills with color + text label.
      - Ticket detail with warm handoff summary, quick replies with policy citations, and reply box writing directly into user's thread.
      - Removal of all debug console chrome (`Executing JavaScript...` bar and watermarks).
      *Acceptance*: Agent replies appear instantaneously in user chat; SLA timer color transitions on countdown; presence toggle routes assignments accurately.

- [x] **14 Real Authentication**:
      - Email + password login, passwords hashed with bcrypt (never plaintext, never reversible).
      - Sessions via JWT carrying user ID, role, department, and token version.
      - Lockout after 5 failed attempts within 15 minutes, rejecting even correct passwords until 15-minute window expires or reset.
      - Password reset flow (request link -> expiring token -> reset -> old password rejected, new password works).
      - Password strength enforcement (minimum 12 chars, upper, lower, number, symbol).
      - Passwords never logged, never returned in API responses.
      *Acceptance*: Verified via `backend/tests/ps18-14-auth.test.js` (5/5 tests passing).

- [x] **15 Real Accounts & Zero Demo Switchers**:
      - Complete removal of demo personas, fake emails, and "Switch Identity" buttons.
      - 4 real roles: `employee`, `support_executive`, `department_manager`, `main_manager`.
      - Role provisioning hierarchy: Main Manager creates Department Managers; Department Managers create Support Executives and Employees for their department.
      - Seed script generates authentic accounts across all 11 departments with temporary passwords and must-change-password requirement.
      - Employees provisioned via Manager (provisioning-only, no self-signup).
      - Grep codebase confirms zero hardcoded demo identities or switcher components.
      *Acceptance*: Verified via `backend/tests/ps18-15-accounts.test.js` (3/3 tests passing, 0 grep leaks).

- [x] **16 Role-Based Routing**:
      - Post-login redirect per role:
        - Employee -> `/app/chat`
        - Support Executive -> `/app/inbox`
        - Department Manager -> `/app/department`
        - Main Manager -> `/app/org`
      - Direct navigation to unauthorized role pages returns HTTP 403 Forbidden.
      - Server-side route guards for `/app/*` endpoints.
      *Acceptance*: Verified via `backend/tests/ps18-16-routing.test.js` (2/2 tests passing).

- [x] **17 Department Manager Page**:
      - Light Glass shell matching rest of app.
      - Department-wide queue: all tickets for their department, filterable by tier, status, priority.
      - Staff roster: support executives in this department, status (online/busy/offline), current load, score.
      - Metrics cards: open tickets, resolved today, avg resolution time, SLA breach count this week, open vs resolved 7-day trend.
      - Server-side hard-scoping to manager's session department; any query/body department parameter is overridden to user's department.
      *Acceptance*: Verified via `backend/tests/ps18-17-dept-manager.test.js` (2/2 tests passing).

- [x] **18 Main Manager Page**:
      - Org-wide view across all 11 departments (IT, HR, Finance, Billing, Customer Support, Cybersecurity, Data & Analytics, Investor Relations, Legal, Marketing, Quality Assurance).
      - Aggregate metrics: total tickets open, total resolved, org SLA compliance, weekly breaches.
      - Department breakdown table showing each department's volume, staffing, and SLA compliance.
      - Read-only drill-down into any department's dashboard.
      - Department Manager calling aggregate endpoint receives strictly their department's slice.
      *Acceptance*: Verified via `backend/tests/ps18-18-main-manager.test.js` (3/3 tests passing).

- [ ] **19 Admin "View As" Tool**:
      > [!CAUTION]
      > **DO NOT BUILD THIS YET.** This item requires explicit user confirmation before any implementation work begins.
      - Impersonation/view-as functionality for administrator role.
      *Status*: Unbuilt. Pending explicit user confirmation.

---

# Phase 2: Corporate Features Expansion

Sequential 3-item sub-batches with full test-driven discipline, strict server-side ownership/IDOR enforcement, data classification tags, and audit trails.

### Sub-Batch 1: Workforce, Access & Safety Core (Completed)
- [x] **20 Entry/Exit Door Swipe Simulation & Attendance Engine**:
      - `door_swipe_events` table (event_id, card_id, employee_id, door_id, direction, timestamp).
      - Simulate swipe API + derive daily attendance (first in / last out, absence flagged if zero swipes by cutoff).
      - Strict separation between Attendance (clock-in) and Presence (online/busy/offline).
      - Scoped visibility: Employee sees own history; Direct Manager sees team; Main Manager sees org; IDOR enforced (403).
      *Acceptance*: Verified via `backend/tests/ps18-20-attendance.test.js` (2/2 tests passing).

- [x] **21 Emergency / SOS Targeted Alerting System**:
      - One-touch SOS event trigger with Urgent priority.
      - Bypasses normal ticket queue triage; immediately notifies employee's direct manager, Security, and HR lead.
      - Targeted delivery only (never broadcast company-wide); immutable security audit record.
      *Acceptance*: Verified via `backend/tests/ps18-21-emergency-sos.test.js` (2/2 tests passing).

- [x] **22 Lost ID Card Security Protocol**:
      - Instant card deactivation upon report (subsequent swipe attempts rejected with 403 `card_deactivated`).
      - IT/Security badge replacement ticket creation + security incident log.
      - Scoped: Only cardholder or Security/Facilities admin can report; IDOR protected.
      *Acceptance*: Verified via `backend/tests/ps18-22-lost-id.test.js` (2/2 tests passing).

### Sub-Batch 2: Approvals, Finance & HR Self-Service (Queued)
- [ ] **23 Structured Expense Reimbursement Flow** (Form, receipts, manager & Finance approval queue, IDOR checks, audit log).
- [ ] **24 Leave / Time-Off Request & Balance Engine** (Overlap rejection, dynamic remaining balance calculation, manager approvals).
- [ ] **25 Secure Payslip Delivery & Audit Trail** (Restricted data tier, strictly owner-only & Finance-only, access audit log).

### Sub-Batch 3: Facilities & Workplace Logistics (Queued)
- [ ] **26 Meeting Room Scheduling & Collision Engine** (Conflict checks, privacy free/busy filtering).
- [ ] **27 Visitor Management & Host Arrival Notifications** (Pre-registration, digital pass/QR, host arrival alerts).
- [ ] **28 Parking Spot Allocation & Reservation** (Assigned vs visitor spots, double-booking prevention).

### Sub-Batch 4: Employee Directory, Health & Transportation (Queued)
- [ ] **29 Work-Facing Internal Directory & Org Chart** (Work fields only, strict stripping of personal phone/address/salary).
- [ ] **30 Confidential Wellness / EAP Session Booking** (Strict privacy, zero individual manager/HR access, aggregate reporting).
- [ ] **31 Corporate Shuttle / Transportation Booking** (Routes, schedules, seat reservation).

### Sub-Batch 5: Corporate Life, Cafeteria & Telemetry Mocks (Queued)
- [ ] **32 Cafeteria Weekly Menu & Chat Deep-Link** (Admin menu management, daily specials, chat deep-link).
- [ ] **33 Holiday Calendar, Announcements & Birthday Shoutouts** (Announcements feed, month+day shoutouts only).
- [ ] **34 Office Spatial Navigation & EV Charging Telemetry Mock** (Spatial FAQ lookup + labeled mock EV station status).

