# Architecture Patterns

**Domain:** VAT/Invoice Document Management with AI Extraction
**Researched:** 2026-01-27
**Overall Confidence:** HIGH

## Recommended Architecture

```
+------------------+      +------------------+      +------------------+
|                  |      |                  |      |                  |
|   React SPA      |<---->|   Supabase       |<---->|   Vertex AI      |
|   (Frontend)     |      |   (Backend)      |      |   (Processing)   |
|                  |      |                  |      |                  |
+------------------+      +------------------+      +------------------+
        |                         |                         |
        v                         v                         v
+------------------+      +------------------+      +------------------+
| - Upload UI      |      | - Auth           |      | - Gemini 3 Flash |
| - Dashboard      |      | - PostgreSQL     |      | - Doc Understanding|
| - Matching UI    |      | - Storage        |      | - Field Extraction|
| - State Mgmt     |      | - Edge Functions |      |                  |
+------------------+      +------------------+      +------------------+
```

This is a **three-tier architecture** optimized for document processing workflows:

1. **Presentation Layer** (React SPA): User interface, state management, file upload orchestration
2. **Application Layer** (Supabase): Authentication, database, file storage, serverless compute
3. **AI Processing Layer** (Vertex AI): Document understanding, field extraction, matching intelligence

### Component Boundaries

| Component | Responsibility | Communicates With | Build Phase |
|-----------|---------------|-------------------|-------------|
| **React SPA** | UI rendering, user interactions, upload orchestration, state | Supabase (REST/Realtime), Storage (signed URLs) | Phase 1-2 |
| **Supabase Auth** | User authentication, session management, JWT tokens | React (SDK), PostgreSQL (RLS) | Phase 1 |
| **Supabase Storage** | File storage (PDFs, images, xlsx, csv), signed URLs | React (upload), Edge Functions (read) | Phase 2 |
| **PostgreSQL** | Relational data, JSONB for extracted fields, queue state | All components via RLS policies | Phase 1-3 |
| **Edge Functions** | Orchestration, API calls to Vertex AI, queue processing | Storage, PostgreSQL, Vertex AI | Phase 3-4 |
| **Vertex AI / Gemini** | Document understanding, field extraction, matching logic | Edge Functions (REST API) | Phase 3-4 |

### Data Flow

```
[User Upload]
    |
    v
[React: File Validation] --> [Supabase Storage: Upload via Signed URL]
    |
    v
[PostgreSQL: Create document record, status='pending']
    |
    v
[Edge Function: Poll/Trigger picks up pending document]
    |
    v
[Vertex AI: Gemini 3 Flash extracts fields]
    |
    v
[PostgreSQL: Store extracted_data JSONB, status='extracted']
    |
    v
[Matching Engine: Compare against transactions]
    |
    v
[PostgreSQL: Create match records with confidence scores]
    |
    v
[React: Display matches for review]
```

## Core Components Detail

### 1. Document Upload & Storage

**Architecture Pattern:** Direct-to-Storage with Signed URLs

```
React App
    |
    | 1. Request signed upload URL
    v
Edge Function / Supabase Auth
    |
    | 2. Generate time-limited URL (2 hour expiry)
    v
React App
    |
    | 3. Upload directly to Storage (bypass server)
    v
Supabase Storage
    |
    | 4. Trigger: Insert document record
    v
PostgreSQL (documents table)
```

**Why this pattern:**
- Client uploads directly to storage (no server bottleneck)
- Signed URLs provide security without exposing credentials
- Supports resumable uploads for large files via TUS protocol
- Progress tracking handled client-side with axios/fetch callbacks

**Supported file types and routing:**
| File Type | Storage Bucket | Processing Path |
|-----------|----------------|-----------------|
| PDF | `invoices` | Vertex AI Document Understanding |
| Images (jpg, png, heic) | `invoices` | Vertex AI Multimodal |
| Excel (.xlsx) | `statements` | Edge Function: xlsx parser |
| CSV (.csv) | `statements` | Edge Function: csv parser |

### 2. Processing Queue

**Architecture Pattern:** Database-Backed Job Queue with Polling

