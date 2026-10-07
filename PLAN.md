# ONE FRONT DOOR FOR EVERYTHING — UI/UX ARCHITECTURAL BLUEPRINT & IMPLEMENTATION PLAN

> **Project Identity**: One Front Door for Everything  
> **Design Philosophy**: High-End Light Theme · Liquid Glass (Refraction, Specular Reflection & Multi-Layer Blur) · Rubber Elastic Motion · Native Sub-Agent Orchestration · Zero Dead-Ends  
> **Status**: Comprehensive Specification & Implementation Roadmap for Antigravity  

---

## 1. Executive Summary & Design System

### 1.1 Aesthetic Pillars
1. **Light Mode Exclusivity**:
   * Pure luminous background canvas (`#F8FAFC` to `#FFFFFF`) paired with high-contrast obsidian slate typography (`#0F172A`, `#334155`).
   * No murky dark cards. Contrast ratio ≥ 7:1 for text, ≥ 4.5:1 for interactive controls.
2. **Liquid Glass Optics**:
   * **Refraction**: Multi-stop gradient borders mimicking glass bevels (`linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.3) 50%, rgba(0,0,0,0.04) 100%)`).
   * **Reflection**: Subtle top-lit linear specular shine (`linear-gradient(to bottom, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.05) 40%, transparent 100%)`).
   * **Blur & Depth**: Layered backdrops (`backdrop-filter: blur(28px) saturate(190%)`), convex inner shadows (`inset 0 1px 1px 0 rgba(255,255,255,0.95)`, `inset 0 -1px 2px 0 rgba(15,23,42,0.04)`), and ambient soft drops (`0 12px 32px -4px rgba(15,23,42,0.06), 0 4px 12px -2px rgba(15,23,42,0.03)`).
3. **Rubber Segment Physics**:
   * Elastic sliding indicator on tab segments and navigation pills with cubic bezier easing (`cubic-bezier(0.34, 1.56, 0.64, 1)`). Stretches along the axis of movement before snapping smoothly into place.
4. **Sub-Agent Multi-Door Routing**:
   * Inspired by modern AI agent workspaces (Images 2 & 3): Explicit `@` agent selectors (`@general`, `@it`, `@hr`, `@finance`, `@facilities`, `@human`), collapsible reasoning disclosures, and proactive suggestion pills.

---

## 2. Complete Color & Design Token Palette

```css
:root {
  /* Surfaces */
  --bg-canvas: #F8FAFC;
  --bg-surface: #FFFFFF;
  --bg-glass-card: rgba(255, 255, 255, 0.72);
  --bg-glass-elevated: rgba(255, 255, 255, 0.85);
  --bg-glass-overlay: rgba(248, 250, 252, 0.82);

  /* Glass Optics */
  --glass-border: rgba(255, 255, 255, 0.85);
  --glass-border-subtle: rgba(15, 23, 42, 0.08);
  --glass-specular: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.3) 60%, transparent 100%);
  --glass-shadow-sm: 0 2px 8px -2px rgba(15, 23, 42, 0.05), inset 0 1px 1px 0 rgba(255, 255, 255, 0.9);
  --glass-shadow-md: 0 8px 24px -4px rgba(15, 23, 42, 0.07), 0 2px 6px -1px rgba(15, 23, 42, 0.03), inset 0 1px 1.5px 0 rgba(255, 255, 255, 0.95);
  --glass-shadow-lg: 0 20px 40px -8px rgba(15, 23, 42, 0.1), 0 4px 12px -2px rgba(15, 23, 42, 0.04), inset 0 1px 2px 0 rgba(255, 255, 255, 1);

  /* Typography */
  --tx-primary: #0F172A;
  --tx-secondary: #475569;
  --tx-tertiary: #64748B;
  --tx-quaternary: #94A3B8;

  /* Department Semantic Themes (Light Mode Tailored) */
  --dept-it-base: #2563EB;
  --dept-it-bg: rgba(37, 99, 235, 0.08);
  --dept-it-border: rgba(37, 99, 235, 0.22);

  --dept-hr-base: #7C3AED;
  --dept-hr-bg: rgba(124, 58, 237, 0.08);
  --dept-hr-border: rgba(124, 58, 237, 0.22);

  --dept-fin-base: #059669;
  --dept-fin-bg: rgba(5, 150, 105, 0.08);
  --dept-fin-border: rgba(5, 150, 105, 0.22);

  --dept-fac-base: #D97706;
  --dept-fac-bg: rgba(217, 119, 6, 0.08);
  --dept-fac-border: rgba(217, 119, 6, 0.22);

  /* Urgency & SLA */
  --urgency-critical: #DC2626;
  --urgency-high: #EA580C;
  --urgency-medium: #0284C7;
  --urgency-low: #16A34A;
}
```

