---
phase: 06-credit-card-import-linking
plan: 03
subsystem: credit-card-ui
tags: [credit-cards, ui, react, upload, transactions]

requires:
  - phase: 06-01
    provides: useCreditCardUpload hook, useCreditCards hooks, credit card parser
  - phase: 05-03
    provides: TransactionFilters component, TransactionTable pattern
  - phase: 03-02
    provides: App routing with AppShell

provides:
  - CreditCardUploader component with drag/drop upload UI
  - CreditCardTable component with merchant, date, billing date display
  - CreditCardPage with upload, filtering, sorting, deletion, and re-linking
  - Credit card route at /credit-card (already configured in Phase 3)

affects:
  - 06-04-transaction-matching (will use credit card transactions for automated matching)
  - 07-invoice-matching (may need to match invoices to credit card transactions)

tech-stack:
  added: []
  patterns:
    - Credit card table shows billing date (value_date) in addition to transaction date
    - Card selector dropdown for filtering by specific card
    - Re-link button for manual retry of automatic linking

key-files:
  created:
    - src/components/creditcard/CreditCardUploader.tsx
    - src/components/creditcard/CreditCardTable.tsx
    - src/pages/CreditCardPage.tsx
  modified:
    - (none - route already configured)

decisions:
  - id: reuse-transaction-filters
    decision: Reuse TransactionFilters from bank page for credit card filtering
    rationale: Same filtering needs (search, date range, type), maintain consistency
    alternatives: Create separate CreditCardFilters, but would duplicate code
    impact: CreditCardPage imports from @/components/bank/TransactionFilters

  - id: card-selector-placement
    decision: Place card selector above Transactions header, not in filters section
    rationale: Card selection is primary categorization, not a filter
    alternatives: Put in filters section, but visually separates conceptually different controls
    impact: Card dropdown appears above transactions header in its own section

  - id: relink-button-always-visible
    decision: Re-link button always visible (not conditional on selection)
    rationale: User should be able to trigger re-linking at any time
    alternatives: Only show with selected transactions, but linking is global operation
    impact: Re-link button appears alongside delete button (which is conditional)

  - id: billing-date-column
    decision: Show both transaction date and billing date (value_date) in table
    rationale: Credit card transactions have two important dates user needs to see
    alternatives: Show only one date, but billing date is critical for bank matching
    impact: CreditCardTable has Date and Billing columns

metrics:
  duration: 3m 35s
  completed: 2026-01-27
  tasks: 3
  commits: 2
  files_created: 3
  files_modified: 0
---

# Phase 06 Plan 03: Credit Card UI Summary

**Complete credit card management page with drag/drop upload, card-filtered transaction display, and manual re-linking capability**

## Performance

- **Duration:** 3 min 35 sec
- **Started:** 2026-01-27T20:45:39Z
- **Completed:** 2026-01-27T20:49:14Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- CreditCardUploader component with drag/drop upload following BankUploader pattern
- CreditCardTable component showing merchant, transaction date, billing date, amount, and type
- CreditCardPage with upload section, card selector, filtering, sorting, and deletion
- Re-link button for manual retry of automatic credit card transaction linking
- Credit card transactions accessible via sidebar at /credit-card route

## Task Commits

Each task was committed atomically:

1. **Task 1: Create CreditCardUploader component** - `16a7390` (feat)
2. **Task 2: Create CreditCardPage with upload and display** - `f4ee2e6` (feat)
3. **Task 3: Update App.tsx routing** - (no commit - route already configured in Phase 3)

_Note: Task 3 required no changes as the /credit-card route was already configured during Phase 3 (navigation setup)_

## Files Created/Modified

**Created:**
- `src/components/creditcard/CreditCardUploader.tsx` - Drag/drop credit card statement upload UI with status display
- `src/components/creditcard/CreditCardTable.tsx` - Transaction table with merchant, date, billing date, amount columns
- `src/pages/CreditCardPage.tsx` - Complete credit card management page with upload, filtering, and linking

**Modified:**
- (none)

## Decisions Made

**1. Reuse Transaction Filters (reuse-transaction-filters)**
- **Context:** Credit card page needs search, date range, and type filtering
- **Decision:** Import and use TransactionFilters from bank page
- **Impact:** Maintains UI consistency between bank and credit card pages. Single filter component to maintain.

**2. Card Selector Placement (card-selector-placement)**
- **Context:** User needs to filter transactions by specific card
- **Decision:** Place card selector above transactions header, separate from filters section
- **Impact:** Visually distinguishes primary categorization (which card) from secondary filtering (search/date/type)

