# One Front Door for Everything — UI/UX Design & Build Plan
### Light mode, liquid glass. A plan document only, no code. Written to be dropped into Antigravity alongside your reference screenshots.

---

## 0. How to use this file in Antigravity

Antigravity reads Markdown in a `docs/` folder natively, plus an `AGENTS.md` (or legacy `GEMINI.md`) at the project root for standing rules. Suggested layout:

```
/AGENTS.md                     <- short pointer file: "Read docs/UI_PLAN.md before touching any UI"
/docs/UI_PLAN.md                <- this file
/docs/reference-screenshots/    <- your 4 images, named clearly (see §1)
```

First prompt to Antigravity in a new session: *"Read AGENTS.md and docs/UI_PLAN.md fully, look at docs/reference-screenshots, then summarize the plan back to me and ask anything unclear before writing any code."* Make it restate the plan before it builds anything, that catches misreads early.

---

## 1. Audit of your reference screenshots (what to keep, what to throw out)

| Image | What it is | Keep | Throw out |
|---|---|---|---|
| 1 — Agent Portal (dark) | Your current agent dashboard: profile card, stat grid, performance bar, ticket queue with circular SLA timer, priority filter pills, empty state | The information architecture is genuinely good: profile + presence, 4 stat cards, a performance bar, tickets sorted by urgency with a circular countdown, a clear empty state with a priority legend. Carry all of this over. | The dark flat-card skin, the visible `Executing JavaScript...` debug console at the bottom, and the floating brand watermark bottom-right, none of that ships. |
| 2 — Escalation card (dark) | Ticket ref + priority + level chips, a reply-target progress bar, a system message ("Ravi joined the chat"), a labeled agent bubble, an amber escalation banner | This is close to right structurally, keep the chip trio, the progress bar, the labeled sender pattern, and the escalation banner concept | The dark flat card background, sharp corners, and lack of any depth/light treatment |
| 3 — Generic "sub agent" template | An `@agent` mention system in the input bar, with a dropdown listing available specialists | The *idea* of switching or being routed between specialists via a visible, named list is worth keeping conceptually (maps to your departments) | The visual execution entirely: it's a bare list with no hierarchy, no icons with real weight, no indication of which agent is active, default system font, zero personality. This is the "AI-generated, disgusting" look you flagged, don't carry any pixel of this forward. |
| 4 — Generic catalog chat response | A "reasoning" disclosure trace (`Routed to Products Specialist`, `Loading catalog...`) shown collapsed above the reply | The pattern of showing a short, collapsible "here's what I did" trace before the answer is genuinely good for trust, keep the *concept* | The visual execution: cramped spacing, a plain bordered box, suggestion chips crammed at the bottom with no breathing room, no distinction between system trace and the actual answer |

**The one-line takeaway:** your information architecture (images 1 and 2) is close to right and mostly needs a skin change. The interaction pattern in images 3 and 4 (visible routing trace, named specialist switching) is worth keeping conceptually, but must be rebuilt with zero shared visual DNA with those screenshots.

---

## 2. Design system: Liquid Glass, Light Mode

### 2.1 What "liquid glass" means here, precisely

Not just `backdrop-filter: blur()`. Three effects stacked, in this order, on every glass surface:

1. **Blur** — the base frosted effect, background content softly visible through the panel.
2. **Refraction** — a subtle distortion at the panel's edges, as if light bends through curved glass. In practice: a slightly warped/displaced duplicate of the background sampled near the border, strongest at corners, fading toward the center. This is what separates "liquid glass" from flat glassmorphism.
3. **Reflection** — a soft diagonal highlight (a light gradient sweep, roughly 8-15% white opacity) across the top third of the panel, like light catching a curved surface. Static by default, can animate subtly on hover (the highlight shifts slightly, never a hard shine-sweep animation, that reads as a "loading shimmer," which is a different, reserved visual language, see §2.4).

### 2.2 Where glass lives vs. where it doesn't

Glass is a foreground-surface treatment. It needs *something with texture or color behind it* to read as glass, on a flat white background it just looks like a gray box. So:

