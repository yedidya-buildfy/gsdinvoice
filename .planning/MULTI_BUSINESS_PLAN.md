# Multi-Business Implementation Plan

## Overview

Transform the app from a personal tool to a multi-business system where:
- Users can create multiple businesses
- Users can invite others to their businesses via email
- Users can toggle between businesses they belong to
- All data (CC, bank, files, invoices) is scoped to businesses
- Subscriptions remain user-level (controls how many businesses a user can create)
- Auto-create "Personal" business on signup

## Current State

The team infrastructure already exists but needs refinement:
- ✅ `teams` table exists (will rename to "business" in UI only)
- ✅ `team_members` with roles (owner/admin/member/viewer)
- ✅ `team_invitations` with email tokens
- ✅ TeamContext with switching mechanism
- ✅ RLS policies for data isolation
- ❌ Data hooks don't filter by `team_id`
- ❌ Query keys don't include `currentTeam?.id`
- ❌ UI says "Team" instead of "Business"

## Decision Summary

| Decision | Choice |
|----------|--------|
| Subscriptions | Per-user (limits how many businesses user can create) |
| Data scoping | All data scoped by business_id (team_id in DB) |
| Default business | Auto-create "Personal" on signup |
| DB column naming | Keep `team_id` in database, rename only in UI |

---

## Implementation Phases

### Phase 1: Database & Migration Updates
**Effort: Medium | Risk: Low**

#### 1.1 Add business creation limits to subscriptions
```sql
-- Add max_businesses column to plan_limits
ALTER TABLE plan_limits ADD COLUMN max_businesses INTEGER DEFAULT 1;

-- Update existing plans
UPDATE plan_limits SET max_businesses = 1 WHERE plan_tier = 'free';
UPDATE plan_limits SET max_businesses = 3 WHERE plan_tier = 'pro';
UPDATE plan_limits SET max_businesses = 10 WHERE plan_tier = 'business';
```

#### 1.2 Create RPC function to check business creation limit
```sql
CREATE OR REPLACE FUNCTION can_create_business()
RETURNS BOOLEAN AS $$
DECLARE
  user_plan TEXT;
  max_allowed INTEGER;
  current_count INTEGER;
BEGIN
  -- Get user's plan
  SELECT plan_tier INTO user_plan FROM subscriptions WHERE user_id = auth.uid();

  -- Get limit for plan
  SELECT max_businesses INTO max_allowed FROM plan_limits WHERE plan_tier = COALESCE(user_plan, 'free');

  -- Count user's owned businesses
  SELECT COUNT(*) INTO current_count FROM teams WHERE owner_id = auth.uid();

  RETURN current_count < max_allowed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### 1.3 Ensure auto-creation of Personal business on signup
- Verify the existing trigger/function `create_personal_team` works
- Update to name it "Personal" instead of "{name}'s Team"

---

### Phase 2: Update Data Hooks for Business Scoping
**Effort: High | Risk: Medium**

These hooks need `team_id` filtering and query key updates:

| Hook | File | Changes Needed |
|------|------|----------------|
| useTransactions | `src/hooks/useTransactions.ts` | Add `.eq('team_id', teamId)` + query key |
| useInvoices | `src/hooks/useInvoices.ts` | Add `.eq('team_id', teamId)` + query key |
| useCreditCards | `src/hooks/useCreditCards.ts` | Add `.eq('team_id', teamId)` + query key |
| useDocuments | `src/hooks/useDocuments.ts` | Add `.eq('team_id', teamId)` + query key |
| useCCBankMatchResults | `src/hooks/useCCBankMatchResults.ts` | Add `.eq('team_id', teamId)` + query key |
| useMerchantVatPreferences | `src/hooks/useMerchantVatPreferences.ts` | Add `.eq('team_id', teamId)` + query key |

#### Pattern to Follow (from useVendorAliases):
```typescript
export function useTransactions(filters?: TransactionFilters) {
  const { user } = useAuth()
  const { currentTeam } = useTeam()  // ADD THIS

  return useQuery({
    queryKey: ['transactions', user?.id, currentTeam?.id, filters],  // ADD team
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user!.id)

      // ADD: Business scoping
      if (currentTeam?.id) {
        query = query.eq('team_id', currentTeam.id)
      } else {
        query = query.is('team_id', null)  // Personal/legacy data
      }

      // ... rest of filters
      return query
    },
    enabled: !!user?.id && !!currentTeam  // ADD team check
  })
}
```

#### Also update mutation hooks to set team_id on insert:
- `useCreateTransaction`
- `useCreateInvoice`
- `useUploadFile`
- `useCreateCreditCard`
- etc.

---

### Phase 3: UI Rename "Team" → "Business"
**Effort: Low | Risk: Low**

Files to update (string changes only):

| File | Changes |
|------|---------|
| `src/components/team/TeamSwitcher.tsx` | "Switch team" → "Switch business" |
| `src/components/team/CreateTeamModal.tsx` | "Create team" → "Create business" |
| `src/components/team/TeamMemberList.tsx` | "Team members" → "Business members" |
| `src/components/team/InviteMemberModal.tsx` | "Invite to team" → "Invite to business" |
| `src/pages/SettingsPage.tsx` | Team settings section labels |
| `src/contexts/TeamContext.tsx` | Error messages only |

**Note:** Keep internal variable names as `team` - only change user-facing strings.

---

### Phase 4: Business Creation Flow
**Effort: Medium | Risk: Low**

#### 4.1 Update CreateTeamModal to check limits
```typescript
const { data: canCreate } = useQuery({
  queryKey: ['can-create-business', user?.id],
  queryFn: () => supabase.rpc('can_create_business')
})