```sql
-- documents table acts as queue
CREATE TABLE documents (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  storage_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending | processing | extracted | failed
  extracted_data JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- Index for queue polling
CREATE INDEX idx_documents_pending ON documents(status, created_at)
  WHERE status = 'pending';
```

**Why database queue over message queue:**
- Simpler architecture (no RabbitMQ/Redis to manage)
- Transactional guarantees with PostgreSQL
- Natural fit with Supabase Edge Functions
- Adequate for expected volume (< 10k documents/day)
- Built-in audit trail (every state change is a row)

**Polling vs Webhooks consideration:**
For this use case, **polling is recommended**. If 100 users upload files simultaneously, webhook-triggered Edge Functions would spawn 100 concurrent executions, potentially hitting Vertex AI rate limits. Polling with a single worker processes sequentially with controlled throughput.

```typescript
// Edge Function: process-documents
// Runs on cron (every 30 seconds) or manual trigger
const { data: pending } = await supabase
  .from('documents')
  .select('*')
  .eq('status', 'pending')
  .order('created_at', { ascending: true })
  .limit(5); // Batch size

for (const doc of pending) {
  await supabase.from('documents')
    .update({ status: 'processing' })
    .eq('id', doc.id);

  try {
    const extracted = await processWithVertexAI(doc);
    await supabase.from('documents')
      .update({
        status: 'extracted',
        extracted_data: extracted,
        processed_at: new Date()
      })
      .eq('id', doc.id);
  } catch (error) {
    await supabase.from('documents')
      .update({ status: 'failed', error_message: error.message })
      .eq('id', doc.id);
  }
}
```

### 3. AI Document Extraction

**Architecture Pattern:** Vertex AI Gemini 3 Flash with Structured Output

```
[Document Bytes]
    |
    v
[Gemini 3 Flash Document Understanding API]
    |
    | Prompt: Extract invoice fields as JSON
    v
[Structured JSON Response]
    |
    | Validate against schema
    v
[PostgreSQL: Store in extracted_data JSONB]
```

**Gemini 3 Flash capabilities leveraged:**
- Native PDF understanding (no OCR pre-processing needed)
- Multimodal: handles images, scanned documents
- 1M token context window for multi-page documents
- Structured output with JSON schema enforcement
- Hebrew text support for Israeli documents

**Extraction schema for invoices:**
```typescript
interface ExtractedInvoice {
  vendor_name: string;
  invoice_number: string | null;
  invoice_date: string; // ISO date
  due_date: string | null;
  total_amount: number;
  currency: 'ILS' | 'USD' | 'EUR';
  vat_amount: number | null;
  line_items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
  }>;
  confidence: number; // 0-1
  raw_text: string; // For debugging/search
}
```

**Why Gemini 3 Flash over traditional OCR:**
- LLMs understand context, not just characters
- Handles varied layouts without templates
- Extracts semantic meaning (vendor name vs address)
- Single API call replaces OCR + parsing pipeline
- 50% cheaper with batch processing option

### 4. Statement Parsing (Excel/CSV)

**Architecture Pattern:** Edge Function with Streaming Parser

Israeli bank/credit card statements have predictable columnar structure. No AI needed - deterministic parsing.

```typescript
// Bank statement schema (Israeli format)
interface BankTransaction {
  date: Date;
  value_date: Date;
  description: string;
  reference: string | null;
  debit: number | null;  // חובה
  credit: number | null; // זכות
  balance: number;
  channel: string | null;
}

// Credit card schema (Israeli format)
interface CreditCardTransaction {
  transaction_date: Date;
  merchant_name: string;
  amount_ils: number;
  amount_original: number | null;
  original_currency: string | null;
  card_last_four: string;
  charge_date: Date;
  transaction_type: string;
  notes: string | null;
}
```

**Parser architecture:**
```
[Excel/CSV File]
    |
    v
[Edge Function: detect-format]
    |
    | Identify bank/card type from headers
    v
[Edge Function: parse-statement]
    |
    | Map columns to schema
    | Handle Hebrew column names
    | Parse dates (DD/MM/YYYY Israeli format)
    | Normalize amounts (remove commas, handle negatives)
    v
[PostgreSQL: Insert transactions]
    |
    | Duplicate detection (date + amount + description hash)
    v
[Return: { inserted: N, duplicates: [...] }]
```

