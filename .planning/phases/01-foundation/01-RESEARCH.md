# Phase 1: Foundation - Research

**Researched:** 2026-01-27
**Domain:** React + Vite + TypeScript + Supabase Infrastructure
**Confidence:** HIGH

## Summary

This research covers the technical foundation for a VAT Declaration Manager application. The phase establishes project infrastructure with Vite + React 19 + TypeScript, connects to an existing Supabase project (gkagkwpqozymjvehzucy), creates the database schema with RLS policies, and implements audit logging for financial data compliance.

**Key findings:**
- Vite 6.x with React 19.1 and TypeScript 5.8 is the current standard (verified against Untitled UI requirements)
- Supabase project exists but has NO tables created yet - schema must be built from scratch
- Two audit options: `supa_audit` for row-level change tracking (recommended for financial data) and `pgaudit` for session/query logging
- Currency must use PostgreSQL `NUMERIC` type with integer storage (agorot) to avoid floating-point errors
- TanStack Query v5 + Zustand v5 is the 2026 standard for React state management

**Primary recommendation:** Create Vite project using `npm create vite@latest`, configure Supabase client with environment variables, design schema with NUMERIC currency types and supa_audit enabled on all financial tables, enable RLS on every table immediately.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vite | ^6.x | Build tool & dev server | Industry standard for React, near-instant HMR, Rollup-based production builds |
| React | ^19.1 | UI framework | Required by Untitled UI, latest stable with compiler optimizations |
| TypeScript | ^5.8 | Type safety | Required by Untitled UI, strict mode for Zod compatibility |
| @supabase/supabase-js | ^2.x | Supabase client | Official SDK, TypeScript support, works with React hooks |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tanstack/react-query | ^5.x | Server state management | All Supabase queries, caching, mutations |
| zustand | ^5.x | Client state | UI state only (sidebar, theme) - NOT for server data |
| Tailwind CSS | ^4.1 | Utility CSS | Required by Untitled UI, CSS-based config in v4 |
| @untitledui/icons | latest | Icons | Thin outline style per project requirements |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vite | Next.js | Next.js adds SSR complexity not needed with Supabase as backend |
| TanStack Query | SWR | TanStack has better devtools, mutations, infinite queries |
| Zustand | Redux Toolkit | Overkill - RTK adds boilerplate TQ+Zustand eliminate |
| supa_audit | pgaudit only | supa_audit captures row-level before/after values, better for financial compliance |

**Installation:**
```bash
# Create project
npm create vite@latest vat-manager -- --template react-ts
cd vat-manager

# Core dependencies
npm install react@^19 react-dom@^19
npm install @supabase/supabase-js
npm install @tanstack/react-query
npm install zustand

# Styling (Tailwind v4)
npm install tailwindcss @tailwindcss/vite

# Dev dependencies
npm install -D typescript @types/react @types/react-dom
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
npm install -D eslint @eslint/js typescript-eslint
npm install -D prettier eslint-config-prettier
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   ├── supabase.ts         # Supabase client instance
│   └── queryClient.ts      # TanStack Query client
├── features/               # Feature-based organization
│   ├── auth/
│   ├── dashboard/
│   ├── documents/
│   └── settings/
├── shared/
│   ├── components/
│   │   └── ui/            # Untitled UI components (copy-paste)
│   ├── hooks/
│   └── utils/
├── styles/
│   ├── globals.css        # Tailwind imports + custom styles
│   └── theme.css          # Untitled UI design tokens
├── App.tsx
└── main.tsx
```

### Pattern 1: Supabase Client Singleton

**What:** Create a single Supabase client instance, export for use across app
**When to use:** Always - prevents multiple client instances
**Example:**
```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

### Pattern 2: TanStack Query Provider Setup

**What:** Wrap app with QueryClientProvider for server state management
**When to use:** At app root, before any data fetching
**Example:**
```typescript
// src/lib/queryClient.ts
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 seconds
      retry: 1,
    },
  },
})

// src/main.tsx
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
)
```

### Pattern 3: Environment Variables with Vite

**What:** Use VITE_ prefix for client-exposed variables
**When to use:** All Supabase configuration
**Example:**
```env
# .env.local (never commit)
VITE_SUPABASE_URL=https://gkagkwpqozymjvehzucy.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Access via `import.meta.env.VITE_SUPABASE_URL`

### Pattern 4: Currency as Integer (Agorot)

**What:** Store all currency values in smallest unit as integers
**When to use:** All financial amounts - invoices, transactions, VAT
**Example:**
```sql
-- PostgreSQL schema
amount_agorot NUMERIC(12, 0) NOT NULL  -- Store 12.34 ILS as 1234

-- TypeScript conversion
const amountILS = amountAgorot / 100
const amountAgorot = Math.round(amountILS * 100)
```

### Anti-Patterns to Avoid

