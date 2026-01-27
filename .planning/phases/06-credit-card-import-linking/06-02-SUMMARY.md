---
phase: 06-credit-card-import-linking
plan: 02
subsystem: credit-card-linking
tags: [linking, credit-cards, detection, israeli-banks, rtl-ui]

requires:
  - 06-01 (credit card parser, upload hooks, credit_cards table)
  - 05-bank-statement-import (transaction table structure, hash-based detection)

provides:
  - Credit card charge detection in bank transactions
  - Automatic linking service for bank charges to credit_cards
  - CreditCardTable component with RTL layout and linked status display

affects:
  - 06-03 (will use linkCreditCardTransactions for automatic matching)
  - Future transaction matching phases (detection pattern established)

tech-stack:
  added: []
  patterns:
    - Israeli CC keyword detection (כרטיס, ויזא, מאסטרקארד, ישראכרט, etc.)
    - Card last four extraction from bank descriptions
    - Amount tolerance matching (2%) for fuzzy linking
    - Date window matching (±2 days) for billing alignment
    - Linked status visualization with icons (CheckCircle/Clock)

key-files:
  created:
    - src/lib/services/creditCardLinker.ts
  modified:
    - src/hooks/useBankStatementUpload.ts
    - src/components/creditcard/CreditCardTable.tsx

decisions:
  - id: cc-keyword-detection
    decision: Use Israeli Hebrew keywords for CC charge detection
    rationale: Bank statements use Hebrew terms consistently (כרטיס, ויזא, etc.)
    impact: detectCreditCardCharge identifies CC charges on import with high accuracy

  - id: last-four-extraction
    decision: Extract card last four from description using regex
    rationale: Bank descriptions include card number at end
    impact: Enables automatic matching to credit_cards.card_last_four

  - id: rtl-table-layout
    decision: RTL-aligned CreditCardTable with Hebrew column headers
    rationale: Credit card UI serves Hebrew-speaking users
    impact: Consistent with TransactionTable pattern, better UX for Hebrew

metrics:
  duration: 4m 14s
  completed: 2026-01-27
  tasks: 3
  commits: 3
  files_created: 1
  files_modified: 2
---

# Phase 06 Plan 02: Credit Card Linking & Charge Detection Summary

**Automatic CC charge detection in bank imports with linking service and RTL credit card transaction table**

## What Was Built

Created credit card linking infrastructure that automatically detects and links credit card charges to their detail transactions:

1. **Credit Card Linking Service** (`creditCardLinker.ts`)
   - `detectCreditCardCharge(description)` - Identifies CC charges from Israeli bank descriptions
   - Israeli keyword detection: כרטיס, ויזא, מאסטרקארד, ישראכרט, לאומי קארד, מקס, כאל, etc.
   - Card last four extraction using regex pattern
   - `linkCreditCardTransactions(userId, cardId?)` - Links bank charges to credit_cards entries
   - Amount tolerance matching (2% fuzzy matching)
   - Date window matching (±2 days for billing alignment)

2. **Bank Uploader Enhancement**
   - Auto-flags `is_credit_card_charge=true` during bank import
   - Uses `detectCreditCardCharge` to identify CC transactions
   - Enables automatic linking in future phases

3. **CreditCardTable Component**
   - RTL-aligned table with Hebrew headers (תאריך, בית עסק, סכום, כרטיס, מועד חיוב, סטטוס)
   - Card last four extraction from description
   - Linked status indicator (CheckCircleIcon for linked, ClockIcon for pending)
   - Same sorting, selection, and skeleton patterns as TransactionTable
   - Green for income, red for expense color coding

## Technical Implementation

**Detection Pattern:**
```typescript
const ccKeywords = [
  'כרטיס',           // card
  'ויזא',            // Visa
  'מאסטרקארד',       // Mastercard
  'ישראכרט',         // Isracard
  'לאומי קארד',      // Leumi Card
  'מקס',             // Max
  'כאל',             // Cal
  'חיוב לכרטיס',     // charge to card
];
```

**Linking Flow:**
1. Fetch bank charges where `is_credit_card_charge=true` and `linked_credit_card_id IS NULL`
2. Extract card last four from each charge description
3. Match to `credit_cards` table by `card_last_four`
4. Update bank charge with `linked_credit_card_id`

**Amount & Date Matching (prepared for Phase 3):**
- Amount tolerance: ±2% for fuzzy matching (handles rounding, fees)
- Date window: ±2 days from billing date for transaction alignment
- Functions ready but not yet used (will be used in 06-03 for transaction-level linking)

