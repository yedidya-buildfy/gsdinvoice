# Roadmap: VAT Declaration Manager

## Overview

This roadmap delivers an AI-powered VAT declaration manager for Israeli SMBs. Starting with foundation and authentication, we build document upload infrastructure, then bank/credit card parsing capabilities, followed by AI extraction with Gemini 3 Flash. The matching engine connects invoices to transactions with confidence scoring, supporting complex split/group matching scenarios. Duplicate detection ensures data integrity, and the dashboard provides actionable insights with export capabilities.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Foundation** - Project scaffolding, database schema, Supabase setup
- [x] **Phase 2: Authentication** - User signup, login, logout with Supabase Auth
- [x] **Phase 3: Navigation & UI Shell** - Sidebar, routing, dark theme, RTL support
- [x] **Phase 4: Document Upload** - File upload infrastructure with batch support
- [x] **Phase 5: Bank Statement Import** - Bank xlsx/csv parsing and transaction list
- [x] **Phase 6: Credit Card Import & Linking** - CC statements and linking to bank charges
- [x] **Phase 7: AI Document Extraction** - Gemini 3 Flash integration for invoice parsing
- [ ] **Phase 8: Credit Card to Bank Matching** - Link credit card transactions to bank movement charges
- [ ] **Phase 9: Invoice Line Items to Expenses Matching** - Match invoice rows to credit card/bank transactions
- [ ] **Phase 10: Dashboard & Reports** - Summary views, date range selection, export capabilities
- [x] **Phase 13: VAT Fields for Bank Transactions** - VAT boolean, percentage, and amount columns with merchant settings modal

**Note:** Settings page is built incrementally alongside phases 8-10 (auto-extract, duplicate handling defaults, matching preferences)

## Phase Details

### Phase 1: Foundation
**Goal**: Establish project infrastructure with production-ready database schema and Supabase configuration
**Depends on**: Nothing (first phase)
**Requirements**: None (infrastructure phase)
**Success Criteria** (what must be TRUE):
  1. Vite + React 19 + TypeScript project builds and runs locally
  2. Supabase project connected with environment variables configured
  3. Database schema created with all tables and RLS policies enabled
  4. Audit logging infrastructure in place for financial data
  5. Currency stored as integers (agorot) with NUMERIC types in PostgreSQL
**Plans**: 3 plans
Plans:
- [x] 01-01-PLAN.md - Vite + React 19 + TypeScript project with Tailwind CSS v4
- [x] 01-02-PLAN.md - Database schema and audit logging (custom triggers)
- [x] 01-03-PLAN.md - Supabase client, TanStack Query, and Zustand setup

### Phase 2: Authentication
**Goal**: Users can securely access their accounts through Supabase Auth
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03
**Success Criteria** (what must be TRUE):
  1. User can create account with email and password
  2. User can log in and session persists across browser restarts
  3. User can log out from any page in the application
  4. Unauthenticated users are redirected to login
**Plans**: 2 plans
Plans:
- [x] 02-01-PLAN.md - Auth foundation (AuthContext, LoginForm, SignupForm)
- [x] 02-02-PLAN.md - Pages, routing, and protected routes integration

### Phase 3: Navigation & UI Shell
**Goal**: Application shell with navigation and dark theme ready for feature development
**Depends on**: Phase 2
**Requirements**: NAV-01, UI-01, UI-02, UI-03
**Success Criteria** (what must be TRUE):
  1. Sidebar displays all pages: Dashboard, Bank Movements, Invoices & Receipts, Credit Card, Settings
  2. Dark theme with green accent color applied consistently
  3. Untitled UI components properly integrated and styled
  4. Hebrew/RTL text displays correctly throughout the application
  5. Navigation between pages works without page reload
**Plans**: 2 plans
Plans:
- [x] 03-01-PLAN.md - Theme setup, AppShell, and Sidebar components
- [x] 03-02-PLAN.md - Placeholder pages and routing integration

### Phase 4: Document Upload
**Goal**: Users can upload invoices and receipts with batch support
**Depends on**: Phase 3
**Requirements**: UPLD-01, UPLD-02, UPLD-03
**Success Criteria** (what must be TRUE):
  1. User can select and upload multiple files at once
  2. System accepts PDF, JPG, PNG, XLSX, and CSV files
  3. User sees uploaded documents in a list with thumbnails
  4. Upload progress visible during file transfer
  5. Files stored in Supabase Storage with proper access controls
**Plans**: 2 plans
Plans:
- [x] 04-01-PLAN.md - Storage helpers, upload hook, and FileUploader component
- [x] 04-02-PLAN.md - Document list with thumbnails and query integration

### Phase 5: Bank Statement Import
**Goal**: Users can import bank transactions from xlsx/csv files
**Depends on**: Phase 4
**Requirements**: BANK-01, BANK-02, BANK-04
**Success Criteria** (what must be TRUE):
  1. User can upload bank statement in xlsx or csv format
  2. System correctly parses Israeli bank formats (date, description, amount, reference)
  3. User can view transactions in a sortable and filterable list
  4. Hebrew transaction descriptions display correctly (RTL)
  5. Income vs expense correctly identified by positive/negative amounts
**Plans**: 3 plans
Plans:
- [x] 05-01-PLAN.md - Parsing foundation (xlsx, csv, currency, date utilities)
- [x] 05-02-PLAN.md - Upload hook, transactions hook, BankUploader component
- [x] 05-03-PLAN.md - TransactionTable, filters, and BankMovementsPage integration