- **Using FLOAT/DOUBLE for currency:** Causes rounding errors (0.1 + 0.2 = 0.30000000000000004)
- **Forgetting RLS:** Tables without RLS are publicly accessible via anon key
- **Service key in client code:** Never expose service_role key - it bypasses RLS
- **Storing server state in Zustand:** Use TanStack Query for Supabase data
- **Multiple Supabase client instances:** Use singleton pattern

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Server state caching | Custom useState + fetch | TanStack Query | Handles caching, deduplication, background refetch |
| Form state | useState per field | React Hook Form (later phase) | Minimal re-renders, validation integration |
| Currency formatting | string manipulation | Intl.NumberFormat | Handles locales, RTL, edge cases |
| Date handling | Date arithmetic | date-fns (later phase) | Timezone-safe, tree-shakeable |
| Audit logging | Custom triggers | supa_audit extension | Tested, performant, stable record_id |

**Key insight:** Financial applications require battle-tested solutions. Hand-rolled currency handling, audit logging, or state management will accumulate bugs that are discovered at VAT filing time.

## Common Pitfalls

### Pitfall 1: Floating-Point Currency Errors

**What goes wrong:** Using JavaScript numbers or PostgreSQL FLOAT for currency causes silent rounding errors
**Why it happens:** IEEE 754 binary floating-point cannot precisely represent base-10 decimals
**How to avoid:**
- Store as NUMERIC(12,0) in PostgreSQL (integers representing agorot)
- Convert to display value only at render time
- Use Math.round() when converting from user input
**Warning signs:** Transaction totals differ by fractions of a shekel from expected

### Pitfall 2: RLS Not Enabled

**What goes wrong:** Tables without RLS are publicly accessible to anyone with the anon key
**Why it happens:** RLS is disabled by default on SQL-created tables
**How to avoid:**
- Enable RLS immediately after creating each table
- Use `ALTER TABLE xxx ENABLE ROW LEVEL SECURITY;`
- Create at least one policy per table before storing data
**Warning signs:** Users report seeing unfamiliar data

### Pitfall 3: Missing Audit Trail

**What goes wrong:** No history of changes to financial data; cannot prove data integrity
**Why it happens:** Developers update records in place without versioning
**How to avoid:**
- Enable supa_audit on all financial tables immediately
- `SELECT audit.enable_tracking('public.invoices'::regclass);`
- Never allow direct UPDATE on financial records without audit
**Warning signs:** Cannot answer "what was this amount last week?"

### Pitfall 4: Supabase Environment Variables Missing

**What goes wrong:** App crashes at runtime with undefined URL/key
**Why it happens:** Forgot to create .env.local or wrong variable names
**How to avoid:**
- Validate env vars at client creation (throw early)
- Use VITE_ prefix for all client-exposed variables
- Add .env.example to repo with placeholder values
**Warning signs:** "supabaseUrl is required" error in console

### Pitfall 5: Incorrect RLS Policy Performance

**What goes wrong:** Queries become slow as data grows
**Why it happens:** RLS policies with joins or functions called per-row
**How to avoid:**
- Wrap `auth.uid()` in select: `(select auth.uid())`
- Add indexes on columns used in policies
- Use `TO authenticated` to skip policy for anon
**Warning signs:** Query time increases non-linearly with table size

## Code Examples

Verified patterns from official sources:

### Database Schema with Currency and Audit

```sql
-- Source: Supabase docs + supa_audit GitHub
-- Enable audit extension first
CREATE EXTENSION IF NOT EXISTS supa_audit CASCADE;

-- User settings table
CREATE TABLE user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  matching_trigger TEXT DEFAULT 'after_upload',
  auto_approval_threshold INTEGER DEFAULT 80,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- Files/documents table
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  storage_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  original_name TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  extracted_data JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- Bank transactions table
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  date DATE NOT NULL,
  value_date DATE,
  description TEXT NOT NULL,
  reference TEXT,
  amount_agorot NUMERIC(12, 0) NOT NULL,  -- Currency as integer
  balance_agorot NUMERIC(12, 0),
  is_credit BOOLEAN NOT NULL DEFAULT false,
  channel TEXT,
  source_file_id UUID REFERENCES files,
  hash TEXT,  -- For duplicate detection
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Invoices table
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  file_id UUID REFERENCES files,
  vendor_name TEXT,
  invoice_number TEXT,
  invoice_date DATE,
  due_date DATE,
  total_amount_agorot NUMERIC(12, 0),  -- Currency as integer
  vat_amount_agorot NUMERIC(12, 0),
  currency TEXT DEFAULT 'ILS',
  confidence_score INTEGER,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Invoice line items
CREATE TABLE invoice_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices ON DELETE CASCADE,
  description TEXT,
  quantity NUMERIC(10, 2),
  unit_price_agorot NUMERIC(12, 0),
  total_agorot NUMERIC(12, 0),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Credit cards table
CREATE TABLE credit_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  card_last_four TEXT NOT NULL,
  card_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_cards ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (team-shared access for now)
CREATE POLICY "Authenticated users full access" ON user_settings
  FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated users full access" ON files
  FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated users full access" ON transactions
  FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated users full access" ON invoices
  FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated users full access" ON invoice_rows
  FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated users full access" ON credit_cards
  FOR ALL TO authenticated USING (true);

-- Enable audit logging on financial tables
SELECT audit.enable_tracking('public.transactions'::regclass);
SELECT audit.enable_tracking('public.invoices'::regclass);
SELECT audit.enable_tracking('public.invoice_rows'::regclass);
```

