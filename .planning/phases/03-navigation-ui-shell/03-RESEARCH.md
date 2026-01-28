# Phase 3: Navigation & UI Shell - Research

**Researched:** 2026-01-27
**Domain:** React routing, sidebar navigation, dark theme, RTL support
**Confidence:** HIGH

## Summary

This phase implements the application shell with sidebar navigation, dark theme, and RTL support for Hebrew content. The project already has React Router v7, Tailwind CSS v4, Zustand (with UI store), and Heroicons installed. The dark theme colors are defined in `globals.css` using `@theme`.

The recommended approach is to create a layout component (`AppShell`) that wraps all authenticated routes and contains the collapsible sidebar. React Router's `<Outlet />` pattern enables nested routing where the shell remains constant while page content changes. The existing `uiStore.ts` already has sidebar collapse state with localStorage persistence.

**Primary recommendation:** Build a custom sidebar using Heroicons and Tailwind CSS (no external component library needed). Use React Router's layout routes pattern with `<Outlet />`. Apply RTL using logical CSS properties (`ps-*`, `pe-*`, `ms-*`, `me-*`) and `dir` attribute on content containers.

## Standard Stack

The established libraries/tools for this domain:

### Core (Already Installed)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| react-router | ^7.13.0 | Routing, layout routes, NavLink | Installed |
| tailwindcss | ^4.1.18 | Styling, dark mode, logical properties | Installed |
| zustand | ^5.0.10 | UI state (sidebar collapse) | Installed |
| @heroicons/react | ^2.2.0 | Navigation icons | Installed |

### Supporting (No Additional Install Needed)
| Library | Purpose | Notes |
|---------|---------|-------|
| Tailwind CSS v4 logical properties | RTL support | Built-in (`ps-*`, `pe-*`, `ms-*`, `me-*`) |
| Zustand persist middleware | Sidebar state persistence | Already configured in uiStore.ts |

### Alternatives Considered
| Instead of | Could Use | Why NOT |
|------------|-----------|---------|
| Custom sidebar | Untitled UI sidebar | Requires additional dependencies (react-aria-components), project already has Heroicons |
| Custom sidebar | shadcn/ui sidebar | Requires Radix UI dependencies, overkill for this use case |
| NavLink | Custom active detection | NavLink provides built-in `isActive` state, accessibility attributes |

**Installation:** No new packages required. All dependencies are already installed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx         # Main layout with sidebar + content area
│   │   ├── Sidebar.tsx          # Collapsible sidebar component
│   │   ├── SidebarNavItem.tsx   # Individual nav item with NavLink
│   │   └── PageHeader.tsx       # Optional page header component
│   └── ui/
│       └── ... (existing)
├── pages/
│   ├── DashboardPage.tsx        # Update to work within AppShell
│   ├── BankMovementsPage.tsx    # Placeholder page
│   ├── InvoicesPage.tsx         # Placeholder page
│   ├── CreditCardPage.tsx       # Placeholder page
│   └── SettingsPage.tsx         # Placeholder page
├── stores/
│   └── uiStore.ts               # Already has sidebarCollapsed state
└── styles/
    └── globals.css              # Already has @theme with dark colors
