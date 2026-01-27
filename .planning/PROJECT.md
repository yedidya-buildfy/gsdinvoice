# VAT Declaration Manager

## What This Is

A web application for managing VAT declarations by uploading bank movements, credit card statements, and invoices/receipts. Uses AI (Gemini 3 Flash Preview) to read documents in any format and automatically match invoices to bank transactions. Built for a team managing Israeli business finances.

## Core Value

Automatically connect invoices and receipts to bank/credit card transactions, eliminating manual matching for VAT reporting.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User authentication (login/signup) with Supabase
- [ ] Upload bank movements (xlsx/csv) with automatic parsing
- [ ] Upload credit card statements (xlsx/csv) with automatic parsing
- [ ] Upload invoices/receipts (PDF, image, xlsx, csv) with AI extraction
- [ ] Detect credit card charges in bank movements (e.g., "ישראכרט") and link to credit card details
- [ ] AI-powered invoice-to-transaction matching with confidence scoring
- [ ] Duplicate detection with row-by-row review (skip/replace/add anyway)
- [ ] Dashboard showing unmatched rows and unmatched files
- [ ] Date range selector for VAT summary export
- [ ] Settings page with matching trigger options
- [ ] Sidebar navigation with pages: Dashboard, Bank Movements, Invoices & Receipts, Credit Card, Settings

### Out of Scope

- Multi-company/multi-tenant support — single shared team for now
- Tax authority submission format export — summary only
- Mobile app — web-first
- Complex role-based permissions — all team members have equal access

## Context

**Data Structure (from samples):**
- Bank movements (עובר ושב): date, value date, description, amount (זכות/חובה), balance, reference, fee, channel
- Credit card (פירוט עסקאות): transaction date, merchant name, amount ILS/USD, card number, charge date, transaction type, notes
- Credit card charges appear in bank as "ישראכרט" with total amount — need to link to individual card transactions

**Income vs Expense Logic:**
- Negative amounts = expense
- Positive amounts = income

**Matching Workflow:**
- AI auto-matches high-confidence pairs
- Uncertain matches flagged for review
- Matching trigger configurable in settings (after all uploads / on invoice upload / manual)

**Duplicate Detection Flow:**
- On upload, detect potential duplicates
- Show existing data vs new suspect data side-by-side
- User can select multiple rows and batch-apply action (skip/replace/add anyway)

## Constraints

- **AI Model**: Gemini 3 Flash Preview via Vertex AI — for document reading and matching
- **Stack**: React frontend, Supabase (auth + PostgreSQL database)
- **Design System**: Untitled UI components (React) — slim sidebar, range date picker, file uploaders, tables
- **Theme**: Dark theme with green as secondary/accent color, line design style
- **Language**: Hebrew content support (RTL) for bank/invoice data

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Supabase for auth + DB | Integrated auth, PostgreSQL, real-time — reduces infrastructure complexity | — Pending |
| Gemini 3 Flash Preview | User preference, fast and capable for document extraction | — Pending |
| Untitled UI components | Professional design system, consistent look, login/tables/uploaders ready | — Pending |
| Team-shared data (no multi-tenant) | Simplifies data model, all users see same data | — Pending |
| Row-level duplicate review | User wants granular control over each potential duplicate | — Pending |

---
*Last updated: 2026-01-27 after initialization*