### 5. Matching Engine

**Architecture Pattern:** Multi-Stage Matching with Confidence Scoring

```
[Unmatched Invoices] + [Unmatched Transactions]
    |
    v
[Stage 1: Exact Match]
    |
    | Same amount, same date
    v
[Stage 2: Fuzzy Date Match]
    |
    | Same amount, date within 7 days
    v
[Stage 3: Fuzzy Amount Match]
    |
    | Amount within 2%, similar date
    v
[Stage 4: AI Semantic Match]
    |
    | Gemini: "Does invoice X match transaction Y?"
    v
[Confidence Scoring]
    |
    | HIGH (>0.9): Auto-match
    | MEDIUM (0.7-0.9): Flag for review
    | LOW (<0.7): No match suggested
    v
[PostgreSQL: matches table]
```

**Match record structure:**
```sql
CREATE TABLE matches (
  id UUID PRIMARY KEY,
  invoice_id UUID REFERENCES documents,
  transaction_id UUID REFERENCES bank_transactions,
  confidence DECIMAL(3,2) NOT NULL,
  match_type TEXT NOT NULL, -- exact_amount | fuzzy_date | ai_semantic
  status TEXT DEFAULT 'suggested', -- suggested | confirmed | rejected
  confirmed_by UUID REFERENCES auth.users,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Credit card charge linking:**
Special case: "ישראכרט" entries in bank statements represent credit card charges.
```sql
-- Link bank charge to credit card transactions
CREATE TABLE credit_card_charges (
  bank_transaction_id UUID REFERENCES bank_transactions,
  charge_date DATE NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  card_transactions UUID[] -- Array of credit_card_transactions IDs
);
```

### 6. React SPA Architecture

**Pattern:** Feature-Based Organization with TanStack Query

```
src/
├── features/
│   ├── auth/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── pages/
│   ├── dashboard/
│   │   ├── components/
│   │   │   ├── UnmatchedSummary.tsx
│   │   │   └── RecentActivity.tsx
│   │   └── pages/
│   ├── documents/
│   │   ├── components/
│   │   │   ├── FileUploader.tsx
│   │   │   ├── DocumentList.tsx
│   │   │   └── ExtractionPreview.tsx
│   │   ├── hooks/
│   │   │   ├── useUpload.ts
│   │   │   └── useDocuments.ts
│   │   └── pages/
│   ├── transactions/
│   │   ├── components/
│   │   │   ├── TransactionTable.tsx
│   │   │   └── ImportWizard.tsx
│   │   └── hooks/
│   ├── matching/
│   │   ├── components/
│   │   │   ├── MatchReview.tsx
│   │   │   └── ConfidenceIndicator.tsx
│   │   └── hooks/
│   └── settings/
├── shared/
│   ├── components/
│   │   ├── Layout/
│   │   ├── Table/
│   │   └── DateRangePicker/
│   ├── hooks/
│   │   └── useSupabase.ts
│   └── utils/
├── lib/
│   ├── supabase.ts
│   └── queryClient.ts
└── App.tsx
```

**State management strategy:**
| State Type | Solution | Example |
|------------|----------|---------|
| Server state | TanStack Query | Documents list, transactions, matches |
| UI state | React useState/useReducer | Modal open, selected rows |
| Form state | React Hook Form | Upload forms, settings |
| Global client state | Zustand (if needed) | Upload queue, notifications |

**TanStack Query for server state:**
```typescript
// useDocuments.ts
export function useDocuments() {
  return useQuery({
    queryKey: ['documents'],
    queryFn: () => supabase.from('documents').select('*'),
    staleTime: 30_000, // 30 seconds
  });
}

// useUploadDocument.ts
export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      // 1. Get signed URL
      // 2. Upload to storage
      // 3. Create document record
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}
```

**Upload progress tracking (outside TanStack Query):**
```typescript
// Upload progress is local state, not server state
const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