```

### Pattern 1: Layout Routes with Outlet
**What:** Parent route element wraps child routes, renders them via `<Outlet />`
**When to use:** Shared UI elements (sidebar, header) across multiple pages
**Example:**
```tsx
// Source: https://reactrouter.com/start/declarative/routing
// App.tsx
import { Outlet } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        {/* Protected routes with AppShell layout */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="bank-movements" element={<BankMovementsPage />} />
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="credit-card" element={<CreditCardPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
```

### Pattern 2: NavLink with Active State Styling
**What:** NavLink provides `isActive` boolean for styling active navigation items
**When to use:** Sidebar/navigation items that need visual indication of current page
**Example:**
```tsx
// Source: https://reactrouter.com/api/components/NavLink
import { NavLink } from 'react-router'
import { HomeIcon } from '@heroicons/react/24/outline'

function SidebarNavItem({ to, icon: Icon, label, collapsed }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-text-muted hover:bg-surface hover:text-text'
        }`
      }
    >
      <Icon className="h-5 w-5 flex-shrink-0" />
      {!collapsed && <span>{label}</span>}
    </NavLink>
  )
}
```

### Pattern 3: Collapsible Sidebar with Zustand
**What:** Sidebar width controlled by Zustand state, persisted to localStorage
**When to use:** User preference for sidebar state should persist across sessions
**Example:**
```tsx
// Source: Already implemented in src/stores/uiStore.ts
import { useUIStore } from '@/stores/uiStore'

function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore()

  return (
    <aside
      className={`fixed inset-y-0 start-0 z-40 flex flex-col bg-surface border-e border-surface transition-all duration-300 ${
        sidebarCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Sidebar content */}
    </aside>
  )
}
```

### Pattern 4: Dark Theme with Class Strategy
**What:** Add `@custom-variant dark` to enable class-based dark mode toggling
**When to use:** When users should be able to toggle dark/light mode manually
**Example:**
```css
/* Source: https://tailwindcss.com/docs/dark-mode */
/* globals.css */
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --color-primary: #10b981;
  --color-primary-dark: #059669;
  --color-background: #0f172a;
  --color-surface: #1e293b;
  --color-text: #f8fafc;
  --color-text-muted: #94a3b8;
}
```

### Pattern 5: RTL with Logical Properties
**What:** Use `start`/`end` properties instead of `left`/`right` for RTL support
**When to use:** Any spacing, positioning, or alignment that should flip in RTL
**Example:**
```tsx
// Source: https://tailwindcss.com/docs/padding
// Use ps-* (padding-start) instead of pl-* (padding-left)
// Use pe-* (padding-end) instead of pr-* (padding-right)
// Use ms-* (margin-start) instead of ml-*
// Use me-* (margin-end) instead of mr-*

<div className="ps-4 pe-2 border-s-2 text-start">
  {/* This content will flip correctly in RTL */}
</div>

// For Hebrew content specifically:
<div dir="rtl" className="text-right">
  {/* Hebrew text renders right-to-left */}
</div>
```

### Anti-Patterns to Avoid
- **Hardcoded left/right:** Use `start`/`end` logical properties for RTL compatibility
- **Inline theme detection:** Don't check dark mode in every component; let Tailwind handle it via CSS
- **Multiple sidebar state sources:** Use only Zustand store, not component-local state
- **Nested BrowserRouter:** Never nest routers; one BrowserRouter at app root only

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Active link detection | Custom `useLocation` comparison | `NavLink` with `isActive` | NavLink handles exact matching, accessibility attributes |
| State persistence | Manual localStorage read/write | Zustand `persist` middleware | Already configured, handles hydration edge cases |
| Icon library | SVG imports, custom icon component | `@heroicons/react/24/outline` | 316 consistent icons, tree-shakes unused |
| Dark mode toggle | Manual class manipulation | Tailwind + Zustand + `@custom-variant` | CSS handles specificity, Zustand handles persistence |
| RTL spacing | Conditional `pl`/`pr` based on direction | Logical properties `ps`/`pe` | Browser handles direction automatically |

**Key insight:** The existing tech stack (React Router, Tailwind v4, Zustand, Heroicons) provides everything needed. No additional UI component library required for this phase.

## Common Pitfalls

### Pitfall 1: Flash of Wrong Theme (FOUWT)
**What goes wrong:** Page loads with light theme, then flashes to dark after hydration
**Why it happens:** React hydrates after DOM paint, theme class not applied early enough
**How to avoid:** Add inline script in `index.html` `<head>` to set theme class before paint
**Warning signs:** Brief white flash on page load in dark mode
```html
<!-- Add to index.html <head> before any stylesheets -->
<script>
  const theme = localStorage.getItem('vat-manager-ui');
  if (theme) {
    const parsed = JSON.parse(theme);
    if (parsed.state?.theme === 'dark') {
      document.documentElement.classList.add('dark');
    }
  }