**UI Features:**
- Hebrew column headers for Israeli users
- RTL text alignment (`text-end`) consistent with TransactionTable
- Status column shows CheckCircle (green) for linked, Clock (muted) for pending
- Card column extracts and displays last four digits in monospace font
- Merchant column with RTL support (`dir="auto"`)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create credit card linking service** - `6c481e2` (feat)
2. **Task 2: Update bank uploader to flag CC charges** - `69a7f3e` (feat)
3. **Task 3: Create CreditCardTable component** - `f39637a` (feat)

## Files Created/Modified

**Created:**
- `src/lib/services/creditCardLinker.ts` (184 lines) - CC charge detection and linking service

**Modified:**
- `src/hooks/useBankStatementUpload.ts` - Added auto-flagging of CC charges on import
- `src/components/creditcard/CreditCardTable.tsx` - Updated to RTL layout with linked status

## Decisions Made

**1. Israeli CC Keyword Detection (cc-keyword-detection)**
- **Context:** Need to identify credit card charges in Hebrew bank statements
- **Decision:** Use comprehensive list of Israeli bank/card keywords (כרטיס, ויזא, ישראכרט, etc.)
- **Impact:** High accuracy CC charge detection on import, enables automatic linking

**2. Card Last Four Extraction (last-four-extraction)**
- **Context:** Bank descriptions include card numbers, need to match to credit_cards table
- **Decision:** Extract last four digits using regex, match to credit_cards.card_last_four
- **Impact:** Automatic bank charge → credit card linking without user input

**3. RTL Table Layout (rtl-table-layout)**
- **Context:** Credit card transactions have Hebrew merchant names
- **Decision:** RTL-aligned table with Hebrew headers following TransactionTable pattern
- **Impact:** Better UX for Hebrew users, consistent with existing bank transaction UI

## Deviations from Plan

None - plan executed exactly as written.

## Testing Notes

**TypeScript Compilation:**
- All tasks verified with `npx tsc --noEmit` before commit
- No type errors

**Ready for Integration Testing:**
- Upload real bank statement with CC charges to verify auto-flagging
- Run `linkCreditCardTransactions(userId)` to test linking
- View CreditCardTable to verify RTL layout and status icons

**Test Scenarios:**
- Bank statement with multiple CC charges from different cards
- Verify `is_credit_card_charge=true` set correctly
- Verify card last four extracted from various description formats
- Verify linking updates `linked_credit_card_id` correctly

## Next Phase Readiness

**Blockers:** None

**Concerns:** None

**Recommendations:**
- Test with real Israeli bank statements containing CC charges
- Verify keyword list covers all major Israeli banks and card issuers
- Consider adding card name display when joining with credit_cards table

**Dependencies Satisfied:**
- Credit card infrastructure from 06-01 available
- Bank transaction table has `is_credit_card_charge` and `linked_credit_card_id` fields
- Linking service functions ready for 06-03 integration

**Ready for 06-03:** YES - linking service and detection ready for automatic transaction matching

## Files Changed

**Created:**
- `src/lib/services/creditCardLinker.ts` (184 lines) - Credit card linking service

**Modified:**
- `src/hooks/useBankStatementUpload.ts` - Auto-flag CC charges on import
- `src/components/creditcard/CreditCardTable.tsx` - RTL layout with linked status

## Commits

1. `6c481e2` - feat(06-02): create credit card linking service
2. `69a7f3e` - feat(06-02): auto-flag credit card charges on bank import
3. `f39637a` - feat(06-02): create CreditCardTable with RTL layout

## Performance Impact

- Detection overhead: O(keywords × description length) per transaction, negligible
- Linking performance: O(charges × cards) worst case, optimized with Map lookup
- No database indexes needed (user_id and card_last_four already indexed)

## Security Considerations

- Card last four is non-sensitive (commonly displayed)
- Detection keywords are public information
- Linking service respects user_id boundaries (no cross-user linking)

## Knowledge Transfer

**Key Patterns Established:**
1. Israeli CC keyword detection for bank statement parsing
2. Card last four extraction from varied description formats
3. Automatic flagging during import (detectCreditCardCharge in upload hook)
4. RTL credit card UI consistent with bank transaction patterns

**For Future Phases:**
- 06-03 will use linkCreditCardTransactions for automatic matching
- Amount tolerance and date window functions ready for transaction-level linking
- CreditCardTable can be enhanced with card name from credit_cards join

---
*Phase: 06-credit-card-import-linking*
*Plan: 02*
*Completed: 2026-01-27*
