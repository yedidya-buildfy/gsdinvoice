---
status: fixing
trigger: "Debug why bank statement upload doesn't show transactions in the table."
created: 2026-01-27T10:00:00Z
updated: 2026-01-27T10:16:00Z
---

## Current Focus

hypothesis: CONFIRMED - .single() throws error causing all inserts to be skipped
test: Changed .single() to .maybeSingle() and added comprehensive logging
expecting: Transactions will insert successfully and appear in table after refetch
next_action: User needs to test the upload to verify fix works

## Symptoms

expected: After uploading bank file, transactions should appear in the table
actual: User uploads bank file but no transactions appear in the table
errors: Unknown (need to investigate)
reproduction: Upload a bank file from samples/ directory
started: Current issue (detected now)

## Eliminated

## Evidence

- timestamp: 2026-01-27T10:05:00Z
  checked: useBankStatementUpload.ts flow
  found: Uses 'transactions' table for both duplicate check (line 72) and insert (line 101). Matches database.ts schema.
  implication: Table name is correct

- timestamp: 2026-01-27T10:06:00Z
  checked: useTransactions.ts query
  found: Fetches from 'transactions' table (line 15) with user_id filter
  implication: Query is looking at correct table

- timestamp: 2026-01-27T10:07:00Z
  checked: BankMovementsPage.tsx integration
  found: Calls refetch() on upload complete (line 75)
  implication: Refetch mechanism is in place

- timestamp: 2026-01-27T10:08:00Z
  checked: Column names in TransactionInsert
  found: Uses snake_case (amount_agorot, balance_agorot, value_date) matching database.ts schema
  implication: Column names match database schema

- timestamp: 2026-01-27T10:10:00Z
  checked: Added comprehensive logging
  found: Added console.log to trace parsing → inserting → fetching flow
  implication: Need user to test upload and provide console output

- timestamp: 2026-01-27T10:15:00Z
  checked: Duplicate check in useBankStatementUpload line 72-77
  found: Uses .single() which throws error when no row found. This error is caught by try-catch on line 67, causing continue without insert
  implication: ALL transactions are being skipped because duplicate check throws error

## Resolution

root_cause: Line 77 uses .single() which throws error when no matching row exists. Since all transactions are new on first upload, duplicate check throws error for each one, caught by try-catch, causing continue statement that skips the insert. Result: zero transactions inserted.
fix: Change .single() to .maybeSingle() which returns null when no row found instead of throwing error
verification: Upload bank file, verify transactions appear in table
files_changed: ['src/hooks/useBankStatementUpload.ts']

root_cause:
fix:
verification:
files_changed: []