---

## 3. Screen-by-Screen Architecture & User Flows

```
┌────────────────────────────────────────────────────────────────────────┐
│                   ONE FRONT DOOR FOR EVERYTHING                        │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  [Screen 1: Hero Page]                                                 │
│  GhostFibers Background + Liquid Glass Rubber Nav + Quick Triage Bar   │
│                                │                                       │
│                                ▼                                       │
│  [Screen 2: Unified Auth & Role Switcher]                             │
│  Employee (User)  │  Support Specialist (L1/L2/L3)  │ Operations Mgr   │
│         │                          │                         │         │
│         ▼                          ▼                         ▼         │
│  [Screen 3: Live Chat]     [Screen 4: Agent Inbox]   [Screen 5: Mgr]   │
│  • Sub-Agent Mention Box   • SLA Urgency Queue       • Metrics & CSAT  │
│  • Reasoning Step Drawer   • Warm Handoff Context    • Accuracy Map    │
│  • LatticeLoader Animation • Macro Reply Generator   • ML Calibration  │
│  • Warm Escalation Banner  • Internal Notes Drawer                     │
│  • PeekRating Component    • Real-Time WebSocket                       │
│  • Local History Drawer                                                │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Screen 1: Hero Landing Page (`hero.js`)

#### Layout & Visual Elements
1. **Background Canvas**:
   * Interactive `GhostFibers` WebGL component configured for light theme (`lineColor="#CBD5E1"`, `glowColor="#93C5FD"`, smooth organic ribbon oscillations, subtle vignette).
2. **Top Navigation Bar (Liquid Glass + Rubber Segment)**:
   * Floating centered glass pill (`backdrop-filter: blur(20px)`).
   * Logo: Modern gradient aperture icon with text *"One Front Door"*.
   * Rubber Segment Nav links: *Overview*, *Departments*, *AI Engine*, *Docs*, *Portals*.
   * Hover physics: Elastic sliding highlight capsule that stretches on fast cursor transit and rebounds over target tab.
   * Actions: *Launch Chat* button (pill with subtle inner gleam) and *Role Switcher*.
3. **Hero Content**:
   * Badge: `✦ AI Triage · Sub-Agent Network · SLA Guarantee`
   * Headline: **One Front Door for Everything.**
   * Subtitle: *"Instant answers for IT, HR, Finance, and Facilities. Zero ticket bouncing, zero repeated explanations, guaranteed human handoff."*
4. **Hero Interactive Prompt Triage Bar**:
   * Interactive live search / triage input placed directly in the hero center.
   * Suggested chips:
     * 💻 *“My laptop won't turn on after update”*
     * 👥 *“How many PTO days can I carry over?”*
     * 💰 *“Submit expense over $500 without receipt”*
     * 🏢 *“Visitor building pass for client meeting”*
5. **Real-Time Operational Ticker**:
   * Live statistics: *4 Departments Active* · *92ms Average Triage* · *91.5% Direct Resolution* · *LLM Powered by Zenmux GLM-4.7*.

---

### Screen 2: Authentication & Role Selector (`login.js`)

#### Layout & Visual Elements
1. **Card Container**:
   * Central liquid-glass modal with refraction border and double specular highlight.
2. **Three-Tab Rubber Segment Switcher**:
   * `👤 Employee` · `🎧 Support Specialist` · `📊 Operations Manager`
3. **Persona Selection Cards (Light Glass)**:
   * **Employees**:
     * *Alex Chen* (Senior Staff Engineer · Engineering · Floor 4)
     * *Sarah Connor* (Product Marketing Lead · Marketing · Remote)
   * **Specialists**:
     * *Ryan Torres* (IT Support · Level 2 Specialist · Active Queue: 1)
     * *Priya Sharma* (HR People Partner · Level 1 Specialist)
     * *Marcus Vance* (Finance & Payroll · Level 3 Controller)
   * **Operations Leadership**:
     * *Dr. Lisa Park* (Global Service Operations Director)
4. **One-Click Instant Sign-In & Verification Simulator**:
   * Instant login with stored user session profile + optional 2FA / Identity verification prompt for sensitive actions.

---

### Screen 3: User Chat Interface (`chat.js`)
*Faithfully implementing the design patterns from Images 2, 3, and 4 in light theme.*

#### 1. Header & Live Status
* Left: Assistant identity pill with status dot (`Online · GLM-4.7-Flash + TF-IDF KB`).
* Center: Active ticket context (hidden until ticket is triggered, then expands with Image 4 layout: `IT-4821` | `High` | `Level 2` | `Reply target 2:40 PM` | `12 min left` + dynamic linear SLA bar).
* Right:
  * 📋 *My Tickets* button with active badge counter.
  * 🕘 *Chat History* drawer toggle.
  * 🔄 *New Session* button.

#### 2. Collapsible Reasoning & Routing Disclosure (Image 2)
* Before generating or escalating, assistant displays an interactive reasoning card:
  ```
  ┌─────────────────────────────────────────────────────────────┐
  │ ⓘ Reasoning (3 steps)                                    ▲  │
  ├─────────────────────────────────────────────────────────────┤
  │ 📦 Routed to @it Support Specialist                         │
  │ 🔍 Retrieved policy: "IT Hardware Policy §1.3 — Battery"    │
  │ ⚡ Confidence score: 88.4% (Threshold: 50.0%)               │
  │ [View details]                                              │
  └─────────────────────────────────────────────────────────────┘
  ```
* Expandable accordion reveals raw token logs, retrieved passage snippet, and routing probabilities.

#### 3. LatticeLoader Thinking Animation
* Replaces static three-dot loaders with the specified `LatticeLoader` component:
  * Config: 3x3 orbiting circular lattice grid, orbit animation, dynamic timer (`Thinking 1.2s...`).
  * State transitions:
    * `working` -> Pulsing orbit in primary brand tone.
    * `done` -> Green pop (`#22c55e`) with *"Done in 1.4s"*.
    * `error` -> Red alert (`#ef4444`) with *"Failed after 9.0s"*.