// Show upgrade prompt if limit reached
if (!canCreate) {
  return <UpgradePrompt message="Upgrade to create more businesses" />
}
```

#### 4.2 Update personal business creation
- In `TeamContext.tsx`, change `createPersonalTeam` to use name "Personal"
- Ensure it's created immediately on first login

---

### Phase 5: Verify Email Invitation System
**Effort: Low | Risk: Medium**

#### 5.1 Check edge function exists
- Verify `supabase/functions/send-team-invite/index.ts` exists and works
- Test invitation email delivery

#### 5.2 Update invitation email copy
- Change "team" to "business" in email templates

---

### Phase 6: Data Migration (Optional)
**Effort: Medium | Risk: High**

For existing users with `team_id = NULL` data:

```sql
-- Migrate legacy data to user's personal business
UPDATE files
SET team_id = (SELECT id FROM teams WHERE owner_id = files.user_id LIMIT 1)
WHERE team_id IS NULL;

-- Repeat for: invoices, transactions, credit_cards, etc.
```

**Decision needed:** Run migration now or let RLS handle legacy data?

---

## Agent Execution Plan

### Total Agents: 6 parallel waves

```
┌─────────────────────────────────────────────────────────────────┐
│  WAVE 1: Database & Infrastructure (2 agents in parallel)      │
├─────────────────────────────────────────────────────────────────┤
│  Agent 1: Migration Agent                                       │
│  - Create migration for max_businesses in plan_limits          │
│  - Create can_create_business() RPC function                   │
│  - Update personal team creation to use "Personal" name        │
│  Files: supabase/migrations/20260205*.sql                      │
│                                                                 │
│  Agent 2: Send-Invite Edge Function Check                      │
│  - Verify send-team-invite function exists                     │
│  - Create if missing                                           │
│  - Test locally                                                │
│  Files: supabase/functions/send-team-invite/                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  WAVE 2: Data Hooks Update (3 agents in parallel)              │
├─────────────────────────────────────────────────────────────────┤
│  Agent 3: Transaction & Bank Hooks                             │
│  - useTransactions.ts                                          │
│  - useCCBankMatchResults.ts                                    │
│  - Add team_id filtering + query keys                          │
│  - Update mutation hooks to set team_id                        │
│                                                                 │
│  Agent 4: Invoice & Document Hooks                             │
│  - useInvoices.ts                                              │
│  - useDocuments.ts (useFiles)                                  │
│  - Add team_id filtering + query keys                          │
│  - Update mutation hooks to set team_id                        │
│                                                                 │
│  Agent 5: Credit Card & Settings Hooks                         │
│  - useCreditCards.ts                                           │
│  - useMerchantVatPreferences.ts                                │
│  - useUserSettings.ts (if team-scoped)                         │
│  - Add team_id filtering + query keys                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  WAVE 3: UI Updates (1 agent)                                  │
├─────────────────────────────────────────────────────────────────┤
│  Agent 6: UI String Replacement                                │
│  - Rename all "Team" → "Business" in user-facing strings       │
│  - Update CreateTeamModal with limit checking                  │
│  - Update TeamContext error messages                           │
│  - Update Settings page labels                                 │
│  Files: src/components/team/*, src/pages/SettingsPage.tsx      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  WAVE 4: Testing & Verification (orchestrator)                 │
├─────────────────────────────────────────────────────────────────┤
│  Main Agent (me):                                              │
│  - Verify all changes compile (npm run build)                  │
│  - Test team switching invalidates queries                     │
│  - Verify RLS still works                                      │
│  - Create final commit                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files Changed Summary

### Database (2 files)
- `supabase/migrations/20260205100000_add_business_limits.sql` (NEW)
- `supabase/functions/send-team-invite/index.ts` (VERIFY/CREATE)

### Hooks (6-8 files)
- `src/hooks/useTransactions.ts`
- `src/hooks/useInvoices.ts`
- `src/hooks/useDocuments.ts`
- `src/hooks/useCreditCards.ts`
- `src/hooks/useCCBankMatchResults.ts`
- `src/hooks/useMerchantVatPreferences.ts`
- Plus any mutation hooks in these files

### UI Components (5-6 files)
- `src/components/team/TeamSwitcher.tsx`
- `src/components/team/CreateTeamModal.tsx`
- `src/components/team/TeamMemberList.tsx`
- `src/components/team/InviteMemberModal.tsx`
- `src/pages/SettingsPage.tsx`
- `src/contexts/TeamContext.tsx`

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Query breaking for legacy data | Medium | High | RLS allows `team_id IS NULL` |
| Team switch doesn't refresh | Low | Medium | Query keys include team ID |
| Invitation emails fail | Low | Low | Non-blocking, shows copy link |
| Performance impact | Low | Low | Existing indexes on team_id |

---

## Success Criteria

- [ ] User can create a new business (respecting plan limits)
- [ ] User can switch between businesses in header dropdown
- [ ] Switching business shows only that business's data
- [ ] User can invite others via email to their business
- [ ] Invited user sees the business after accepting
- [ ] New signups get "Personal" business automatically
- [ ] All data created goes to current business
- [ ] Build passes (`npm run build`)

---

## Estimated Timeline

| Phase | Agents | Parallel? |
|-------|--------|-----------|
| Phase 1: DB Migration | 2 | Yes |
| Phase 2: Hook Updates | 3 | Yes |
| Phase 3: UI Rename | 1 | After Phase 2 |
| Phase 4: Testing | 1 | After Phase 3 |

**Total: 6 agents, 4 sequential waves**
