# Technology Stack

**Project:** VAT Declaration Management Web App
**Researched:** 2026-01-27
**Overall Confidence:** HIGH

---

## Executive Summary

This stack recommendation is optimized for a VAT/invoice management application with AI-powered document processing, team-based access, and Hebrew/RTL support. The choices prioritize:

1. **Production readiness** - Battle-tested libraries with active maintenance
2. **Developer experience** - TypeScript-first with excellent tooling
3. **Cost efficiency** - Leverage Supabase free tier where possible, Gemini 3 Flash for affordable AI
4. **Accessibility** - Untitled UI's React Aria foundation ensures compliance

---

## Recommended Stack

### Build & Runtime

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Vite** | ^6.x | Build tool & dev server | Industry standard for React in 2025+. Near-instant HMR, native ES modules in dev, Rollup-based production builds. CRA is deprecated. | HIGH |
| **React** | ^19.x | UI framework | Untitled UI React requires React 19.1+. Server components ready for future migration. | HIGH |
| **TypeScript** | ^5.8 | Type safety | Untitled UI built with TS 5.8. Zod requires strict mode. Essential for production apps. | HIGH |

### UI & Styling

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Untitled UI React** | Latest (July 2025+) | Component library | 5,000+ components, MIT licensed, built on React Aria for accessibility, native dark mode via CSS variables. Copy-paste model = no vendor lock-in. Green accent customization via design tokens. | HIGH |
| **Tailwind CSS** | ^4.1 | Utility CSS | Required by Untitled UI. v4 moves config to CSS, better dark mode support via `@variant dark`. RTL support via logical properties (`ms-*`, `me-*`). | HIGH |
| **Heroicons** | ^2.x | Icons | Thin outline style, from Tailwind Labs, integrates seamlessly. Per user preference: no emojis. | HIGH |

### Backend & Database

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Supabase** | Latest | BaaS (Auth + PostgreSQL + Storage) | Auth with team/org support, RLS for row-level security, built-in file storage for documents. Real-time subscriptions for collaborative features. | HIGH |
| **@supabase/supabase-js** | ^2.x | Supabase client | Official SDK, TypeScript support, works with React hooks patterns. | HIGH |
| **PostgreSQL** | 15+ (via Supabase) | Database | Supabase managed. Use RLS policies for team-based access control. | HIGH |

### AI & Document Processing

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **@google/genai** | ^1.37+ | Gemini API client | Unified SDK for Gemini 3 Flash. Supports both Gemini API and Vertex AI with minimal code changes. Replaces older `@google-cloud/vertexai`. | HIGH |
| **Gemini 3 Flash (Preview)** | gemini-3-flash-preview | Document extraction | $0.50/1M input tokens, 90% cost reduction with context caching. 1M token context window handles large documents. Best for invoice/receipt OCR and data extraction. | HIGH |

### File Processing

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **SheetJS (xlsx)** | ^0.20+ | Excel/CSV parsing | 2.6M weekly downloads, built-in TypeScript types, handles .xlsx/.xls/.csv. Use `read` for upload, `sheet_to_json` for data extraction. | HIGH |
| **React FilePond** | ^7.x | File upload UI | Drag-and-drop, chunked uploads, image preview, progress indicators. Works with Supabase Storage. | MEDIUM |

### State Management & Data Fetching

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **TanStack Query** | ^5.x | Server state | Caching, deduplication, background refetching for API calls. Handles Supabase queries elegantly. Eliminates 80% of state management needs. | HIGH |
| **Zustand** | ^5.x | Client state | Lightweight global state for UI state (sidebar open, theme preference). Only use for non-server state. | MEDIUM |

### Forms & Validation

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **React Hook Form** | ^7.x | Form management | Minimal re-renders, excellent performance, integrates with any UI library. | HIGH |
| **Zod** | ^3.x | Schema validation | TypeScript-first, runtime + compile-time safety. Use `z.infer<>` for type generation. Requires `strict: true` in tsconfig. | HIGH |
| **@hookform/resolvers** | ^3.x | RHF + Zod bridge | Official integration between React Hook Form and Zod. | HIGH |

### Routing

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **React Router** | ^7.x | Client routing | v7 merged Remix features. Use as SPA router (not framework mode) for Vite. No breaking changes from v6 with future flags. | HIGH |

### Internationalization & RTL

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **react-i18next** | ^15.x | i18n framework | Industry standard, RTL detection, lazy loading translations. | HIGH |
| **Tailwind logical properties** | Built-in | RTL layout | Use `ms-*`/`me-*` instead of `ml-*`/`mr-*`. Tailwind v4 supports this natively. | HIGH |

### Date & Time

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **date-fns** | ^4.x | Date manipulation | Best tree-shaking, functional API, 1.6KB for single method usage. Faster than dayjs. Do NOT use moment.js. | HIGH |

