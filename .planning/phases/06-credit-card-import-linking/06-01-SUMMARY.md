---
phase: 06-credit-card-import-linking
plan: 01
subsystem: credit-card-import
tags: [credit-cards, parser, upload, israeli-formats]

requires:
  - 05-bank-statement-import (parser patterns, hash-based duplicate detection)
  - 01-foundation (database schema with credit_cards table)

provides:
  - Israeli credit card statement parser with auto column detection
  - Credit card upload with auto-card creation and transaction linking
  - Credit card data query hooks with TanStack Query

affects:
  - 06-02-credit-card-ui (will consume useCreditCardUpload and useCreditCards)
  - 06-03-bank-linking (will link credit card transactions to bank charges)

tech-stack:
  added: []
  patterns:
    - Credit card auto-creation on first upload per card number
    - Hash prefix 'cc|' to distinguish from bank transaction hashes
    - Foreign currency storage without conversion (for reference only)

key-files:
  created:
    - src/lib/parsers/creditCardParser.ts
    - src/hooks/useCreditCardUpload.ts
    - src/hooks/useCreditCards.ts
  modified:
    - src/lib/parsers/index.ts

decisions:
  - id: cc-hash-prefix
    decision: Use 'cc|' prefix in transaction hash to distinguish credit card from bank
    rationale: Prevents collision between bank and credit card transactions with same date/amount
    alternatives: Separate hash field, but single hash field with prefix is cleaner
    impact: Hash format now: cc|date|merchant|amount|cardLastFour

  - id: auto-card-creation
    decision: Auto-create credit_cards entry when new card number detected in upload
    rationale: User shouldn't need to manually register cards before uploading
    alternatives: Require card registration, but adds friction
    impact: useCreditCardUpload checks/creates cards before inserting transactions

  - id: foreign-currency-storage
    decision: Store foreign amounts as-is without conversion, ILS amount in amountAgorot
    rationale: Exchange rate at transaction time not available in statement files
    alternatives: Look up historical rates, but adds complexity and potential errors
    impact: Foreign amounts stored for reference, linking will use ILS amount

  - id: billing-date-mapping
    decision: Map billingDate to value_date field in transactions table
    rationale: Reuse existing field for credit card charge date concept
    alternatives: Add separate billing_date field, but value_date is semantically equivalent
    impact: value_date now means billing date for credit card transactions

metrics:
  duration: 2m 17s
  completed: 2026-01-27
  tasks: 2
  commits: 2
  files_created: 3
  files_modified: 1
---

# Phase 06 Plan 01: Credit Card Parser & Upload Summary

**One-liner:** Israeli credit card statement parser with auto column detection, foreign currency handling, and card-linked transaction import

## What Was Built

Created complete credit card statement import infrastructure following established Phase 5 patterns:

1. **Credit Card Parser** (`creditCardParser.ts`)
   - Auto-detects Israeli credit card column formats
   - Parses merchant name, billing date, transaction type, notes
   - Extracts card last four digits from various formats (1234, **** 1234, כרטיס 1234)
   - Handles foreign currency amounts alongside ILS amounts
   - Generates unique hash: `cc|date|merchant|amount|cardLastFour`

2. **Upload Hook** (`useCreditCardUpload.ts`)
   - File selection, parsing, saving state management
   - Auto-creates `credit_cards` entries for new card numbers
   - Links transactions to cards via `linked_credit_card_id`
   - Hash-based duplicate detection (prefix 'cc|' to avoid bank collision)
   - Batch insert for performance

3. **Query Hooks** (`useCreditCards.ts`)
   - `useCreditCards()` - Fetch all user credit cards
   - `useCreditCardTransactions(cardId?)` - Fetch credit card transactions by card
   - TanStack Query with 30s staleTime (consistent with project)

## Technical Implementation

**Parser Architecture:**
- Follows `bankStatementParser.ts` structure exactly
- Scans first 15 rows for header detection
- Normalizes headers (removes \r\n, $, ₪, whitespace)
- Maps Israeli column patterns to fields
- Supports both .xlsx and .csv formats

**Column Pattern Detection:**
```typescript
const CREDIT_CARD_COLUMN_PATTERNS = {
  date: ['תאריך עסקה', 'תאריך'],
  billingDate: ['מועד חיוב', 'תאריך חיוב'],
  merchantName: ['שם בית עסק', 'בית עסק', 'שם בית העסק'],
  amountILS: ['סכום בש"ח', 'סכום בשקלים', 'סכום'],
  foreignAmount: ['סכום במטבע מקור', 'סכום בדולר', 'סכום במט"ח'],
  card: ['כרטיס', 'מספר כרטיס', '4 ספרות אחרונות'],
  transactionType: ['סוג עסקה'],
  notes: ['הערות', 'פרטים נוספים'],
};
```