</script>
```

### Pitfall 2: Sidebar State Flicker on SSR/Hydration
**What goes wrong:** Sidebar shows expanded, then collapses after Zustand hydrates
**Why it happens:** Zustand persist loads from localStorage asynchronously
**How to avoid:** Use CSS to hide sidebar until hydration completes, or accept minor flicker
**Warning signs:** Visible sidebar width change on page load
**Note:** For this Vite SPA (no SSR), this is minimal. If visible, use `onRehydrateStorage` callback.

### Pitfall 3: NavLink Active State on Index Route
**What goes wrong:** Dashboard link stays active on all pages
**Why it happens:** Index route (`/`) matches as prefix of all routes
**How to avoid:** Use `end` prop on NavLink for index route
```tsx
<NavLink to="/" end className={...}>Dashboard</NavLink>
```
**Warning signs:** Multiple nav items appear active simultaneously

### Pitfall 4: Forgetting `dir` Attribute for Hebrew Content
**What goes wrong:** Hebrew text displays but punctuation/numbers misaligned
**Why it happens:** Browser needs explicit `dir="rtl"` for proper bidirectional text
**How to avoid:** Wrap Hebrew content in element with `dir="rtl"`, use `dir="auto"` for dynamic content
**Warning signs:** Periods appear at wrong end of Hebrew sentences, numbers misplaced

### Pitfall 5: Physical Properties Breaking RTL
**What goes wrong:** Sidebar appears on wrong side in RTL, spacing asymmetric
**Why it happens:** Using `left`, `right`, `ml`, `mr`, `pl`, `pr` instead of logical equivalents
**How to avoid:** Use `start`, `end`, `ms`, `me`, `ps`, `pe` consistently
**Warning signs:** Layout doesn't mirror when testing with `dir="rtl"`

### Pitfall 6: Z-Index Conflicts with Sidebar
**What goes wrong:** Modals/dropdowns appear behind sidebar
**Why it happens:** Sidebar has high z-index but modals not accounted for
**How to avoid:** Establish z-index scale: sidebar (z-40), modals (z-50), toasts (z-60)
**Warning signs:** Click on dropdown but it's hidden behind sidebar

## Code Examples

Verified patterns for this phase:

### AppShell Layout Component
```tsx
// src/components/layout/AppShell.tsx
import { Outlet } from 'react-router'
import { Sidebar } from './Sidebar'
import { useUIStore } from '@/stores/uiStore'

export function AppShell() {
  const { sidebarCollapsed } = useUIStore()

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main
        className={`transition-all duration-300 ${
          sidebarCollapsed ? 'ps-16' : 'ps-64'
        }`}
      >
        <Outlet />
      </main>
    </div>
  )
}
```

### Sidebar Component with Navigation
```tsx
// src/components/layout/Sidebar.tsx
import { NavLink } from 'react-router'
import {
  HomeIcon,
  BanknotesIcon,
  DocumentTextIcon,
  CreditCardIcon,
  Cog6ToothIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline'
import { useUIStore } from '@/stores/uiStore'

const navItems = [
  { to: '/', icon: HomeIcon, label: 'Dashboard' },
  { to: '/bank-movements', icon: BanknotesIcon, label: 'Bank Movements' },
  { to: '/invoices', icon: DocumentTextIcon, label: 'Invoices & Receipts' },
  { to: '/credit-card', icon: CreditCardIcon, label: 'Credit Card' },
  { to: '/settings', icon: Cog6ToothIcon, label: 'Settings' },
]

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore()

  return (
    <aside
      className={`fixed inset-y-0 start-0 z-40 flex flex-col bg-surface border-e border-text-muted/20 transition-all duration-300 ${
        sidebarCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Logo/Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-text-muted/20">
        {!sidebarCollapsed && (
          <span className="text-lg font-semibold text-primary">VAT Manager</span>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-lg text-text-muted hover:bg-background hover:text-text transition-colors"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? (
            <ChevronRightIcon className="h-5 w-5" />
          ) : (
            <ChevronLeftIcon className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-muted hover:bg-background hover:text-text'
              } ${sidebarCollapsed ? 'justify-center' : ''}`
            }
            title={sidebarCollapsed ? item.label : undefined}
          >
            <item.icon className="h-5 w-5 flex-shrink-0" />
            {!sidebarCollapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
```

### Updated App.tsx with Layout Routes
```tsx
// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/pages/LoginPage'
import { SignupPage } from '@/pages/SignupPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { BankMovementsPage } from '@/pages/BankMovementsPage'
import { InvoicesPage } from '@/pages/InvoicesPage'
import { CreditCardPage } from '@/pages/CreditCardPage'
import { SettingsPage } from '@/pages/SettingsPage'

function App() {
  return (
    <div className="min-h-screen bg-background text-text">
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="bank-movements" element={<BankMovementsPage />} />
              <Route path="invoices" element={<InvoicesPage />} />
              <Route path="credit-card" element={<CreditCardPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  )
}

export default App
```

### Placeholder Page Template
```tsx
// src/pages/BankMovementsPage.tsx (example)
export function BankMovementsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-text mb-4">Bank Movements</h1>
      <div className="bg-surface rounded-lg p-6">
        <p className="text-text-secondary">
          Bank movements will be displayed here.
        </p>
      </div>
    </div>
  )
}
```

### RTL Content Container
```tsx
// For Hebrew document content
function HebrewContent({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" className="text-right">
      {children}
    </div>
  )
}

// For mixed content where direction is unknown
function AutoDirectionContent({ children }: { children: React.ReactNode }) {
  return (
    <div dir="auto">
      {children}
    </div>
  )
}
```

### Theme Script for index.html
```html
<!-- Add to index.html inside <head>, before stylesheets -->
<script>
  (function() {
    try {
      const stored = localStorage.getItem('vat-manager-ui');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.state && parsed.state.theme === 'dark') {
          document.documentElement.classList.add('dark');
        }
      } else {
        // Default to dark theme if no preference stored
        document.documentElement.classList.add('dark');
      }
    } catch (e) {
      // Default to dark on error
      document.documentElement.classList.add('dark');
    }
  })();
