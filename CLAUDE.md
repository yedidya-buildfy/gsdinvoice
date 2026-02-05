# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VAT Declaration Manager - A web application for managing Israeli VAT declarations. Upload bank movements, credit card statements, and invoices/receipts. Uses AI (Gemini 3 Flash) to extract data from documents and automatically match invoices to transactions.

## Commands

```bash
# Development
npm run dev          # Start Vite dev server
npm run build        # TypeScript check + Vite build
npm run lint         # ESLint
npm run preview      # Preview production build

# Supabase (requires supabase CLI)
supabase start                    # Local development
supabase db push                  # Push migrations to remote
supabase functions serve          # Serve edge functions locally
supabase gen types typescript --local > src/types/database.generated.ts
```

## Architecture

### Stack
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS 4
- **Backend**: Supabase (Auth, PostgreSQL, Storage, Edge Functions)
- **AI Extraction**: Gemini 3 Flash (primary) via Supabase Edge Function, Kimi K2.5 fallback for images
- **State**: TanStack Query for server state, Zustand for client state

### Key Directories
```
src/
├── components/      # React components by domain (auth, bank, documents, invoices, etc.)
├── hooks/           # Custom React hooks (useTransactions, useInvoices, useCreditCards, etc.)
├── lib/
│   ├── parsers/     # CSV/XLSX parsers for bank/CC statements
│   ├── services/    # Business logic (lineItemMatcher, creditCardLinker, ccBankMatcher)
│   ├── duplicates/  # File and line item duplicate detection
│   └── utils/       # Utilities (vatCalculator, dateUtils, vendorResolver)
├── stores/          # Zustand stores (uiStore, settingsStore)
├── types/           # TypeScript types (database.ts is the source of truth)
├── contexts/        # React contexts (TeamContext)
└── pages/           # Page components

supabase/
├── functions/       # Edge Functions (extract-invoice, stripe-webhook, etc.)
└── migrations/      # PostgreSQL migrations
```

### Data Flow
1. **File Upload**: Client uploads to Supabase Storage, creates `files` record with status='pending'
2. **AI Extraction**: Edge function (`extract-invoice`) processes file, creates `invoices` + `invoice_rows` records
3. **Matching**: `lineItemMatcher` service matches invoice rows to `transactions` (bank/CC)
4. **CC Linking**: `ccBankMatcher` links credit card charges in bank statements to individual CC transactions

### Database Schema (key tables)
- `files` - Uploaded documents (storage_path, status, file_hash for deduplication)
- `invoices` - Extracted invoice headers (vendor, date, totals in agorot)
- `invoice_rows` - Invoice line items (linked to transactions via transaction_id)
- `transactions` - Unified bank + CC transactions (transaction_type: bank_regular | bank_cc_charge | cc_purchase)
- `cc_bank_match_results` - CC-to-bank charge matching results
- `vendor_aliases` - Vendor name normalization rules
- `teams` / `team_members` - Multi-tenant team structure

### Monetary Values
All monetary amounts are stored as **agorot (integer cents)** in the database. Use `toAgorot()` and `fromAgorot()` helpers for conversion.

### Path Alias
`@/` maps to `src/` (configured in vite.config.ts and tsconfig)

## Key Patterns

### Team Context
All data is scoped to the current team. Use `useTeam()` from `TeamContext` to get `teamId`.

### TanStack Query Keys
```typescript
['transactions', teamId, filters]
['invoices', teamId, filters]
['files', teamId]
['credit-cards', teamId]
```

### File Processing Status Flow
`pending` -> `processing` -> `processed` | `failed`

### Transaction Types
- `bank_regular` - Normal bank transaction
- `bank_cc_charge` - Credit card charge appearing in bank statement (e.g., "ישראכרט")
- `cc_purchase` - Individual credit card purchase

## Conventions

- Use HeroIcons (thin outline style) - never emojis
- Hebrew content support (RTL) for financial data
- Dark theme with green accent
- Currency validation enforces ISO 4217 3-letter codes
- Date format: Israeli format DD/MM/YYYY in UI, ISO YYYY-MM-DD in database