### Development Tools

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Vitest** | ^2.x | Testing | Vite-native, Jest-compatible API, faster than Jest. | HIGH |
| **@testing-library/react** | ^16.x | Component testing | Standard for React testing, encourages accessible queries. | HIGH |
| **ESLint** | ^9.x | Linting | Flat config in v9. Use with @typescript-eslint. | HIGH |
| **Prettier** | ^3.x | Formatting | Consistent code style. | HIGH |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not Alternative |
|----------|-------------|-------------|---------------------|
| Build tool | Vite | Next.js | Overkill for SPA. Next.js adds complexity (server components, API routes) not needed when using Supabase as backend. |
| Build tool | Vite | Create React App | Deprecated, slow, no longer maintained. |
| UI Library | Untitled UI | shadcn/ui | Untitled UI has more components (5000+ vs ~50), same copy-paste model, specifically designed for dark theme + customization. |
| UI Library | Untitled UI | MUI/Chakra | Vendor lock-in, harder to customize, larger bundle size. |
| State | TanStack Query + Zustand | Redux Toolkit | Overkill. RTK adds boilerplate that TQ+Zustand eliminate. |
| State | TanStack Query | SWR | TanStack Query has better devtools, more features (mutations, infinite queries). |
| AI SDK | @google/genai | @google-cloud/vertexai | Old SDK, not receiving Gemini 2.0+ features. The new unified SDK is the future. |
| AI SDK | Gemini 3 Flash | GPT-4 Vision | Gemini 3 Flash is 3x faster, significantly cheaper, comparable quality for document extraction. |
| Excel | SheetJS | exceljs | SheetJS has better browser support, smaller bundle, simpler API. |
| Dates | date-fns | dayjs | date-fns has better tree-shaking, faster performance, more functional API. |
| Dates | date-fns | moment.js | NEVER use moment. Deprecated, massive bundle, mutable. |
| Forms | React Hook Form | Formik | RHF has better performance (fewer re-renders), smaller bundle. |
| Routing | React Router v7 | TanStack Router | React Router is more mature, larger ecosystem, easier migration path. |

---

## Architecture Decisions

### Why Vite + React (not Next.js)

For this app, we're building a **client-side SPA** with Supabase handling all backend concerns:
- Auth via Supabase Auth
- Database via Supabase PostgreSQL + RLS
- File storage via Supabase Storage
- AI processing via direct Gemini API calls

Next.js's server-side features (API routes, server components, ISR) add complexity without benefit here. Vite provides faster DX and simpler mental model.

### Why Untitled UI (not shadcn/ui)

