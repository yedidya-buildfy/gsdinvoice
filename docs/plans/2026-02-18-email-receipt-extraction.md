# Email Receipt Extraction - Design & Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Date**: 2026-02-18
**Status**: Approved

**Goal:** Add Gmail integration to automatically scan emails for receipts/invoices and feed them into the existing extraction pipeline. Similar to WellyBox.

**Architecture:** One new table (`email_connections`), two new columns on `files`, 6 Edge Functions for Gmail OAuth + sync + webhooks, frontend components for connection management and review. All receipt processing reuses existing `extract-invoice` pipeline.

**Tech Stack:** Supabase (Edge Functions/Deno, PostgreSQL, Storage, Realtime), Google Gmail API, OAuth2, TanStack Query, React, Tailwind CSS, HeroIcons.

---

## Part 1: Design

### Requirements

- **Gmail only** for v1 (Outlook/IMAP later)
- **Historical backfill**: scan past emails (user-selectable, default current year, max 2 years back)
- **Push + background sync**: Gmail Pub/Sub notifications for new emails + periodic backstop
- **Full coverage**: PDF/image attachments, HTML body receipts, and "Download Invoice" links
- **Auto-pipeline**: email receipts flow into existing extract-invoice + auto-match pipeline (respecting user settings)
- **Double-read classification**: two cheap AI calls to classify emails with real confidence scoring
- **Approval system**: users review email-sourced receipts before they're considered finalized
- **Paginated processing**: batched Edge Function invocations handle bulk historical scans without crashing

### High-Level Flow

```
User connects Gmail (OAuth2)
        |
        v
[gmail-start-sync] -- Gmail search with broad queries
        |               Paginates through results
        |               For each page: classify + download receipts
        |               Saves page_token to email_connections.sync_state
        v
[pg_cron every 1 min] -- Picks up from saved page_token
        |                  Processes next page of emails
        |                  For each receipt found:
        |                    - Upload to Supabase Storage
        |                    - Create files record (source='email')
        |                    - Trigger extract-invoice
        v
[Existing pipeline] -- AI extraction + matching + approval
        |               Uses existing files.retry_count, processing_started_at
        |               Uses existing invoices.is_approved, confidence_score

[gmail-webhook] -- Pub/Sub push for NEW emails (real-time, no queue)
[gmail-sync-backstop] -- Catches missed notifications (every 30 min)
```

### No Queue Table -- How It Works

Instead of a separate queue table, we reuse existing infrastructure:

1. **`email_connections.sync_state` (JSONB)**: tracks scan progress
   ```json
   {
     "status": "syncing",
     "total_emails_estimated": 2000,
     "current_page_token": "...",
     "receipts_found": 89,
     "emails_checked": 450,
     "started_at": "2026-02-18T14:00:00Z"
   }
   ```

2. **`files.email_message_id` (UNIQUE per team)**: idempotency key
3. **`files` existing columns**: `status`, `retry_count`, `max_retries`, `processing_started_at`, `file_hash`
4. **Processing flow per cron tick**: read page_token -> fetch page -> classify -> download receipts -> save new page_token

### 4-Stage Classification Pipeline

```
Stage A: Broad Gmail Search (high recall)
  - Keywords: receipt, invoice, order confirmation, payment,
    in Hebrew: חשבונית, קבלה, אישור תשלום
  - has:attachment filename:pdf/jpg/png
  - Known vendor domains
  - Include INBOX + Promotions
  - NEVER discard at this stage

Stage B: Rule-Based Scoring (fast, deterministic, 0-100)
  Positive: billing@/receipts@/noreply@ senders, PDF/image attachments,
    order/invoice number regex, total/tax/VAT keywords, known vendors,
    sender in "always_trust" list
  Negative: List-Unsubscribe + no transaction evidence, shipping-only
    notifications, marketing CTAs, sender in "always_ignore" list

Stage C: Double-Read AI Classification (for scores 6-94)
  - Rule score >= 95: auto-accept (skip AI)
  - Rule score <= 5: auto-reject
  - Middle zone: two parallel cheap AI calls
  - Cross-reference scoring:
    Type agreement: 30 pts | Vendor match: 15 pts | Amount match: 25 pts
    Date match: 15 pts | Has attachment/link: 15 pts
    Real confidence = points / 100

Stage D: Post-Extraction Validation
  - Extraction returns vendor + date + amount? -> confirmed
  - Auto-accept: confidence >= 90% AND extraction validates
  - Auto-reject: confidence <= 15%
  - Gray zone: shown to user as "needs review"
```

### Single Source of Truth