**Card Auto-Creation Flow:**
1. Extract unique card numbers from parsed transactions
2. Check if each card exists in `credit_cards` table
3. Create missing cards with default type 'visa'
4. Build cardLastFour → card.id map
5. Use map to populate `linked_credit_card_id` in transactions

**Transaction Mapping:**
```typescript
{
  date: tx.date,                    // Transaction date
  value_date: tx.billingDate,       // Billing date (charge date)
  description: tx.merchantName,     // Merchant name
  reference: tx.transactionType,    // 'רגילה', 'הוראת קבע', etc.
  amount_agorot: tx.amountAgorot,  // ILS amount in agorot
  is_credit_card_charge: false,     // Detail row, not bank charge
  linked_credit_card_id: cardId,    // Link to credit_cards table
  channel: tx.notes,                // Store notes in channel field
  hash: 'cc|...',                   // Prefixed hash for uniqueness
}
```

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

**1. Credit Card Hash Prefix (cc-hash-prefix)**
- **Context:** Need to distinguish credit card transaction hashes from bank hashes
- **Decision:** Use 'cc|' prefix in hash: `cc|date|merchant|amount|cardLastFour`
- **Impact:** Prevents hash collisions between bank and credit card transactions with same date/amount

**2. Auto Card Creation (auto-card-creation)**
- **Context:** User uploads credit card file with card number 1234, but no card entry exists
- **Decision:** Automatically create `credit_cards` entry during upload
- **Impact:** Seamless upload experience, no pre-registration needed. User can edit card details later.

**3. Foreign Currency Storage (foreign-currency-storage)**
- **Context:** Credit card statements show both foreign amount (USD $100) and ILS amount (₪350)
- **Decision:** Store foreign amount in separate fields (foreignAmount, foreignCurrency), ILS in amountAgorot
- **Impact:** Preserves original transaction data without attempting conversion. Linking uses ILS amount.

**4. Billing Date Mapping (billing-date-mapping)**
- **Context:** Credit cards have both transaction date and billing date (when charge hits account)
- **Decision:** Map billingDate to value_date field in transactions table
- **Impact:** Reuses existing field semantically equivalent to billing date. Bank charges will match on this date.

## Testing Notes

**Manual Testing Performed:**
- TypeScript compilation passes without errors
- All files created in correct locations
- Exports properly defined in index files

**Ready for Integration Testing:**
- Parser needs real credit card .xlsx/.csv file to verify column detection
- Upload hook needs database connection to verify card creation and transaction insert
- Query hooks need transactions in database to verify fetching

**Test Data Requirements:**
- Israeli credit card statement with Hebrew columns
- Multiple card numbers in single file
- Mix of ILS and foreign currency transactions
- Duplicate transactions to verify hash detection

## Next Phase Readiness

**Blockers:** None

**Concerns:**
- Foreign currency detection is heuristic-based (checks column name for 'דולר'/'USD')
  - May need enhancement if other currencies commonly used
  - Currently defaults to USD if column doesn't specify

**Recommendations:**
- Test with real credit card files from major Israeli issuers (Isracard, Cal, Max)
- Verify card last four extraction works with all format variants
- Consider adding card name/nickname field for user customization

**Dependencies Satisfied:**
- Phase 5 patterns established (parser, upload hook, query hooks)
- Database schema includes credit_cards and transactions tables
- TanStack Query and Supabase client available

**Ready for 06-02:** YES - UI can now consume upload and query hooks

## Files Changed

**Created:**
- `src/lib/parsers/creditCardParser.ts` (278 lines) - Credit card statement parser
- `src/hooks/useCreditCardUpload.ts` (207 lines) - Upload hook with auto-card creation
- `src/hooks/useCreditCards.ts` (93 lines) - TanStack Query hooks for credit cards

**Modified:**
- `src/lib/parsers/index.ts` - Added credit card parser exports

## Commits

1. `8c6b124` - feat(06-01): create credit card statement parser
2. `75c2cde` - feat(06-01): create credit card upload and query hooks

## Performance Impact

- Parser performance same as bank parser (O(n) rows)
- Upload performance: 1 query per unique card + 1 batch insert
- Query performance: Indexed on user_id and linked_credit_card_id

## Security Considerations

- Card last four is not sensitive (commonly displayed)
- No full card numbers stored
- RLS policies apply to credit_cards and transactions tables
- Hash includes card number to ensure transaction uniqueness per card

## Knowledge Transfer

**Key Patterns Established:**
1. Hash prefix pattern ('cc|') for transaction type distinction
2. Auto-entity creation during upload (credit cards on first upload)
3. Foreign currency storage without conversion
4. Reuse of value_date field for billing date concept

**For Future Phases:**
- 06-02 should display credit cards with card_last_four and card_name
- 06-03 will need to match billingDate (value_date) to bank charge dates
- Foreign amounts are for display only, linking uses ILS amountAgorot