**3. Re-link Button Always Visible (relink-button-always-visible)**
- **Context:** User may want to retry automatic linking after fixing data
- **Decision:** Show re-link button at all times, not conditional on selection
- **Impact:** User can trigger re-linking without selecting transactions. Makes feature discoverable.

**4. Billing Date Column (billing-date-column)**
- **Context:** Credit card transactions have both transaction date and billing date
- **Decision:** Display both dates in separate columns (Date and Billing)
- **Impact:** User sees when purchase happened AND when it will appear on bank statement. Critical for manual matching.

## Deviations from Plan

None - plan executed exactly as written.

_Note: Task 3 required no changes because the /credit-card route was already configured during Phase 3 (navigation setup). The plan correctly identified the route should exist; it just already did._

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Blockers:** None

**Concerns:** None

**Recommendations:**
- Test with real credit card statement upload to verify parser and display
- Verify card selector works with multiple cards
- Test re-link button with actual bank charges to verify linking service integration

**Dependencies Satisfied:**
- useCreditCardUpload hook ready for file processing (06-01)
- useCreditCards and useCreditCardTransactions hooks ready for data fetching (06-01)
- TransactionFilters component ready for filtering (05-03)
- creditCardLinker service ready for manual re-linking (06-01)
- Credit card route configured in App.tsx (03-02)

**Ready for 06-04:** YES - Credit card UI complete, ready for automated transaction matching

## Technical Implementation

**Component Structure:**

```
CreditCardPage
├── Upload Section
│   └── CreditCardUploader (drag/drop with status)
└── Transactions Section
    ├── Card Selector (filter by card)
    ├── Transactions Header (with count)
    ├── Action Buttons (re-link, delete)
    ├── TransactionFilters (search, date, type)
    └── CreditCardTable (merchant, dates, amount)
```

**CreditCardUploader:**
- Follows BankUploader pattern exactly
- Uses CreditCardIcon instead of TableCellsIcon
- Status: idle → parsing → saving → success/error
- Shows parsed count, saved count, duplicate count
- Calls onUploadComplete callback after successful import

**CreditCardTable:**
- Based on TransactionTable structure
- Columns: Merchant, Date, Billing, Amount, Type, Checkbox
- Merchant = description field (merchant name from statement)
- Date = date field (transaction date)
- Billing = value_date field (billing date when charge appears on bank)
- Amount = amount_agorot formatted as shekels
- Type = reference field (transaction type: רגילה, הוראת קבע, etc.)
- Green for income, red for expense color coding
- Sortable by merchant, date, billing date, amount

**CreditCardPage State Management:**
- Card selection state: selectedCardId (filters transactions)
- Filter state: search, dateFrom, dateTo, type
- Sort state: sortColumn, sortDirection
- Selection state: selectedIds (for bulk delete)
- Action state: isLinking, isDeleting (disable during operations)

**Data Flow:**
1. useCreditCards() → creditCards array → card selector dropdown
2. useCreditCardTransactions(cardId) → transactions array
3. Client-side filtering by search/date/type → filteredTransactions
4. Client-side sorting → sortedTransactions
5. CreditCardTable displays sorted/filtered results

**Re-linking:**
- Button always visible (not conditional on selection)
- Calls linkCreditCardTransactions(userId, cardId)
- Shows spinner during linking
- Refetches transactions after completion

**Deletion:**
- Button only visible when items selected
- Deletes selected transactions via Supabase
- Clears selection and refetches after completion

## Performance Impact

- Upload: Same as bank statement upload (O(n) rows, batch insert)
- Filtering/sorting: Client-side (O(n log n) for sort, O(n) for filter)
- Table rendering: Virtualization not needed for typical credit card statement sizes (<1000 rows)

## Knowledge Transfer

**Key Patterns Established:**

1. **Component Reuse Pattern:** Import TransactionFilters from bank page for credit card page
2. **Dual Date Display:** Show both transaction date and billing date for credit card transactions
3. **Card Selector Pattern:** Dropdown above main content for primary categorization
4. **Always-Visible Actions:** Re-link button visible at all times for discoverability

**For Future Phases:**
- Other transaction-based pages should follow same filtering/sorting patterns
- Dual date display pattern applicable to any financial transaction type with multiple date concepts
- Re-link button establishes pattern for manual retry of automatic operations

---
*Phase: 06-credit-card-import-linking*
*Completed: 2026-01-27*