One `files` table is the single source for all documents regardless of origin.

**4-Layer Deduplication**:
1. `email_message_id` uniqueness -> same email never processed twice
2. `file_hash` (SHA-256) -> same bytes = same file regardless of source
3. Vendor + Invoice Number match (at invoice level)
4. Fingerprint (vendor + date + total + currency) for fuzzy match

**Conflict Resolution**: User-edited fields always win > higher confidence AI > never auto-overwrite

### Database Schema Changes

**1 New Table**: `email_connections`

```sql
CREATE TABLE email_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  provider TEXT NOT NULL DEFAULT 'gmail' CHECK (provider IN ('gmail')),
  email_address TEXT NOT NULL,
  access_token TEXT NOT NULL,          -- encrypted at rest
  refresh_token TEXT NOT NULL,         -- encrypted at rest
  token_expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT[] NOT NULL,
  last_history_id TEXT,                -- Gmail history cursor for delta sync
  last_sync_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'syncing', 'expired', 'revoked')),
  sync_state JSONB DEFAULT '{}',       -- progress tracking for historical scan
  sender_rules JSONB DEFAULT '[]',     -- [{domain, rule: "always_trust"|"always_ignore"}]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, email_address)
);
```

**2 New Columns on `files`**: `source` (upload/email) + `email_message_id`

### Edge Functions

1. `gmail-auth` -- OAuth initiation, returns redirect URL
2. `gmail-auth-callback` -- token exchange, stores encrypted tokens, redirects to app
3. `gmail-sync` -- historical scan + batch processor (paginated, cron-triggered)
4. `gmail-webhook` -- Pub/Sub push notification handler for new emails
5. `gmail-sync-backstop` -- catches missed notifications (every 30 min)
6. `gmail-renew-watch` -- renews Pub/Sub subscription (daily)

### pg_cron Jobs

- `gmail-sync-continue`: every 1 min (processes next page of historical scan)
- `gmail-sync-backstop`: every 30 min (catches missed push notifications)
- `gmail-renew-watch`: daily at 3 AM (renews Gmail watch subscription)

### Frontend

**New Components**: EmailConnectionsSection (Settings tab), EmailSyncProgress (global banner), EmailReviewQueue (InvoicesPage)
**Modified**: InvoiceFilters (+Source), DocumentTable (+Source column), Sidebar (+badge), SettingsPage (+Email tab)
**Hooks**: useEmailConnections, useEmailSyncProgress

### Security

- OAuth tokens encrypted at rest (AES-256)
- Refresh tokens never exposed to frontend
- RLS enforces team scoping; write restricted to team admins
- Gmail scope: `gmail.readonly` only
- Webhook validates Pub/Sub signatures
- Download links sandboxed (PDF/image content types only)

### What Changes Summary

| Category | Items |
|----------|-------|
| **New** | 1 table, 6 Edge Functions, 3 pg_cron jobs, 3 frontend components, 2 hooks |
| **Extended** | `files` table (+2 cols), DocumentTable, InvoiceFilters, SettingsPage, Sidebar |
| **Fully Reused** | `invoices`, `invoice_rows`, `extract-invoice`, Storage, file_hash dedup, auto-match, approval flow |

### Future Extensions

- Outlook/Microsoft 365 via Graph API
- IMAP for generic providers
- WhatsApp receipt scanning
- ML auto-learning from user feedback
- Auto-populate vendor aliases from email senders

---

## Part 2: Implementation Tasks

### Phase 1: Database & Types

#### Task 1: Database Migration -- email_connections table + files columns

**Files:**
- Create: `supabase/migrations/20260218100000_add_email_connections.sql`

**Step 1: Write migration**

```sql
-- Email connections: stores Gmail OAuth tokens and sync state per team
CREATE TABLE email_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  provider TEXT NOT NULL DEFAULT 'gmail' CHECK (provider IN ('gmail')),
  email_address TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT[] NOT NULL,
  last_history_id TEXT,
  last_sync_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'syncing', 'expired', 'revoked')),
  sync_state JSONB DEFAULT '{}',
  sender_rules JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, email_address)
);

CREATE INDEX idx_email_connections_team ON email_connections(team_id);
CREATE INDEX idx_email_connections_status ON email_connections(status)
  WHERE status IN ('active', 'syncing');

ALTER TABLE email_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view email connections"
  ON email_connections FOR SELECT
  USING (is_active_team_member(team_id));

CREATE POLICY "Team admins can insert email connections"
  ON email_connections FOR INSERT
  WITH CHECK (is_team_admin(team_id));

CREATE POLICY "Team admins can update email connections"
  ON email_connections FOR UPDATE
  USING (is_team_admin(team_id));

CREATE POLICY "Team admins can delete email connections"
  ON email_connections FOR DELETE
  USING (is_team_admin(team_id));

ALTER TABLE files ADD COLUMN source TEXT NOT NULL DEFAULT 'upload'
  CHECK (source IN ('upload', 'email'));

ALTER TABLE files ADD COLUMN email_message_id TEXT;

CREATE UNIQUE INDEX idx_files_email_message_id
  ON files(team_id, email_message_id)
  WHERE email_message_id IS NOT NULL;

CREATE INDEX idx_files_source ON files(source);
```