</script>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `activeClassName` prop | `className` function with `isActive` | React Router v6 (2021) | Must use function syntax for active styling |
| `tailwind.config.js` darkMode | `@custom-variant dark` in CSS | Tailwind v4 (2024) | CSS-first configuration |
| `ml-*`, `mr-*` for spacing | `ms-*`, `me-*` logical properties | Tailwind v3.3+ (2023) | Automatic RTL support |
| External RTL plugins | Built-in logical properties | Tailwind v3.3+ | No plugin needed for RTL |

**Deprecated/outdated:**
- `activeClassName` and `activeStyle` props removed in React Router v6
- `tailwind.config.js` `darkMode: 'class'` replaced by `@custom-variant` in v4
- `tailwindcss-rtl` plugin unnecessary with native logical properties

## Open Questions

Things that couldn't be fully resolved:

1. **Untitled UI Component Integration**
   - What we know: Requirement UI-02 mentions "Untitled UI components (slim sidebar, date picker, file uploader, tables)"
   - What's unclear: Whether to install full Untitled UI or build custom components
   - Recommendation: For Phase 3, build custom sidebar with existing stack. Evaluate Untitled UI for Phase 4+ when date picker/file uploader/tables are needed. Current sidebar requirement is simple enough that adding react-aria-components dependency is unnecessary.

2. **Light Theme Colors**
   - What we know: Dark theme colors defined in `@theme`, requirement is "dark theme with green accent"
   - What's unclear: Whether light theme variant is needed or if app is dark-only
   - Recommendation: Implement dark-only for v1 per requirements. If light theme needed later, add light mode colors to `@theme` and toggle `dark` class.

3. **RTL Scope**
   - What we know: UI-03 specifies "Hebrew/RTL support for document content"
   - What's unclear: Whether entire UI should be RTL or only document content areas
   - Recommendation: Keep app shell LTR (sidebar on left, standard layout). Apply `dir="rtl"` only to Hebrew document content containers. This is common for apps serving Hebrew-speaking users who still expect standard app layouts.

## Sources

### Primary (HIGH confidence)
- React Router official docs - Layout routes, NavLink, Outlet: https://reactrouter.com/start/declarative/routing
- Tailwind CSS v4 docs - Dark mode, logical properties: https://tailwindcss.com/docs/dark-mode, https://tailwindcss.com/docs/padding
- Existing codebase - `uiStore.ts`, `globals.css`, `App.tsx`

### Secondary (MEDIUM confidence)
- Robin Wieruch React Router tutorials: https://www.robinwieruch.de/react-router-nested-routes/
- W3C Structural markup for RTL: https://www.w3.org/International/questions/qa-html-dir
- DEV Community RTL best practices: https://dev.to/neers/best-practices-to-implement-rtl-in-react-js-1ckg

### Tertiary (LOW confidence)
- Untitled UI React components: https://www.untitledui.com/react/components/sidebar-navigations (not verified with actual installation)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed and verified
- Architecture patterns: HIGH - React Router official documentation, verified patterns
- Pitfalls: HIGH - Well-documented issues with established solutions
- RTL support: MEDIUM - Standard web practices, but scope unclear from requirements
- Untitled UI: LOW - Not installed, may be needed for future phases

**Research date:** 2026-01-27
**Valid until:** 60 days (stable libraries, no major releases expected)