const uploadFile = async (file: File) => {
  const fileId = crypto.randomUUID();

  await axios.put(signedUrl, file, {
    onUploadProgress: (event) => {
      const progress = Math.round((event.loaded * 100) / event.total);
      setUploadProgress(prev => ({ ...prev, [fileId]: progress }));
    }
  });
};
```

## Database Schema Overview

```sql
-- Core tables
auth.users (managed by Supabase Auth)

-- Documents and extraction
documents (
  id, user_id, storage_path, file_type,
  status, extracted_data JSONB,
  created_at, processed_at
)

-- Financial transactions
bank_transactions (
  id, user_id, date, value_date, description,
  debit, credit, balance, reference, source_file
)

credit_card_transactions (
  id, user_id, transaction_date, merchant_name,
  amount_ils, amount_original, original_currency,
  card_last_four, charge_date, source_file
)

-- Linking and matching
credit_card_charges (
  bank_transaction_id, charge_date, total_amount, card_transactions[]
)

matches (
  id, invoice_id, transaction_id, confidence,
  match_type, status, confirmed_by, confirmed_at
)

-- User preferences
user_settings (
  user_id, matching_trigger, default_date_range, theme
)
```

**RLS Policy Pattern (Team-Shared Data):**
Since this is a single-team application, RLS is simplified:
```sql
-- All authenticated users can read/write all data
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users full access" ON documents
  FOR ALL USING (auth.role() = 'authenticated');
```

If multi-tenant is added later, change to:
```sql
CREATE POLICY "Users see own tenant data" ON documents
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE user_id = auth.uid())
  );
