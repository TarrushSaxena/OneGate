# OneGate rendering audit and repair plan

Audit date: 6 October 2026. Local app: http://localhost:3000.

## Coverage and limits

Browser captures cover 1440 × 900 desktop and 390 × 900 mobile: home, How it works, login, account activation guidance; employee chat, requests, Today, calendar, services, submitted actions and policies; IT specialist, department manager and main manager workspaces. Screenshots are in `output/playwright/`. The repeatable capture script is `scripts/browser-design-audit.js`.

This is a rendering and navigation audit, not proof that every backend operation works. No leave approvals, expense submissions or ticket escalation records were changed for these checks. More departments, populated specialist threads, failure states, keyboard-only interactions and intermediate widths still need acceptance testing.

## Reproducible defects repaired

| Issue | Repair | Verification |
| --- | --- | --- |
| Global workspace header styling also affected nested policy/services headings | Scoped content header layout and responsive policy title | Desktop/mobile policy captures now show a full-width reader and stacked heading |
| Non-chat pages inherited chat overflow constraints | Content panel owns vertical scrolling; shell and flex children have explicit shrink rules | Calendar, services, policies and manager content have scrollable panels on mobile |
| Navigation retained old interactive page during exit animation | Remove outgoing page before inserting the next one | Removed the duplicate login-control condition encountered by the audit |
| Workplace live events could replace an unrelated page with Services | Refresh only the currently relevant workplace view | Code inspected; a live-event regression test remains required |
| Services and submitted-action details were too small | Increased body text, status details and controls | Browser measured service body text at 14px and action subjects at 16px |
| Manager started with chat navigation selected while showing overview | Initialize overview selection and current-page state | Manager startup path inspected |
| Header always said “How can we help?” on other pages | Set a relevant title when navigating | Fresh browser pass confirmed “Company policies” |
| Mobile explanation displayed step 02 before step 01 | Replace absolute positioning with natural 01 → 02 → 03 flow | Fresh mobile capture confirms ascending step positions and no overlap |
| Older mobile navigation rule capped drawer height at 27% | Remove the inherited height cap | Source corrected; final browser pass required |
| Calendar columns could grow beyond available mobile space | Use shrinkable equal-width columns and smaller mobile spacing | Source corrected; final browser pass required |

Repair styles are isolated in `frontend/styles/layout-repairs.css`, loaded after existing styles. Authentication and role permissions are unchanged.

The repeat capture still showed older cached styles/scripts. Versioned URLs for the changed stylesheet, workspace script and app script corrected the fresh-browser check. The final focused pass confirmed the policy title and mobile explanation order. Reduced-motion media preference was enabled successfully, but full animation behavior and keyboard testing remain pending. JavaScript syntax checks passed for `frontend/app.js` and `frontend/pages/pilot.js`.

## Screenshot diagnosis

The reported screenshot shows the app occupying approximately a mobile-width column inside a much wider capture. The inspected app root fills both tested viewport widths. The exact blank-right-area condition was not reproduced; do not assume it is conclusively fixed. Check the actual in-app browser viewport and stylesheet cache with a fresh reload. The cramped policy heading was independently reproducible from competing header rules and has been repaired.

## Remaining work, in priority order

### P0 — protect page state and access

1. Test rapid repeated navigation, browser Back/Forward, refresh and expired login on every workspace view. Ensure delayed API responses cannot render an old view over the current view.
2. Emit ticket/workplace events while Policies and My actions are open. Preserve the selected view, form draft and scroll position.
3. Verify policy PDF authorization, loading, retry and download in the actual in-app browser. Keep mobile “Read PDF” as an explicit external-reader option; do not rely solely on embedded PDF support.
4. Complete employee → specialist → department manager escalation and approval loops. Confirm queue invalidation, conversation continuity and role-based access. Test errors and retries without duplicate submissions.

Acceptance: one active page, no silent page replacement, no lost drafts, no unauthorized records and no uncaught navigation errors.

### P1 — improve the information hierarchy

1. Calendar: put date selection first; move the large demo schedule below it or into a collapsible section. On phones, show compact day markers and readable selected-day details instead of squeezing event labels into seven narrow columns.
2. Specialist: give the unselected-thread state a clear “Choose a request” prompt and accessible queue opener. Keep a populated thread’s reply composer reachable without scrolling the whole desktop shell.
3. Notifications: position transient notices away from mobile titles and navigation. Use a polite live region; do not obscure controls.
4. Requests: verify resolved/active grouping, unread state, long subjects, assignment, ETA and timeline with populated records. Avoid simultaneous competing request panels.
5. My actions: test leave, expense and other categories with long descriptions; make approver, next step and demo versus real data unmistakable.

Acceptance: useful next action visible in every empty state, readable dates/statuses and no accidental nested scrolling that hides the composer.

### P2 — consolidate visual and accessibility rules

1. Consolidate overlapping workspace styles into scoped component rules; avoid another sequence of global overrides. Retain light mode and the glass-layer limit.
2. Establish body/metadata/control typography and contrast tokens. Increase faint hero workflow captions; do not use 8–10px text for essential information.
3. Check 320, 390, 768, 1024 and 1440px widths, plus 200% zoom. Verify modal focus, Escape, visible focus, touch target sizes and complete keyboard access.
4. Test reduced motion on the hero, empty chat, navigation and request transitions. Disable decorative looping movement while keeping status changes understandable.
5. Test slow/offline APIs, broken stock-image URLs and PDF failures with helpful placeholders and retry controls.

Acceptance: no outer horizontal overflow, all content reachable, logical focus order, readable contrast and no essential information conveyed only by animation.

## Evidence notes

Initial captures found no broken image loads. The app root filled each tested width. Some automated overflow flags are intentionally horizontally scrollable suggestion/filter rows, not page overflow. Account creation remains company-provisioned; the signup screen must not imply that employee-selected privileged roles are available.