#### 4. Sub-Agent `@` Selector Menu (Images 2 & 3)
* Triggers when user types `@` or clicks the `@ agents` button in the input bar:
  * Popup card floating above input:
    * `@general` — *Master Triage, cross-department coordination & FAQs*
    * `@it` — *Hardware, VPN, WiFi, software licenses & system access*
    * `@hr` — *Benefits, PTO, leaves, onboarding & performance*
    * `@finance` — *Expense reports, corporate card, invoices & payroll*
    * `@facilities` — *Office desks, building badges, parking & AC*
    * `@human` — *Immediate live human handoff request*
* Keyboard navigable (Arrow Up/Down, Enter to select).

#### 5. Liquid Glass Input Dock (Image 2 & 3)
* Floating pill with refraction borders:
  * Left controls:
    * `+` Attachment button (screenshots, logs).
    * 🎙️ Voice dictation microphone button.
    * 🌐 `Search` KB toggle button.
    * `@ agents` Sub-agent picker shortcut.
    * `/ tools` Slash commands menu (`/status`, `/escalate`, `/ticket`, `/reset`).
  * Center: Auto-expanding textarea (`Ask anything or type @ to route...`).
  * Right: High-contrast obsidian pill submit button with spring rebound animation.

#### 6. Dynamic Suggested Prompt Chips (Below Input)
* Contextual prompt pills that update based on active department:
  * `What is the VPN setup guide?` · `Check PTO balance` · `Expense policy threshold` · `Replace my badge`

