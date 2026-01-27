---
phase: 03-navigation-ui-shell
plan: 01
subsystem: ui
tags: [tailwind-v4, dark-theme, zustand, heroicons, react-router, rtl]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: Tailwind v4 theme configuration, Zustand persist middleware
provides:
  - AppShell layout wrapper component
  - Collapsible Sidebar with navigation
  - Dark theme FOUC prevention
  - RTL-ready CSS layout
affects: [03-02, all-pages]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - FOUC prevention via inline script in index.html head
    - Logical CSS properties (start/end, ps/pe) for RTL support
    - Zustand selector pattern for performance

key-files:
  created:
    - src/components/layout/AppShell.tsx
    - src/components/layout/Sidebar.tsx
  modified:
    - index.html
    - src/styles/globals.css
    - src/index.css

key-decisions:
  - "FOUC prevention inline script reads Zustand persist format (state wrapper)"
  - "RTL-ready from start using logical CSS properties"
  - "Icons swap direction in RTL (ChevronLeft expands, ChevronRight collapses)"

patterns-established:
  - "Layout components in src/components/layout/"
  - "NavLink with end prop on index routes to prevent always-active"
  - "Sidebar state via useUIStore selector for minimal re-renders"

# Metrics
duration: 2min
completed: 2026-01-27
---

# Phase 3 Plan 01: App Shell & Dark Theme Summary

**Dark theme with FOUC prevention and collapsible sidebar navigation using Heroicons outline style and RTL-ready logical CSS properties**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-27T18:13:23Z
- **Completed:** 2026-01-27T18:15:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Dark theme applies instantly on page load (no white flash)
- Inline script in index.html head reads Zustand persist localStorage format
- AppShell component with responsive sidebar padding
- Sidebar with 5 navigation items using Heroicons outline icons
- Sidebar collapse/expand persists across browser refresh via Zustand
- All CSS uses logical properties (ps-*, start, end) for RTL support

## Task Commits

Each task was committed atomically:

1. **Task 1: Configure dark theme with FOUC prevention** - `26c7958` (feat)
2. **Task 2: Create AppShell and Sidebar components** - `6df657f` (feat)

## Files Created/Modified
- `index.html` - Added FOUC prevention script, updated lang/dir/title
- `src/styles/globals.css` - Added @custom-variant dark, new colors, base styles
- `src/index.css` - Cleaned up Vite defaults (now empty placeholder)
- `src/components/layout/AppShell.tsx` - Layout wrapper with sidebar and Outlet
- `src/components/layout/Sidebar.tsx` - Collapsible navigation with 5 items

## Decisions Made
- FOUC prevention script reads Zustand persist format (`{state: {theme}}` wrapper)
- HTML element gets `lang="he" dir="rtl"` for Hebrew support from the start
- Chevron icons swap direction semantically (left=expand in RTL, right=collapse)
- Dashboard NavLink uses `end` prop to only match exact "/" route

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- AppShell and Sidebar ready for integration with routing (03-02)
- Navigation items point to routes not yet created (will be wired in 03-02)
- Header component still needed (defined in 03-02)

---
*Phase: 03-navigation-ui-shell*
*Completed: 2026-01-27*