- **Hero section**: glass panels sit on top of the animated GhostFibers background (§4). This is where liquid glass looks best and most justifies itself.
- **Rest of the app** (dashboard, chat, forms): the canvas behind glass panels is a soft light gradient wash (very light lavender-to-white, or a barely-there radial glow behind key panels), not pure flat white. Pure white behind glass has nothing to refract, it'll look muddy. Budget for a subtle ambient background gradient sitting behind every screen, even the plain ones.
- **Never** put glass-on-glass with no gap. If a card sits inside another glass panel, the inner one uses a flat light surface instead, or the layering becomes visually noisy and kills the blur performance budget (see §2.5).

### 2.3 Color tokens (light mode)

| Token | Use | Approx. value |
|---|---|---|
| `surface-canvas` | Page background wash | Near-white with a faint lavender tint |
| `surface-glass` | Default glass panel fill | White at ~55-65% opacity over blur |
| `surface-glass-strong` | Modals, the navbar | White at ~72-80% opacity over blur (less see-through, more legible over busy content) |
| `border-glass` | 1px hairline on glass edges | White at ~40% opacity, or a very light cool gray |
| `text-primary` | Body/headings | Near-black, not pure black (softer against glass) |
| `text-muted` | Secondary text | Mid gray-blue |
| `accent-primary` | Primary actions, active states | A single confident accent (pick one, e.g. an indigo or teal, and use it everywhere rather than introducing new accent hues per feature) |
| `priority-critical` / `-high` / `-medium` / `-low` | Ticket priority chips | Keep semantically distinct hues (red/amber/blue/green family), same idea as image 1's dot legend, just restyled as glass-chip badges, not flat dots |

### 2.4 Motion language (this is where the loaders live)

Two separate motion vocabularies, never mixed:

- **Ambient/ongoing states** (thinking, syncing, loading): `LatticeLoader`. Calm, cyclical, no start/end implied until it resolves.
- **One-time confirmations** (message sent, ticket resolved, rating submitted): a quick, non-looping micro-animation (scale + fade), never a shimmer or the lattice pattern, those are reserved for "still working."

### 2.5 Performance and accessibility guardrails (non-negotiable)

- **Cap concurrent blurred layers per viewport at 3-4.** Backdrop blur is expensive; a screen with ten overlapping glass cards will visibly stutter on mid-range phones. If a screen has many cards (e.g. the ticket queue), only the *container* is glass, individual ticket rows inside it are flat, lightly-tinted rows, not each their own blur layer.
- **Contrast on glass is not guaranteed by default.** Because the panel is semi-transparent, text contrast changes depending on what's behind it. Every glass panel needs a text-shadow or a slightly stronger fill (`surface-glass-strong`) wherever body text sits directly on it over a busy background (this matters most in the Hero, where GhostFibers is moving color behind glass text).
- **Respect `prefers-reduced-motion`**: GhostFibers, LatticeLoader, and any reflection-shift-on-hover must fall back to a static frame, not just a slower version.
- **Respect `prefers-reduced-transparency`** (an OS-level setting some users have on): provide a solid-fill fallback for every glass surface, this is a real accessibility setting, not an edge case to skip.
- **Never rely on color alone** for priority or status (carries over from the Part 1 handoff spec you already have), every chip pairs a color with a word.

---

## 3. Component inventory (what you gave me, exactly as provided, and where each lives)

### 3.1 `LatticeLoader` — every "something is happening" moment

| Context | Suggested `pattern` | Why a different pattern per context |
|---|---|---|
| Chat: AI is thinking | `orbit` (as in your example) | Calm, ambient, doesn't compete with the message above it |
| Page / route transition | a slower, wider variant if the component supports a second built-in pattern; otherwise reuse `orbit` at a larger `cellSize` | Signals "bigger thing loading" than an inline chat reply |
| Button-level (Send button while a message is in flight) | smallest `cellSize`, tightest `gap`, replaces the button's label | Needs to read as "busy" at a glance, at icon scale |
| Ticket action (assigning, escalating, marking resolved) | same as button-level, placed inline next to the action's status text | Consistency: anything backend-driven and short uses the compact variant |
| Navbar ambient indicator (see §5) | smallest scale, low `idleOpacity`, no label | A quiet "something's syncing" signal, not a focal point |

