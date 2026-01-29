# CC-Bank Charge Link Feature Plan

## Overview
Connect credit card movements to bank statement CC charges ("חיוב לכרטיס ויזה xxxx") with visual indicators and management UI.

## Data Model Understanding

**Two tables store CC transaction data:**
1. `transactions` - Used for CC page display (joined with `credit_cards`)
2. `credit_card_transactions` - Used for CC-Bank matching (has `bank_transaction_id` FK)

**Linking strategy:** Both tables have a `hash` field. We can JOIN them to get `bank_transaction_id` for display.

**Existing matching infrastructure:**
- `cc_bank_match_results` - Stores match metadata (amounts, discrepancy, status)
- `useCCBankMatchResults` - Hook for fetching match data with details
- Bank transactions with `is_credit_card_charge=true` are CC charge rows

---

## Tasks

### Task 1: Extend CC Query with Bank Link Info
**Files**: `src/hooks/useCreditCards.ts`

**Changes to `fetchCreditCardTransactions`:**
- Add LEFT JOIN to `credit_card_transactions` table via hash field
- Include `bank_transaction_id` in the returned data

**SQL approach:**
```sql
SELECT t.*,
       cc.bank_transaction_id as cc_bank_link_id
FROM transactions t
LEFT JOIN credit_card_transactions cc ON t.hash = cc.hash AND t.user_id = cc.user_id
WHERE t.is_credit_card_charge = false
  AND t.linked_credit_card_id IS NOT NULL
```

**Update `TransactionWithCard` interface:**
```typescript
export interface TransactionWithCard extends Transaction {
  credit_card?: { ... } | null
  cc_bank_link_id?: string | null  // NEW: bank_transaction_id from credit_card_transactions
}
```

**Verification:**
1. Build passes: `npm run build`
2. Use Supabase MCP to verify query returns correct data
3. Console log in hook shows `cc_bank_link_id` populated for matched rows

**On Complete**: Remove console.log, mark task done.

---

### Task 2: Add Link Column to CC Table
**Files**: `src/components/creditcard/CreditCardTable.tsx`

**Changes:**
- Add "Link" column header after "Status" column
- For each row, show clickable link icon if `cc_bank_link_id` exists
- On click, call `onBankChargeClick(cc_bank_link_id)` callback prop
- Add optional prop: `onBankChargeClick?: (bankTransactionId: string) => void`
- Use `LinkIcon` from heroicons/24/outline

**Verification:**
1. Build passes: `npm run build`
2. Manual: CC table shows link icon for matched transactions
3. Manual: Click icon logs bank_transaction_id to console

**On Complete**: Remove test console.log, mark task done.

---

### Task 3: Create CC Charge Details Modal
**Files**: New `src/components/bank/CCChargeModal.tsx`

**Props:**
```typescript
interface CCChargeModalProps {
  isOpen: boolean
  onClose: () => void
  bankTransactionId: string | null
}
```

**Features:**
1. Fetch match result by finding `cc_bank_match_results` where `bank_transaction_id` matches
2. Fetch linked CC transactions from `credit_card_transactions` where `bank_transaction_id` matches
3. Header shows:
   - Date range: min to max `transaction_date` from CC transactions
   - Match amount: `total_cc_amount / bank_amount * 100`
   - Display: `XXX/YYY ILS (ZZ%)`
4. Simple table of CC transactions: date, merchant, amount

**Use Modal pattern from `VatChangeModal.tsx`:**
```typescript
<Modal.Overlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
  <Modal.Content>
    <Modal.Title>...</Modal.Title>
    ...
  </Modal.Content>
</Modal.Overlay>
```

**Verification:**
1. Build passes: `npm run build`
2. Import modal in DashboardPage and test with hardcoded bankTransactionId
3. Modal displays data correctly

**On Complete**: Remove test code, mark task done.

---

### Task 4: Make Bank CC Charges Clickable + Wire Modal
**Files**:
- `src/components/bank/TransactionTable.tsx`
- `src/pages/DashboardPage.tsx`

**TransactionTable changes:**
- Detect CC charge rows: `tx.is_credit_card_charge === true`
- Style description as clickable (underline, cursor-pointer, text-primary on hover)
- On click, call `onCCChargeClick(tx.id)` callback prop
- Add optional prop: `onCCChargeClick?: (transactionId: string) => void`

**DashboardPage changes:**
- Add state: `selectedCCChargeId: string | null`
- Pass `onCCChargeClick` to TransactionTable
- Pass `onBankChargeClick` to CreditCardTable (opens same modal)
- Render `CCChargeModal` with `isOpen={!!selectedCCChargeId}`

**Verification:**
1. Build passes: `npm run build`
2. Manual: Click CC charge row in bank table opens modal
3. Manual: Click link icon in CC table opens same modal
4. Manual: Close modal works from both sources

**On Complete**: Mark task done.

---

### Task 5: Add Disconnect/Attach Controls to Modal
**Files**:
- `src/components/bank/CCChargeModal.tsx`
- `src/hooks/useCCBankMatchResults.ts`

**Disconnect feature:**
- Add checkbox per CC transaction row
- "Disconnect Selected" button below table
- Use existing `useUnmatchCCTransactions` hook
- After disconnect, refetch modal data

**Attach new feature:**
- Expandable "Attach Transactions" section (collapsed by default)
- Filters:
  - Date range picker (from/to)
  - "Unmatched only" checkbox (default: checked)
- Fetch unmatched CC transactions via new hook
- Simple selectable list
- "Attach Selected" button

**New hook in `useCCBankMatchResults.ts`:**
```typescript
export function useAttachCCTransactions() {
  // Mutation that:
  // 1. Updates credit_card_transactions.bank_transaction_id for selected rows
  // 2. Recalculates cc_bank_match_results totals (sum amounts, count, discrepancy)
}
```

**Verification:**
1. Build passes: `npm run build`
2. Manual: Disconnect works, CC list updates
3. Manual: Attach section shows filtered transactions
4. Manual: Attach works, totals update
5. Verify DB state via Supabase MCP

**On Complete**: Mark task done.

---

## Agent Execution Protocol

### Before Starting Each Task:
1. Read this plan and all referenced files
2. Understand existing patterns (hooks, components, types)
3. Make MINIMAL changes - do NOT refactor unrelated code

### After Completing Each Task:
1. Run `npm run build` - must pass with zero errors
2. Run manual verification steps listed
3. DELETE any temporary test code (console.logs, test components)
4. Update Progress Tracker below: change `[ ]` to `[x]`

### Supabase MCP Usage:
- `mcp__supabase__execute_sql` - Test queries, verify data
- `mcp__supabase__list_tables` - Verify schema
- Do NOT create migrations unless schema changes required

### Code Standards:
- Use existing component patterns from codebase
- Use `@heroicons/react/24/outline` for icons
- Follow existing TypeScript types exactly
- No emojis in code or UI
- Keep components small and focused
- Use `cx()` utility for conditional classes

---

## Progress Tracker

- [x] Task 1: Extend CC Query with Bank Link Info
- [x] Task 2: Add Link Column to CC Table
- [x] Task 3: Create CC Charge Details Modal
- [x] Task 4: Make Bank CC Charges Clickable + Wire Modal
- [x] Task 5: Add Disconnect/Attach Controls to Modal