**Step 2:** Run `supabase db push`
**Step 3:** Run `supabase gen types typescript --local > src/types/database.generated.ts`
**Step 4:** Add to `src/types/database.ts`:

```typescript
export type EmailConnection = Database['public']['Tables']['email_connections']['Row']
export type EmailConnectionInsert = Database['public']['Tables']['email_connections']['Insert']
export type EmailConnectionUpdate = Database['public']['Tables']['email_connections']['Update']
```

**Step 5:** Run `npm run build` -- verify no errors
**Step 6:** Commit

---

### Phase 2: Gmail OAuth Edge Functions

#### Task 2: Gmail Auth Initiation Edge Function

**Files:** Create `supabase/functions/gmail-auth/index.ts`

```typescript
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
    const redirectUri = Deno.env.get('GOOGLE_REDIRECT_URI')

    if (!clientId || !redirectUri) {
      return new Response(
        JSON.stringify({ error: 'Gmail integration not configured' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { team_id } = await req.json()
    if (!team_id) {
      return new Response(
        JSON.stringify({ error: 'team_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const state = btoa(JSON.stringify({ team_id, user_id: user.id }))

    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ]

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
    })

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

    return new Response(
      JSON.stringify({ url: authUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('gmail-auth error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

Deploy: `supabase functions deploy gmail-auth`
Commit: `feat: add gmail-auth edge function for OAuth initiation`

#### Task 3: Gmail Auth Callback Edge Function

**Files:** Create `supabase/functions/gmail-auth-callback/index.ts`

Handles: code exchange for tokens, token encryption (AES-GCM), get user email, upsert to `email_connections`, redirect to app.

Key functions: `exchangeCodeForTokens()`, `getGmailUserInfo()`, `encryptToken()`

Deploy: `supabase functions deploy gmail-auth-callback`
Commit: `feat: add gmail-auth-callback edge function`

---

### Phase 3: Gmail Sync Edge Functions

#### Task 4: Gmail Sync Edge Function (core -- largest function)

**Files:** Create `supabase/functions/gmail-sync/index.ts`

**Sub-steps** (implement incrementally, ~500-800 lines total):
- 4a: Token management (decrypt AES-GCM, refresh via Google token endpoint)
- 4b: Gmail API helpers (search messages, get message, get attachment)
- 4c: Rule-based scoring engine (positive/negative signals, score 0-100)
- 4d: AI double-read classification (two parallel calls, cross-reference scoring)
- 4e: Content download (PDF attachments, HTML body conversion, download links)
- 4f: File creation (upload to Storage, create `files` record, trigger `extract-invoice`)
- 4g: Pagination + `sync_state` management (save page_token, update progress counts)
- 4h: Main handler (mode: start | continue, token refresh, error handling)

Deploy: `supabase functions deploy gmail-sync`
Commit: `feat: add gmail-sync edge function for email receipt scanning`

#### Task 5: Gmail Webhook Edge Function

**Files:** Create `supabase/functions/gmail-webhook/index.ts`

Handles: Pub/Sub signature validation, decode notification, Gmail History API delta, classification pipeline, single-email processing.

Deploy: `supabase functions deploy gmail-webhook`
Commit: `feat: add gmail-webhook edge function`

#### Task 6: Backstop + Watch Renewal Edge Functions

**Files:** Create `supabase/functions/gmail-sync-backstop/index.ts` + `supabase/functions/gmail-renew-watch/index.ts`

Backstop: Gmail History API with `last_history_id`, catches missed push notifications.
Watch renewal: `users.watch` API call for all active connections.

Deploy both. Commit: `feat: add gmail backstop and watch renewal edge functions`

#### Task 7: pg_cron Jobs Migration

**Files:** Create `supabase/migrations/20260218200000_add_email_sync_cron_jobs.sql`

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule('gmail-sync-continue', '* * * * *', ...);
SELECT cron.schedule('gmail-sync-backstop', '*/30 * * * *', ...);
SELECT cron.schedule('gmail-renew-watch', '0 3 * * *', ...);
```