#### 7. Warm Human Handoff & Escalation Card (Image 4)
* When handoff occurs:
  1. System divider: `─── Ravi joined the chat ───`
  2. Agent Greeting: Specifying they already have the user's conversation and tested fixes.
  3. Escalation Notice Banner:
     ```
     ┌─────────────────────────────────────────────────────────────┐
     │ ↑ Moved up to Level 3                                       │
     │ This needs deeper network access than Level 2 has. Ravi's   │
     │ notes went with your ticket, so you won't repeat yourself.   │
     │ New reply target: within 30 min.                            │
     └─────────────────────────────────────────────────────────────┘
     ```
  4. Real-time typing indicator: `Ravi is typing...`
  5. Floating scroll-to-bottom action pill: `↓`

#### 8. PeekRating Post-Resolution Component
* Dispatched immediately upon ticket resolution or user confirmation:
  * Interactive 5-star rating with hover lift (`7px`), pop scale (`1.3x`), and dynamic feedback labels:
    * ★☆☆☆☆ (*Poor*)
    * ★★☆☆☆ (*Fair*)
    * ★★★☆☆ (*Good*)
    * ★★★★☆ (*Great*)
    * ★★★★★ (*Superb*)
  * Smooth celebratory micro-confetti on submit and instant backend CSAT sync.

#### 9. Persistent Ticket History Drawer
* Slide-out glass drawer on the right edge:
  * Filter tabs: *All*, *Active*, *Resolved*.
  * Ticket summary cards with SLA progress bars, short IDs (`#IT-4821`), timestamp, and one-click replay.

---

### Screen 4: Support Agent Workspace (`inbox.js`)
*Refactoring Image 1 into clean, high-contrast Light Theme Liquid Glass.*

#### Layout & Visual Elements
1. **Left Agent Cockpit Sidebar**:
   * Agent Avatar, Name, Department & Tier (`Ryan Torres · IT · L2`).
   * Availability Toggle: `🟢 Online` | `🟡 Busy` | `⚪ Offline`.
   * Real-time Performance Metrics:
     * **Active Tickets**: `1`
     * **Resolved Today**: `142`
     * **Avg Reply Time**: `4.2m`
     * **CSAT Score**: `4.6 ⭐` (Powered by PeekRating data)
     * **Quality Score Bar**: `88.5 / 100`
2. **Center Ticket Queue Column**:
   * Filter pills: *All*, 🔴 *Critical*, 🟠 *High*, 🔵 *Medium*, 🟢 *Low*.
   * Urgency Cards:
     * Circular radial SLA progress gauge with countdown (`1h 50m left`).
     * Department Badge (`IT`), Priority Pill (`High`), Status (`In Progress`).
     * Ticket title, preview snippet, customer name, and elapsed time (`#T1 · 1h ago`).
3. **Right Detail & Live Conversation Pane**:
   * Header: Customer profile badge, department, SLA countdown banner.
   * **AI Warm Handoff Summary Card**:
     * Auto-generated 3-bullet briefing created by LLM:
       * *User's core issue:* VPN disconnects every 30m on macOS.
       * *Attempted self-serve steps:* Rebooted router, reinstalled Cisco client.
       * *Recommended specialist action:* Reissue certificate via Okta console.
   * **Live Chat Stream**: Real-time Socket.IO sync between agent and user.
   * **Agent Response Acceleration Bar**:
     * One-click AI suggested reply pill (`"I've checked your Okta cert and refreshed it. Please reconnect."`).
     * Quick macro chips: `Request Logs`, `Escalate to L3`, `Mark Resolved`.
     * Private Internal Notes toggle (yellow tinted glass card visible only to agents).

---

### Screen 5: Operations & Manager Dashboard (`manager.js`)

#### Layout & Visual Elements
1. **Executive KPI Ribbon (4 Glass Cards)**:
   * **AI Deflection Rate**: `68.4%` (Resolved by LLM without agent intervention).
   * **Triage Routing Accuracy**: `91.5%` (Naive Bayes + TF-IDF validation).
   * **Mean Time to Resolution (MTTR)**: `18.2 min`.
   * **Net CSAT**: `4.7 / 5.0` (PeekRating aggregate).
2. **Interactive Department Volume Matrix**:
   * Real-time distribution across IT, HR, Finance, and Facilities.
3. **Live SLA Breach Radar**:
   * Active tickets approaching SLA breach with automatic one-click re-routing to available specialists.