### Supabase Client Setup

```typescript
// src/lib/supabase.ts
// Source: Supabase React Quickstart
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error('VITE_SUPABASE_URL is required')
}
if (!supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_ANON_KEY is required')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

### TanStack Query Setup

```typescript
// src/lib/queryClient.ts
// Source: TanStack Query docs
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
```

### Vite Configuration with Tailwind v4

```typescript
// vite.config.ts
// Source: Vite docs + Tailwind v4 docs
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

### TypeScript Configuration

```json
// tsconfig.json (excerpt)
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Create React App | Vite | 2023 | CRA deprecated, Vite is standard |
| Tailwind config in JS | Tailwind v4 CSS-based config | 2025 | Config now in `@theme` blocks in CSS |
| Redux for all state | TanStack Query + Zustand | 2024 | 80% less boilerplate, clearer separation |
| pgaudit only | supa_audit + pgaudit | 2024 | Row-level change tracking with before/after |
| ESLint .eslintrc | ESLint flat config | 2024 | eslint.config.js is now standard |

**Deprecated/outdated:**
- Create React App: Deprecated, no longer maintained
- .eslintrc.js: Use flat config (eslint.config.js) instead
- Tailwind v3 JS config: Use v4 CSS-based configuration
- @supabase/auth-helpers-react: Superseded by @supabase/ssr for SSR frameworks

## Open Questions

Things that couldn't be fully resolved:

1. **Untitled UI Vite Starter Kit Details**
   - What we know: CLI supports `--vite` flag for initialization
   - What's unclear: Exact files generated, whether it includes React Router
   - Recommendation: Use CLI and verify output, or manually install components

2. **supa_audit Performance at Scale**
   - What we know: Supabase recommends avoiding on tables >3,000 ops/second
   - What's unclear: Expected volume for this VAT app
   - Recommendation: Enable on financial tables; monitor performance; can disable on high-volume tables if needed

3. **Database Already Created vs Empty**
   - What we know: Context mentioned existing tables, but SQL queries show empty database
   - What's unclear: Whether tables need migration or fresh creation
   - Recommendation: Assume fresh creation; schema provided above creates all needed tables

## Sources

### Primary (HIGH confidence)
- [Vite Getting Started](https://vite.dev/guide/) - Project setup, Tailwind integration
- [Supabase React Quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/reactjs) - Client setup, env vars
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) - RLS policies, performance
- [supa_audit GitHub](https://github.com/supabase/supa_audit) - Row-level audit logging
- [PGAudit Extension](https://supabase.com/docs/guides/database/extensions/pgaudit) - Session/query logging
- [Untitled UI Installation](https://www.untitledui.com/react/docs/installation) - React 19.1, Tailwind v4.1, TypeScript 5.8 requirements
- [TanStack Query Docs](https://tanstack.com/query/latest) - Query client setup

### Secondary (MEDIUM confidence)
- [Complete Guide to Setting Up React with TypeScript and Vite (2026)](https://medium.com/@robinviktorsson/complete-guide-to-setting-up-react-with-typescript-and-vite-2025-468f6556aaf2) - Project structure
- [How to Get Started with Zustand V5](https://jsdev.space/howto/zustand5-react/) - State management patterns
- [State Management in React 2026](https://www.c-sharpcorner.com/article/state-management-in-react-2026-best-practices-tools-real-world-patterns/) - TanStack Query + Zustand pattern
- [Supabase Best Practices](https://www.leanware.co/insights/supabase-best-practices) - Security, audit logging

### Tertiary (LOW confidence)
- Context mentioned existing tables with RLS enabled - SQL queries show empty database; may need verification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Verified against official docs and Untitled UI requirements
- Architecture: HIGH - Feature-based structure is industry standard
- Database schema: HIGH - Based on project requirements + Supabase patterns
- Audit logging: HIGH - Official supa_audit extension docs
- Pitfalls: HIGH - Documented in Supabase RLS docs and prior research

**Research date:** 2026-01-27
**Valid until:** 2026-02-27 (30 days - stable technologies)