Run: `supabase db push`
Commit: `feat: add pg_cron jobs for email sync processing`

---

### Phase 4: Frontend -- Email Connection Management

#### Task 8: useEmailConnections Hook

**Files:** Create `src/hooks/useEmailConnections.ts`

Exports: `useEmailConnections()`, `useConnectGmail()`, `useDisconnectGmail()`, `useStartEmailSync()`, `useUpdateSenderRules()`

Pattern: follows `useDocuments` -- TanStack Query with team-scoped keys, Supabase client.

Commit: `feat: add useEmailConnections hook`

#### Task 9: Email Connections Settings Tab

**Files:** Create `src/components/email/EmailConnectionsSection.tsx`, Modify `src/pages/SettingsPage.tsx`

Component: connected accounts list, "Connect Gmail" button, date range picker, sync/disconnect buttons, sender rules management, sync progress display.

SettingsPage changes: add `'email'` to `SettingsTabId`, add tab to array, render component, handle OAuth callback URL params.

Commit: `feat: add email connections settings tab`

---

### Phase 5: Frontend -- Source Filter & Column

#### Task 10: Add Source Filter to InvoiceFilters

**Files:** Modify `src/components/documents/invoiceFilterTypes.ts`, `InvoiceFilters.tsx`, `src/pages/InvoicesPage.tsx`

Add `source: 'all' | 'upload' | 'email'` to filter state. Add `SourceSelect` component (same pattern as `ApprovalStatusSelect`). Apply filter in `filteredDocuments` useMemo.

Commit: `feat: add source filter to invoices page`

#### Task 11: Add Source Column to DocumentTable

**Files:** Modify `src/types/columnVisibility.ts`, `src/components/documents/DocumentTable.tsx`

Add `'source'` to `DocumentColumnKey`. Show `ArrowUpTrayIcon` for upload, `EnvelopeIcon` for email.

Commit: `feat: add source column to document table`

---

### Phase 6: Frontend -- Sync Progress & Review Queue

#### Task 12: Email Sync Progress Banner

**Files:** Create `src/components/email/EmailSyncProgress.tsx`, Modify `src/components/layout/AppShell.tsx`

Global banner with Supabase Realtime subscription on `email_connections`. Shows progress, pause/cancel. Rendered above `<Outlet />` in AppShell.

Commit: `feat: add global email sync progress banner`

#### Task 13: Email Review Queue in InvoicesPage

**Files:** Create `src/components/email/EmailReviewQueue.tsx`, Modify `src/pages/InvoicesPage.tsx`

Collapsible section: email receipts pending approval, sorted by confidence. Actions: Approve, View, Dismiss, Mark as Not Receipt. Bulk approve high confidence.

Commit: `feat: add email receipt review queue`

#### Task 14: Sidebar Badge for Unreviewed Email Receipts

**Files:** Modify `src/components/layout/Sidebar.tsx`

Query count of unapproved email receipts. Show badge on "Invoices & Receipts" nav item.

Commit: `feat: add email receipt badge to sidebar`

---

### Phase 7: Integration Testing & Polish

#### Task 15: End-to-End Testing

1. Set up Google Cloud project + OAuth2 credentials + Pub/Sub topic
2. Configure env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY`, `APP_URL`, `GMAIL_PUBSUB_TOPIC`
3. Test full flow: connect -> sync -> progress -> review -> approve -> disconnect
4. Test push notifications + deduplication

#### Task 16: Final Build Verification

Run `npm run build` + `npm run lint`. Final commit.

---

## Environment Setup Checklist

```
GOOGLE_CLIENT_ID          -- from Google Cloud Console
GOOGLE_CLIENT_SECRET      -- from Google Cloud Console
GOOGLE_REDIRECT_URI       -- https://<project>.supabase.co/functions/v1/gmail-auth-callback
TOKEN_ENCRYPTION_KEY      -- generate: openssl rand -hex 32
APP_URL                   -- https://your-app-domain.com
GMAIL_PUBSUB_TOPIC        -- projects/<project>/topics/<topic>
```

Google Cloud setup:
1. Create project at console.cloud.google.com
2. Enable Gmail API
3. Create OAuth2 Web Application credentials
4. Add redirect URI pointing to gmail-auth-callback Edge Function
5. Configure OAuth consent screen (External, gmail.readonly scope)
6. Create Pub/Sub topic + subscription pointing to gmail-webhook Edge Function