**Confirm before building:** the example only shows `pattern="orbit"`. If the component supports additional named patterns, assign genuinely distinct ones per row above instead of reusing `orbit` everywhere, the point of asking for "different animations" was visual variety across contexts while keeping one visual family. If `orbit` is the only pattern available, vary `cellSize`, `gap`, `grid`, and `step` instead to create the same sense of context-appropriate variety.

Status states map directly: `working` while in progress, `done` (green, per `doneColor`) on success, `error` (red, per `errorColor`) on failure, with `showTimer` on for anything the user might wonder "how long has this been going," and off for sub-second UI feedback like the Send button.

### 3.2 `PeekRating` — the post-resolution moment, and only that moment

Placement: as a system-style card in the chat thread, immediately following the "Marked resolved" message (see the Part 1 handoff states you already have, this slots into state 7, Resolved). Full-size, as specified (`size={32}`, star shape, the five labels from Poor to Superb, `showTip` on so the label appears as the user hovers/drags across stars).

**Do not** reuse this component for per-message micro-feedback (a thumbs up/down on individual bot answers stays a separate, much smaller control), rating fatigue is real, and this component's visual weight is intentionally a "moment," not a constant fixture.

### 3.3 `GhostFibers` — Hero background only

This is the one place in the app that isn't visually "light" in the literal sense (it's a dark, glowing animated fiber field per the color values you gave), and that's intentional and correct: it's the backdrop *behind* light glass panels, the classic context liquid glass is designed to be shown against. Everything else in the product (dashboard, chat, forms) stays on the light canvas from §2.3. If that dark hero backdrop feels inconsistent once built, the fix is retuning `lineColor`/`glowColor` toward lighter brand tones, not abandoning the animated background entirely, a flat hero would waste the one component built for this exact spot.

Keep `dpr={1}` as given, don't let a future pass bump this for "sharpness," it's a real performance cost on an animated full-bleed background.

---

## 4. Page-by-page plan

For every page: what it looks like, what's on it, and how it behaves across loading / empty / error / success states. This is the "think every case" section.

### 4.1 Hero / Landing page

