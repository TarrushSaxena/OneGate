# One Front Door for Everything — UI/UX Design & Build Plan
### Light mode, liquid glass design system and architecture.

This document guides all frontend implementation in OneGate.

## Core Rules & Visual Language
1. **Liquid Glass Aesthetic**:
   - Stacked Blur (`backdrop-filter: blur(16px)`), Refraction (subtle edge warp/border gradient), and Reflection (soft diagonal highlight gradient sweep).
   - Soft lavender-to-white ambient wash background (`var(--surface-canvas)`).
   - Maximum 3-4 concurrent blurred layers per viewport to preserve 60fps rendering.
   - Light mode only; dark mode is strictly out of scope.
2. **Component Placements**:
   - `GhostFibers`: Hero landing page background only (dpr=1).
   - `LatticeLoader`: Ambient ongoing operations (AI thinking, route transitions, button in-flight, navbar sync).
   - `PeekRating`: Post-resolution rating only (State 7).
   - `RubberSegment`: Pill tabs and filter toggles.
3. **Information Architecture**:
   - Chat: Single continuous thread, labeled senders, collapsible reasoning trace (`Routed to IT Support · checked 2 policy sources`), inline citation chips (`📎 Source: IT Policy §3.1`), sticky context header, timeline event cards.
   - Agent Portal: Left sidebar with profile/presence/stats/performance, main queue sorted by SLA with circular countdown timer, right panel ticket conversation with warm handoff summary & agent assist suggestions.
   - Zero debug/dev chrome in production UI.
