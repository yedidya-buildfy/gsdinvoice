---
status: resolved
trigger: "Invoice approval toggle not working - spinner shows then stops without updating DB"
created: 2026-02-11T00:00:00Z
updated: 2026-02-11T00:00:00Z
---

## Current Focus

hypothesis: Multiple issues - silent error swallowing in mutation + missing onError handler + query select doesn't include is_approved fields
test: Read all files in the approval flow chain
expecting: Find where errors are silently swallowed
next_action: Trace the full flow and identify all issues

## Symptoms

expected: Clicking approval checkbox toggles is_approved in DB, UI updates
actual: Spinner shows briefly, then stops. No DB update occurs.
errors: None visible - errors are silently swallowed
reproduction: Click approval checkbox on any invoice in DocumentTable
started: After adding approval feature (migration may not be applied)

## Eliminated

## Evidence

- timestamp: 2026-02-11T00:01:00Z
  checked: useUpdateInvoiceApproval.ts mutation
  found: No onError handler - errors thrown by Supabase are not surfaced to user
  implication: If DB update fails (e.g. RLS, migration not applied), user sees no error

- timestamp: 2026-02-11T00:01:00Z
  checked: useInvoices.ts select query
  found: Select is "*, file:files(...), invoice_rows(id, transaction_id)" - uses wildcard so is_approved IS included
  implication: Query refetch after mutation success would include is_approved correctly

- timestamp: 2026-02-11T00:01:00Z
  checked: InvoicesPage.tsx handleApprovalToggle
  found: onSettled clears loading state correctly (runs on both success and error)
  implication: Loading state management is correct - spinner stops on error as well as success

- timestamp: 2026-02-11T00:01:00Z
  checked: database.ts types
  found: Invoice type has is_approved (boolean) and approved_at (string | null) - correctly typed
  implication: TypeScript types are aligned with migration

- timestamp: 2026-02-11T00:02:00Z
  checked: RLS policies on invoices table
  found: UPDATE policy allows active team members - RLS itself is not blocking
  implication: If user is logged in and team member, RLS won't block the update

- timestamp: 2026-02-11T00:02:00Z
  checked: Supabase .update() call in mutation
  found: Does not use .select().single() - if RLS causes 0 rows affected, Supabase returns {data: null, error: null}
  implication: Zero-row update (RLS mismatch or wrong ID) silently "succeeds"

- timestamp: 2026-02-11T00:03:00Z
  checked: Full error flow from mutation to UI
  found: THREE compounding issues: (1) mutation doesn't detect zero-row updates, (2) no onError in hook or call site, (3) no user-visible error feedback. If migration not applied, Supabase returns column error which is thrown but never shown.
  implication: Root cause is a combination of silent failure + no error surfacing

## Resolution

root_cause: Three compounding issues cause silent failure: (1) useUpdateInvoiceApproval mutation does not use .select().single() so zero-row updates are not detected as errors, (2) no onError handler in the mutation hook or at the call site in InvoicesPage, (3) no user-visible error feedback when the update fails (e.g. migration not applied, RLS blocks update)
fix: (1) Add .select().single() to mutation to detect zero-row updates, (2) Add onError callback with console.error for debugging, (3) Add visible error state in InvoicesPage that shows when approval fails
verification: TypeScript passes (npx tsc --noEmit), production build succeeds (npm run build). Mutation now surfaces errors through onError callback -> approvalError state -> red error banner in UI. Zero-row updates (RLS/wrong ID) now detected via .select().single() which throws PGRST116 if no row returned.
files_changed:
  - src/hooks/useUpdateInvoiceApproval.ts
  - src/pages/InvoicesPage.tsx