**Layout:** `GhostFibers` full-bleed background. A glass navbar (see §5) pinned at top. Centered glass hero card: product name "One Front Door for Everything," a one-line value statement, a primary CTA ("Get started" → auth) and a secondary ("See how it works" → scrolls to an explainer section or opens a short product tour). Below the fold: a light-canvas section (not glass-on-fibers anymore, transitions to §2.3's normal canvas) explaining the three audiences (employees, agents, managers) as three glass cards in a row.

**States:**
- Loading: GhostFibers renders progressively; navbar and hero text can render immediately since they don't depend on the canvas animation, don't block the whole page behind a spinner for a decorative background.
- Logged-in visitor: if a session exists, the primary CTA becomes "Go to your inbox" / "Open chat" instead of "Get started," routed by role (§4.2).

### 4.2 Authentication

**Screens:** Sign in, Sign up, Forgot password, a one-time-code step (if MFA is part of the build), and a role-aware redirect after success.

**Layout:** Light canvas (not the fibers background, keep that exclusive to the hero so it stays special), a single centered glass card, form fields with a soft inset (not full glass per input, inputs are flat with a glass-toned focus ring, full glass on a text input reads poorly, low contrast while typing).

**Behavior and edge cases:**
- Wrong password: inline error under the field, not a toast, don't make the user hunt for why it failed.
- Unverified account trying to sign in: distinct message ("Confirm your email first") with a resend action, not a generic "invalid credentials."
- Role resolution after login: employee → chat home (§4.3); agent → Agent Portal (§4.4); manager → Manager view (§4.7, if in scope). This decision happens server-side on the session, the UI shouldn't guess.
- Session expired mid-use: a non-disruptive banner ("Your session ended, sign in again to continue") rather than a hard redirect that loses their draft message.

### 4.3 Chat Home (employee-facing, the core screen)

This is the direct redesign target for images 3 and 4, rebuilt properly.

**Layout:**
- Glass navbar at top (logo, a compact `LatticeLoader` ambient indicator per §3.1, profile menu, a link into Chat History §4.6).
- Main column: the conversation. Message bubbles, not glass (glass-on-every-bubble is the "many blurred layers" performance trap from §2.5), instead a flat, tinted bubble style: user messages in a light accent tint, AI/agent messages in a plain light surface, both with generous padding and real line-height, this alone fixes most of what's cramped in images 3-4.
- **Routing/reasoning trace**: shown as a small collapsed strip above the AI's answer, e.g. "Routed to IT Support · checked 2 policy sources," expandable on tap. This replaces the bare "Reasoning (1 steps) / Routed to... / Loading..." stack from image 4 with one clean line plus a disclosure, not three stacked plain-text rows.
- **Specialist/department context**: instead of an `@mention` dropdown a user manually picks from (image 3's pattern, which implies the user should know which specialist to choose, the exact problem this whole product exists to solve), the department is shown *after* the AI has classified it, as a small label on its own answer ("Answered by: IT Support knowledge base"). Users are never asked to pick a department themselves; that defeats the "one front door" premise. If manual override is genuinely wanted (a user who disagrees with the routing), it's a small "Not quite, try a different area" affordance under the AI's message, not an upfront picker.
- Input bar: a glass-toned but low-opacity bar (readable, not a heavy blur since it sits over the message list constantly), send button uses the compact `LatticeLoader` while a message is in flight.
- Ticket/handoff cards (state 3 onward from your existing Part 1 spec) render inline in this same thread, styled per §2, chips for department/priority/level, the progress bar from image 2 rebuilt in light glass.
- Resolution: system message, then the `PeekRating` card (§3.2).

**States:**
- First-time user, empty thread: a friendly prompt ("Ask about IT, HR, Finance, and more, one place for all of it") plus 3-4 example questions as tappable glass chips.
- AI thinking: `LatticeLoader` (`orbit`) inline where the reply will appear.
- Network drop mid-conversation: a small inline banner in the thread ("Reconnecting...") rather than freezing the input silently.
- Ticket already open when the user returns: the thread resumes exactly where it left off, current status/ETA re-fetched and shown at the top of the reopened thread, not just where the user left it stale.

### 4.4 Agent Portal (redesign of image 1)

**Layout, keeping the proven structure from image 1, rebuilt in light glass:**
- Left sidebar (glass panel, `surface-glass-strong` since it holds a lot of dense info over the light canvas): profile card (avatar, name, department · level, presence toggle as three pill buttons, shift info), the 4-stat grid (Active / Resolved / Avg Reply / CSAT), the performance score bar, section nav (My Queue with a live badge count, All Tickets, Quick Replies), sign out at the bottom.
- Main area: "My Inbox" header, subtext "Sorted by SLA urgency," priority filter pills (rebuilt as glass chips, color + label both visible, not color-only dots), the ticket list.
- Each ticket row: department chip, priority chip, status chip, a circular SLA countdown (kept from image 1, it's a good pattern), title, ticket ref + relative time. Rows are flat/tinted, not individually glassed (§2.5).
- Right panel: when no ticket selected, the empty state from image 1 (icon, "Select a ticket...", the priority legend) rebuilt in light glass. When a ticket is selected, the conversation view: the same message-thread component family as §4.3, plus the escalation-history and warm-handoff summary described in your existing Part 1/2 docs.

**States:**
- No tickets in queue at all: distinct from "no ticket selected," a genuinely empty queue gets its own message ("You're all caught up") rather than reusing the "select a ticket" empty state.
- Agent goes offline mid-shift with tickets still assigned: those tickets stay visible and workable (offline doesn't mean invisible), but the presence toggle visibly reflects the change and new assignments stop routing to them, per the assignment engine rules already documented.
- SLA countdown reaching zero while the agent is looking at it: the ring visually shifts to the escalation color and the ticket auto-escalates per existing backend rules, the UI reflects that change live, it doesn't require a manual refresh.
- Debug/dev chrome (the `Executing JavaScript...` bar and watermark from image 1): does not exist in the shipped build, full stop, that was leftover dev tooling, not a design element.

### 4.5 Ticket detail / conversation view (shared by 4.3 and 4.4, rendered differently per role)

Same underlying thread component, two renderings:
- **Employee view**: conversational, friendly copy, handoff card style per Part 1.
- **Agent view**: same thread, plus a side panel with the warm-handoff summary, quick replies drawing on policy citations, and ticket metadata (tags, requester, SLA) that an employee never sees.

### 4.6 Chat History

A dedicated screen (or a slide-out drawer from the navbar), listing past conversations/tickets, searchable, each entry showing a one-line summary, department, date, and resolution status. Tapping resumes the full thread read-only if resolved, or live if still open. Chat history persists server-side per user (this is a real data requirement, not just client-side local storage, since it needs to survive a device change).

**States:** empty history (first-time user), a resolved thread (read-only, but the `PeekRating` remains visible showing what was submitted, not re-promptable), search with no results.

### 4.7 Manager / Department Lead view (only if in current scope)

Not detailed to the same depth here since it wasn't in your screenshots, but flagged so Antigravity doesn't invent it inconsistently: it would reuse the Agent Portal's shell (glass sidebar, stat cards) but surface department-wide metrics and the escalation/unclaimed queue instead of a single agent's personal queue. Confirm before building whether this is in scope for the current milestone.

---

## 5. Navbar spec

Glass navbar (`surface-glass-strong`, sticky), present on every screen except it sits *over* GhostFibers specifically on the Hero (needs the stronger opacity there for text legibility per §2.5) and over the plain light canvas everywhere else (can use the lighter `surface-glass` there since there's less busy content behind it).

Contents, left to right: logo/wordmark, primary nav links (varies by role, employees might not need nav links at all if chat is the only screen), a compact ambient `LatticeLoader` (only visible when something is actually syncing in the background, hidden otherwise, it should never sit there idle-animating for no reason), then profile/avatar menu on the right.

The "rubber" quality of `LatticeLoader`'s animation should read as a small, elastic pulse here, not the fuller chat-sized version, this is the smallest-scale usage in the whole app.

---

## 6. Do-not list (distilled, so nothing regresses toward images 3/4)

- No bare, unstyled `@mention` dropdowns as a *user-facing* routing mechanism, routing is the AI's job, not a menu the user has to navigate.
- No plain bordered boxes with system-monospace-feeling text for reasoning traces, one clean collapsible line, styled, not a stacked list of raw status strings.
- No visible dev/debug chrome in a shipped screen (the JS console bar, generator watermarks).
- No glass-on-glass nesting, and no more than 3-4 blurred layers on screen at once.
- No color-only priority or status indicators anywhere.
- No shimmer/skeleton animation reused for the "AI thinking" state, that's `LatticeLoader`'s job exclusively; shimmer (if used at all) is reserved for content-placeholder loading (e.g. an image not yet loaded), a different meaning than "the AI is working."
- No re-prompting `PeekRating` on an already-rated, resolved thread.
- No dark mode in this milestone, don't let Antigravity default-generate a dark variant "for completeness," it's explicitly out of scope for now.

---

## 7. Color-coded event cards in the chat, and more chat UI/UX to raise the bar

Every non-message *event* in the thread (not a chat bubble, a system event: ticket created, priority set, assigned, escalated, resolved) renders as its own small card with a left accent bar and icon in that event's color, so a user can scan a long thread by color alone without rereading every line, same idea as image 1's priority legend, applied to the timeline instead of a list.

| Event | Color | Icon | Card shows |
|---|---|---|---|
| Ticket created | Neutral blue (`accent-primary` family) | ticket/plus | Ticket ref, department |
| Priority set / changed | Priority color (critical/high/medium/low from §2.3) | flag | The level plus the one-line reason, never color alone |
| Assigned to an agent | Teal/green | person-check | First name, level label, avatar initials |
| Waiting on the user | Amber | clock-pause | What's needed from them, a reply box focus-jump on tap |
| Escalated | Orange/red, one step hotter than the ticket's current priority color | arrow-up | Old level → new level, the plain-language reason, "notes carried over" line |
| Reopened | Red-violet, distinct from escalation's orange so the two are never confused at a glance | rotate-ccw | Goes to the front of the line, per existing rules |
| Resolved | Green | check-circle | Two-line summary, then the `PeekRating` card directly beneath it |
| SLA at risk (e.g. under 5 min left) | Same as escalated color, but this is a *warning* card, not yet an actual escalation | alert-triangle | "Reply target in 5 min," no action needed from the user, just visibility |
| Outage / known issue | Slate/gray, deliberately calmer than the priority colors since it's informational, not urgent-to-them | megaphone | "IT is aware, updates here," subscribe toggle |

Rules for these cards: always paired with a word, never a bare colored dot; centered and visually smaller/quieter than message bubbles so they read as timeline punctuation, not competing content; consecutive events (e.g. created → assigned within the same second) can collapse into one compact multi-line card instead of stacking three separate cards, a thread shouldn't feel like a log file.

### More chat UI/UX improvements worth building

- **Inline citation chips.** Every factual AI answer shows a small chip naming its source (e.g. "IT Policy §3.1"), tappable to expand the exact clause text in a popover, so a user (or an agent reviewing later) can verify the answer without leaving the thread.
- **Message-level state, not just thread-level.** Each AI message quietly shows sent → answered/cited or sent → escalated, so if a user scrolls back, they can tell which of their own messages led to what, without re-reading the whole thread.
- **Sticky context header while scrolling a long thread.** Once a ticket exists, a slim glass header stays pinned at the top of the thread showing the current status/priority/level card, so scrolling up to reread old messages doesn't lose track of where things currently stand.
- **Smart grouping of rapid messages.** Multiple quick messages from the same sender within a few seconds group under one timestamp/avatar, standard chat-app hygiene that's easy to skip and immediately looks unpolished if missed.
- **Edit-aware input.** If a user is mid-typing when an agent's reply or an event card arrives, don't yank scroll position away from their cursor, a hard scroll-jump while someone is typing is one of the most common "this app feels broken" complaints in chat UIs.
- **Distinguish "AI still deciding" from "waiting for a human."** Two different `LatticeLoader` placements: one inline where the AI's own reply will land, a separate, clearly agent-branded placeholder ("Waiting for Ravi") once a human is the blocker, so a user never wonders which side the ball is currently in.
- **Quick actions surfaced contextually, not permanently.** "Reopen," "Change priority," "Add details" only appear on cards where they're currently valid (e.g. no "Reopen" button on a ticket that's still open), rather than a static toolbar of buttons that are sometimes disabled.
- **Relative + absolute time together on hover.** "12 min ago" by default, exact timestamp on hover/long-press, useful once a thread spans days.
- **A visible "you're back" resume moment.** If a user returns to an open ticket after time away, a single glass card at the point they left off ("Here's what happened while you were away: 2 updates") instead of making them scroll up to reconstruct it themselves.
- **Keyboard and screen-reader parity.** Every event card and citation chip is reachable and announced via keyboard/VoiceOver/TalkBack, not just tap, chat UIs are notorious for silently dropping accessibility once custom cards replace plain text.

---

## 8. Open questions to resolve before build (answer these, then hand this file back)

1. Is a Manager/Department Lead view (§4.7) in scope for this milestone, or later?
2. Single accent color for `accent-primary`, do you have a hex already, or should Antigravity propose 2-3 options against the GhostFibers palette for you to pick?
3. Confirm `LatticeLoader`'s full list of supported `pattern` values (§3.1 assumed only `orbit` is confirmed), so each context in the mapping table gets a genuinely distinct one rather than a workaround.
4. MFA / one-time-code as part of auth, in scope now or a later pass?
5. Should the "not quite, try a different area" manual override (§4.3) exist in this milestone, or is pure automatic routing enough for now?