```

## Patterns to Follow

### Pattern 1: Optimistic UI Updates

**What:** Update UI immediately on user action, revert if server fails
**When:** Match confirmation, document deletion, settings changes
**Example:**
```typescript
const confirmMatch = useMutation({
  mutationFn: (matchId) => supabase.from('matches')
    .update({ status: 'confirmed' })
    .eq('id', matchId),
  onMutate: async (matchId) => {
    await queryClient.cancelQueries(['matches']);
    const previous = queryClient.getQueryData(['matches']);
    queryClient.setQueryData(['matches'], (old) =>
      old.map(m => m.id === matchId ? { ...m, status: 'confirmed' } : m)
    );
    return { previous };
  },
  onError: (err, matchId, context) => {
    queryClient.setQueryData(['matches'], context.previous);
  },
});
```

### Pattern 2: Edge Function Error Boundaries

**What:** Graceful degradation when Vertex AI is unavailable
**When:** AI extraction, AI matching
**Example:**
```typescript
async function extractWithFallback(document: Document) {
  try {
    return await extractWithGemini(document);
  } catch (error) {
    if (error.code === 'RATE_LIMIT_EXCEEDED') {
      // Retry with exponential backoff
      await sleep(1000 * Math.pow(2, retryCount));
      return extractWithFallback(document);
    }
    if (error.code === 'SERVICE_UNAVAILABLE') {
      // Mark for manual processing
      await supabase.from('documents')
        .update({ status: 'needs_manual', error_message: 'AI unavailable' })
        .eq('id', document.id);
      return null;
    }
    throw error;
  }
}
```

### Pattern 3: Duplicate Detection with Hash

**What:** Prevent duplicate transaction imports
**When:** Statement upload
**Example:**
```typescript
// Create deterministic hash for transaction
function transactionHash(tx: BankTransaction): string {
  const key = `${tx.date.toISOString()}|${tx.description}|${tx.debit || tx.credit}`;
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

// On import
const existing = await supabase.from('bank_transactions')
  .select('hash')
  .in('hash', newTransactions.map(transactionHash));

const existingHashes = new Set(existing.data.map(r => r.hash));
const { toInsert, duplicates } = newTransactions.reduce((acc, tx) => {
  const hash = transactionHash(tx);
  if (existingHashes.has(hash)) {
    acc.duplicates.push(tx);
  } else {
    acc.toInsert.push({ ...tx, hash });
  }
  return acc;
}, { toInsert: [], duplicates: [] });
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Processing Files in Edge Functions Synchronously

**What:** User waits for AI extraction to complete before seeing upload success
**Why bad:** Gemini extraction takes 2-10 seconds; user sees spinning loader
**Instead:** Return immediately after storage upload; process async via queue

### Anti-Pattern 2: Storing Extracted Data Separately from Source

**What:** Separate tables for invoices, receipts, statements based on extracted type
**Why bad:** Source document and extracted data become disconnected; harder to re-extract
**Instead:** Single `documents` table with `extracted_data` JSONB; query with JSON operators

### Anti-Pattern 3: Complex RLS Policies with Joins

**What:** RLS policies that join multiple tables to determine access
**Why bad:** Every query pays the join cost; performance degrades with scale
**Instead:** Denormalize tenant_id/user_id onto each table; use simple equality checks

### Anti-Pattern 4: Client-Side Matching Logic

**What:** Downloading all transactions/invoices to browser for matching
**Why bad:** Data grows; browser memory issues; exposes all data to client
**Instead:** Matching runs server-side (Edge Function); client only sees results

## Scalability Considerations

| Concern | At 100 documents | At 10K documents | At 100K documents |
|---------|-----------------|------------------|-------------------|
| **Storage** | Supabase free tier | Supabase Pro tier | Consider external CDN |
| **AI Processing** | Real-time OK | Queue essential | Batch processing (50% cheaper) |
| **Database** | Single instance | Read replicas helpful | Partition by date |
| **Search** | ILIKE queries | Full-text search (tsvector) | Consider Elasticsearch |
| **Matching** | Real-time | Background job | Pre-computed candidate sets |

## Build Order (Suggested Phases)

Based on component dependencies:

```
Phase 1: Foundation
├── Supabase project setup
├── Auth integration
├── Basic React shell with routing
├── Database schema (migrations)
└── RLS policies

Phase 2: Document Upload
├── Storage buckets configuration
├── Signed URL flow
├── Upload UI with progress
├── Document list view
└── File type detection

Phase 3: Statement Parsing
├── Excel/CSV parser Edge Function
├── Bank statement import
├── Credit card statement import
├── Duplicate detection UI
└── Transaction tables

Phase 4: AI Extraction
├── Vertex AI integration
├── Processing queue Edge Function
├── Extraction prompts
├── Status polling/realtime
└── Extraction preview UI

Phase 5: Matching Engine
├── Basic matching algorithm
├── Credit card charge linking
├── Confidence scoring
├── Match review UI
└── Settings for trigger timing

Phase 6: Dashboard & Polish
├── Summary widgets
├── Date range filtering
├── VAT export
├── Error states
└── Hebrew/RTL polish
```

**Critical path:** Phase 1 -> Phase 2 -> Phase 3 (can parallelize with Phase 4 after Phase 2) -> Phase 5 -> Phase 6

## Sources

### HIGH Confidence (Official Documentation)
- [Supabase Edge Functions Architecture](https://supabase.com/docs/guides/functions/architecture)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control)
- [Vertex AI Document Understanding](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/document-understanding)
- [Vertex AI RAG Architecture](https://docs.cloud.google.com/architecture/rag-genai-gemini-enterprise-vertexai)
- [TanStack Query Documentation](https://tanstack.com/query/latest)

### MEDIUM Confidence (Verified Community Patterns)
- [Midday Automatic Reconciliation Engine](https://midday.ai/updates/automatic-reconciliation-engine/)
- [Fuzzy Matching in Bank Reconciliation](https://optimus.tech/blog/fuzzy-matching-algorithms-in-bank-reconciliation-when-exact-match-fails)
- [AI Transaction Matching](https://www.solvexia.com/blog/transaction-matching-using-ai)
- [Multi-Tenant RLS in Supabase](https://dev.to/blackie360/-enforcing-row-level-security-in-supabase-a-deep-dive-into-lockins-multi-tenant-architecture-4hd2)
- [Background Jobs with Supabase](https://www.jigz.dev/blogs/how-i-solved-background-jobs-using-supabase-tables-and-edge-functions)

### LOW Confidence (Single Source / Unverified)
- Israeli bank statement specific formats (needs validation against actual exports)
- Vertex AI batch pricing claims (verify current pricing)