Both use copy-paste model, but Untitled UI offers:
1. **5,000+ components** vs shadcn's ~50
2. **React Aria foundation** = accessibility built-in
3. **Native dark mode** via CSS variables (green accent fits user's spec)
4. **Vite starter kit** included
5. **Active development** (launched July 2025)

### Why TanStack Query + Zustand (not Redux)

Modern React apps should separate:
- **Server state** (TanStack Query): Data from Supabase, cached, auto-refetched
- **Client state** (Zustand): UI state like theme, sidebar, modal open

This eliminates Redux boilerplate while being more maintainable.

### Team-Based Access via RLS

Supabase Row Level Security policies handle multi-tenant access:

```sql
-- Example: Team members can access their team's invoices
CREATE POLICY "team_access" ON invoices
FOR ALL TO authenticated
USING (
  team_id IN (
    SELECT team_id FROM team_members
    WHERE user_id = auth.uid()
  )
);
```

No application-level authorization code needed. Security at database layer.

---

## RTL/Hebrew Support Strategy

1. **HTML `dir` attribute**: Set `dir="rtl"` on `<html>` for Hebrew users
2. **Tailwind logical properties**: Replace `ml-4` with `ms-4`, `pl-2` with `ps-2`
3. **Flexbox direction**: Use `flex-row-reverse` or let `dir="rtl"` handle it
4. **Bidirectional text**: Numbers in Hebrew text handled automatically by browser
5. **React Aria**: Untitled UI's foundation handles RTL focus management

---

## Document Processing Pipeline

```
User Upload → Supabase Storage → Gemini 3 Flash → Structured Data → PostgreSQL
    ↓
[PDF/Image/Excel]  →  [Signed URL]  →  [Vision API]  →  [JSON]  →  [invoices table]
```

**For PDFs/Images (invoices, receipts):**
1. Upload to Supabase Storage
2. Generate signed URL
3. Send to Gemini 3 Flash with extraction prompt
4. Parse structured response (vendor, amount, date, VAT, line items)
5. Store in PostgreSQL

**For Excel/CSV (bank statements):**
1. Parse client-side with SheetJS
2. Map columns to expected schema
3. Validate with Zod
4. Bulk insert to PostgreSQL

---

## Installation Commands

```bash
# Initialize project
npm create vite@latest vat-management -- --template react-ts
cd vat-management

# Core dependencies
npm install react@^19 react-dom@^19 react-router@^7
npm install @supabase/supabase-js
npm install @google/genai
npm install @tanstack/react-query
npm install zustand
npm install react-hook-form @hookform/resolvers zod
npm install xlsx
npm install date-fns
npm install react-i18next i18next

# Styling (Tailwind v4)
npm install tailwindcss @tailwindcss/vite

# Dev dependencies
npm install -D typescript @types/react @types/react-dom
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
npm install -D eslint @eslint/js typescript-eslint
npm install -D prettier eslint-config-prettier

# File upload (optional - can use native input)
npm install react-filepond filepond
```

**For Untitled UI components:** Copy from their component library directly into `src/components/ui/`. No npm package - it's copy-paste by design.

---

## Environment Variables

```env
# .env.local
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx

# For Vertex AI (production)
VITE_GOOGLE_CLOUD_PROJECT=your-project-id
VITE_GOOGLE_CLOUD_LOCATION=us-central1

# For Gemini API (development/simpler)
VITE_GEMINI_API_KEY=xxx
```

---

## Version Verification Sources

| Technology | Version Verified | Source |
|------------|-----------------|--------|
| React | 19.x | Untitled UI requirements (React 19.1+) |
| Vite | 6.x | [Vite Official Docs](https://vite.dev/guide/) |
| TypeScript | 5.8 | Untitled UI requirements |
| Tailwind CSS | 4.1 | Untitled UI requirements |
| Untitled UI React | July 2025 launch | [Untitled UI Changelog](https://www.untitledui.com/changelog) |
| @google/genai | 1.37+ | [Google Gen AI SDK](https://github.com/googleapis/js-genai) |
| Gemini 3 Flash | Preview | [Google Cloud Docs](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-flash) |
| React Router | 7.x | [React Router Docs](https://reactrouter.com/) |
| TanStack Query | 5.x | Community consensus, npm |
| SheetJS | 0.20+ | [SheetJS Docs](https://docs.sheetjs.com/) |

---

## Confidence Assessment

| Component | Confidence | Rationale |
|-----------|------------|-----------|
| Vite + React + TS | HIGH | Industry standard, official docs verified |
| Untitled UI | HIGH | Official website, GitHub repo active (Jan 2026), clear requirements |
| Supabase | HIGH | Official docs, production-proven at scale |
| Gemini 3 Flash | HIGH | Google Cloud docs, pricing verified, available in preview |
| @google/genai SDK | HIGH | Official Google SDK, replaces older packages |
| TanStack Query + Zustand | HIGH | Community consensus from multiple 2025 sources |
| React Hook Form + Zod | HIGH | Standard combination, official integration |
| SheetJS | HIGH | Most popular Excel library, 2.6M weekly downloads |
| React FilePond | MEDIUM | Good library but could use native file input instead |
| RTL approach | MEDIUM | Based on best practices, not app-specific testing |

---

## What NOT to Use

| Technology | Why Not |
|------------|---------|
| Create React App (CRA) | Deprecated, slow, no longer maintained |
| moment.js | Deprecated, massive bundle (300KB+), mutable |
| @google-cloud/vertexai | Old SDK, not receiving Gemini 2.0+ features |
| @google/generative_language | Old SDK, deprecated |
| Redux / Redux Toolkit | Overkill for this app, TanStack Query handles server state |
| MUI / Material UI | Vendor lock-in, hard to customize, large bundle |
| Chakra UI | Less components than Untitled UI, not React Aria based |
| Next.js | Adds server complexity when Supabase is the backend |
| Firebase | More expensive, less SQL flexibility than Supabase |
| GPT-4 Vision | More expensive than Gemini 3 Flash, slower |
| Formik | More re-renders than React Hook Form |
| axios | fetch is native, no need for extra dependency |
| lodash | Tree-shaking issues, use native JS or es-toolkit |

---

## Sources

### Official Documentation
- [Vite Getting Started](https://vite.dev/guide/)
- [Supabase React Quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/reactjs)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Google Gen AI SDK](https://github.com/googleapis/js-genai)
- [Gemini 3 Flash Docs](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-flash)
- [Untitled UI React](https://www.untitledui.com/react)
- [React Router v7](https://reactrouter.com/)
- [TanStack Query](https://tanstack.com/query/latest)
- [React Hook Form](https://react-hook-form.com/)
- [Zod](https://zod.dev/)
- [SheetJS](https://docs.sheetjs.com/)
- [Tailwind CSS Dark Mode](https://tailwindcss.com/docs/dark-mode)

### Community Sources (MEDIUM confidence)
- [React State Management 2025](https://www.developerway.com/posts/react-state-management-2025)
- [RTL in React Guide](https://leancode.co/blog/right-to-left-in-react)
- [PDF Libraries for React 2025](https://blog.react-pdf.dev/6-open-source-pdf-generation-and-modification-libraries-every-react-dev-should-know-in-2025)