4. **Machine Learning & Triage Inspection Panel**:
   * Review confidence distribution histograms.
   * "Misrouted Tickets" inspection table with one-click model feedback/re-labeling to retrain the classifier.

---

## 4. Component Specification & Integration Mapping

| Component | Target Location | Description & Animation Specs |
| :--- | :--- | :--- |
| **`GhostFibers`** | `frontend/components/GhostFibers.js` | WebGL canvas render: waving glowing fibers adapted for light canvas with subtle blue/slate illumination. |
| **`RubberSegment`** | `frontend/components/RubberSegment.js` | Elastic sliding nav indicator with spring physics (`cubic-bezier(0.34, 1.56, 0.64, 1)`). |
| **`LatticeLoader`** | `frontend/components/LatticeLoader.js` | 3x3 circular lattice orbit loader with timer counter, state machine (`working`, `done`, `error`), and smooth morphing. |
| **`PeekRating`** | `frontend/components/PeekRating.js` | 5-star resolution rating with hover lift (`7px`), magnify (`1.15`), pop scale (`1.3`), tooltips, and callback binding. |
| **`ReasoningDisclosure`** | `frontend/components/ReasoningDisclosure.js` | Collapsible step accordion showing AI routing path, retrieved KB citation, and confidence score. |
| **`SubAgentPicker`** | `frontend/components/SubAgentPicker.js` | `@` mention dropdown card with keyboard navigation and instant department filter binding. |
| **`WarmHandoffCard`** | `frontend/components/WarmHandoffCard.js` | Amber escalation card with dynamic reply targets, tier updates, and handoff reassurance copy. |
| **`SLACircularGauge`** | `frontend/components/SLACircularGauge.js` | SVG radial timer with color degradation (Green > Amber > Red) and pulsing critical alert state. |

---

## 5. Technical Implementation Steps for Antigravity

```
Phase 1: Light Theme & Liquid Glass Foundation
├── Create `frontend/styles/light-glass.css` with refraction, specular reflection, and light tokens.
└── Implement core UI components (`RubberSegment`, `LatticeLoader`, `PeekRating`, `GhostFibers`).

Phase 2: Hero Page & Navigation
├── Build `frontend/pages/hero.js` with interactive prompt triage bar and rubber navbar.
└── Link hero quick prompts directly into live chat session initialization.

Phase 3: Auth & Persona Switcher
└── Refactor `frontend/pages/login.js` into light liquid-glass modal with 3-tab rubber segment.

Phase 4: Next-Gen Live Chat Interface
├── Refactor `frontend/pages/chat.js` with Sub-Agent `@` menu, Reasoning step disclosure, and LatticeLoader.
├── Implement Warm Handoff & Escalation banners (Image 4 spec).
└── Integrate PeekRating upon ticket resolution and save full chat history in LocalStorage + REST.

Phase 5: Agent Cockpit & Manager Dashboard
├── Refactor `frontend/pages/inbox.js` into light theme with SLA radial gauges and AI brief cards.
└── Update `frontend/pages/manager.js` with light glass charts, SLA breach radar, and ML audit tools.

Phase 6: Verification & End-to-End Browser Testing
├── Test all flows via browser subagent.
└── Validate light mode contrast, responsiveness, and WebSocket synchronization.
```

---

## 6. Edge Cases & UX Safeguards

1. **Sub-Agent Context Switching**:
   * If a user is chatting with `@it` and suddenly mentions a salary question, the system displays a gentle transition: *"I noticed this is about payroll. Routing to @finance..."* without dropping prior context.
2. **Network Interruption / LLM Latency**:
   * `LatticeLoader` handles timeouts gracefully: if LLM takes > 9s, the loader transitions to local TF-IDF KB fallback without freezing the interface.
3. **Mobile & Viewport Responsiveness**:
   * Liquid glass panels collapse into single-column responsive views with bottom dock navigation on screens < 768px.
4. **Accessibility (WCAG 2.1 AA)**:
   * All light theme text elements maintain strict contrast (minimum 4.5:1 for body, 7:1 for headers).
   * All interactive elements include accessible `aria-label` tags and keyboard tab indices.