### Phase 6: Credit Card Import & Linking
**Goal**: Users can import credit card statements and system links them to bank charges
**Depends on**: Phase 5
**Requirements**: BANK-03, BANK-05, BANK-06
**Success Criteria** (what must be TRUE):
  1. User can upload credit card statement in xlsx or csv format
  2. System detects credit card charges in bank movements (e.g., entries containing "ישראכרט")
  3. System automatically links credit card bank rows to corresponding credit card detail rows
  4. User can view linked credit card transactions from both bank and card perspectives
  5. Credit card page shows individual transactions with merchant details
**Plans**: 3 plans
Plans:
- [x] 06-01-PLAN.md - Credit card parser and upload hook
- [x] 06-02-PLAN.md - Linking service and CreditCardTable component
- [x] 06-03-PLAN.md - CreditCardPage integration and routing

### Phase 7: AI Document Extraction
**Goal**: System extracts structured data from invoices using Gemini 3 Flash
**Depends on**: Phase 4
**Requirements**: EXTR-01, EXTR-02
**Success Criteria** (what must be TRUE):
  1. Uploaded invoice triggers AI extraction via Gemini 3 Flash
  2. System extracts vendor name, date, amount, VAT, and invoice number
  3. Each extraction includes a confidence score (0-100%)
  4. Hebrew text in invoices is correctly extracted
  5. Extracted data stored with link to original document
**Plans**: 3 plans
Plans:
- [x] 07-01-PLAN.md - Edge Function for Gemini API extraction
- [x] 07-02-PLAN.md - Client extraction hooks and invoice query
- [x] 07-03-PLAN.md - UI integration with Extract button and status display

### Phase 8: Credit Card to Bank Matching
**Goal**: System links credit card transaction rows to their corresponding bank movement charges
**Depends on**: Phase 6
**Requirements**: Enhanced CC-Bank linking
**Success Criteria** (what must be TRUE):
  1. System matches credit card detail rows to bank CC charge entries by amount/date
  2. User can view which CC transactions are linked to which bank charge
  3. User can manually link/unlink CC transactions to bank charges
  4. Unlinked CC transactions are flagged for review
  5. Settings: Configure auto-linking tolerance (amount %, date range)
**Plans**: TBD
**Settings Built**: Auto-link tolerance, date range matching

### Phase 9: Invoice Line Items to Expenses Matching
**Goal**: Users can match invoice line items to credit card or bank transactions
**Depends on**: Phase 7, Phase 8
**Requirements**: Invoice-to-expense matching
**Success Criteria** (what must be TRUE):
  1. User can select invoice line items and match to CC or bank transactions
  2. System suggests matches based on amount, date, vendor similarity
  3. Split matching: one invoice to multiple expenses with allocation
  4. Group matching: multiple invoice rows to one expense
  5. Duplicate line item detection with configurable default action (skip/replace/add)
  6. Settings: Auto-extract on upload toggle, duplicate handling defaults
**Plans**: TBD
**Settings Built**: Auto-extract toggle, duplicate line item defaults, matching confidence threshold

### Phase 10: Dashboard & Reports
**Goal**: Users have visibility into matching status and can export data for VAT reporting
**Depends on**: Phase 9
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04
**Success Criteria** (what must be TRUE):
  1. Dashboard shows count of unmatched expenses (no linked invoice)
  2. Dashboard shows count of unmatched invoices (no linked expense)
  3. Date range picker for VAT period selection
  4. Export to CSV/Excel for accountant
  5. Summary totals: income, expenses, VAT collected, VAT paid
**Plans**: TBD

### Phase 13: VAT Fields for Bank Transactions
**Goal**: Users can track VAT on bank transactions with merchant-level settings
**Depends on**: Phase 5
**Requirements**: None (enhancement phase)
**Success Criteria** (what must be TRUE):
  1. Bank transactions table shows VAT columns (has VAT, VAT %, VAT amount) - DONE
  2. Date column is smaller with compact date format - DONE
  3. User can toggle VAT and set percentage per transaction - DONE
  4. VAT amount auto-calculates from transaction amount and percentage - DONE
  5. Modal prompts user to apply VAT settings to: all past orders, this order, or all future orders from same merchant - DONE
  6. Merchant VAT preferences stored for auto-applying to future imports - DONE
**Plans**: 13-01-PLAN.md (Complete)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> ... -> 10 (13 was inserted earlier)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete | 2026-01-27 |
| 2. Authentication | 2/2 | Complete | 2026-01-27 |
| 3. Navigation & UI Shell | 2/2 | Complete | 2026-01-27 |
| 4. Document Upload | 2/2 | Complete | 2026-01-27 |
| 5. Bank Statement Import | 3/3 | Complete | 2026-01-27 |
| 6. Credit Card Import & Linking | 3/3 | Complete | 2026-01-27 |
| 7. AI Document Extraction | 3/3 | Complete | 2026-01-28 |
| 8. Credit Card to Bank Matching | 0/TBD | Not started | - |
| 9. Invoice Line Items to Expenses | 0/TBD | Not started | - |
| 10. Dashboard & Reports | 0/TBD | Not started | - |
| 13. VAT Fields for Bank Transactions | 1/1 | Complete | 2026-01-27 |

**Settings Page:** Built incrementally with phases 8-10

---
*Roadmap created: 2026-01-27*
*Roadmap restructured: 2026-01-28*
*Depth: streamlined (10 phases)*
