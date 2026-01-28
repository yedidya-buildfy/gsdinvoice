# Line Item Duplicate Detection V2 - Implementation Plan

## Root Cause Analysis

### Why Detection Isn't Working

1. **Missing "Meta" in Vendor Matching**
   - `merchantParser.ts` only has "facebk"/"fb" → "Facebook"
   - Does NOT have "meta" → "Meta"
   - "Meta Platforms Ireland Limited" vs "Meta" don't match

2. **Bulk Extraction Skips Duplicate Check**
   - `useExtractMultipleDocuments` never calls `checkLineItemDuplicates`
   - Only `useExtractDocument` (single) has the duplicate check

3. **Line Items > 1 Check**
   - Detection only runs when `lineItems.length > 1`
   - If extraction produces 1 item, check is skipped

---

## Implementation Plan

### Phase 1: Fix Detection Issues

#### 1.1 Add "Meta" to Merchant Abbreviations
**File:** `src/lib/utils/merchantParser.ts`

```typescript
const MERCHANT_ABBREVIATIONS: Record<string, string> = {
  // ... existing entries
  'meta': 'Meta',
  'meta platforms': 'Meta',
}
```

#### 1.2 Add Debug Logging
**File:** `src/lib/duplicates/lineItemDuplicateDetector.ts`

Add console.log at key points:
- Input parameters (userId, vendorName, lineItems count)
- Query results count
- Vendor matching results
- Final match/new item counts

---

### Phase 2: Redesign Modal with Table UI

#### 2.1 New Types
**File:** `src/lib/duplicates/types.ts`

```typescript
export type LineItemAction = 'add' | 'skip' | 'replace'

export interface LineItemWithAction {
  index: number
  item: LineItemForCheck
  pendingRow: InvoiceRowInsert
  existingMatch: ExistingLineItem | null
  isDuplicate: boolean
  action: LineItemAction
}
```

#### 2.2 New Modal Layout

```
+--------------------------------------------------+
| Duplicate Line Items Found                   [X] |
+--------------------------------------------------+
| Meta Platforms Ireland Limited                   |
| 48 total items | 12 duplicates | 36 new          |
+--------------------------------------------------+
| [All] [Duplicates Only] [New Only]               |
+--------------------------------------------------+
| Selected: 5   [Skip Selected] [Add Selected]     |
+--------------------------------------------------+
| [ ] | Date       | Description      | Amount     |
|     | Ref ID     | Status           | Action     |
+--------------------------------------------------+
| [x] | 2025-12-30 | Meta Ads - Ca... | ₪2,000.00  |
|     | 254917...  | [Duplicate]      | [Skip ▼]   |
+--------------------------------------------------+
| [x] | 2025-12-28 | Meta Ads - Ca... | ₪517.70    |
|     | 256041...  | [New]            | [Add ▼]    |
+--------------------------------------------------+
| ... more rows (scrollable) ...                   |
+--------------------------------------------------+
| Summary: Will add 36 | Skip 12 | Replace 0       |
|                              [Cancel] [Apply]    |
+--------------------------------------------------+
```

#### 2.3 Component Structure

**File:** `src/components/duplicates/LineItemDuplicateModal.tsx` (rewrite)

```tsx
interface LineItemDuplicateModalProps {
  isOpen: boolean
  onClose: () => void
  vendorName: string | null
  items: LineItemWithAction[]
  onConfirm: (items: LineItemWithAction[]) => Promise<void>
  isLoading?: boolean
}
```

**Sections:**
1. **Header** - Vendor name, close button
2. **Stats Bar** - Total/duplicates/new counts with badges
3. **Filter Bar** - All | Duplicates Only | New Only toggle buttons
4. **Bulk Actions Bar** - Selected count + bulk action buttons
5. **Table** - Checkbox, Date, Description, Amount, Ref ID, Status badge, Action dropdown
6. **Footer** - Summary counts + Cancel/Apply buttons

#### 2.4 Table Columns

| Column | Width | Content |
|--------|-------|---------|
| Checkbox | 40px | Select row |
| Date | 100px | transaction_date |
| Description | flex | description (truncated) |
| Amount | 100px | formatted currency |
| Ref ID | 100px | reference_id (truncated) |
| Status | 80px | Badge: Duplicate (red) / New (green) |
| Action | 100px | Dropdown: Skip / Add / Replace |

#### 2.5 Row Styling

- Default: `bg-transparent`
- Duplicate: `bg-red-500/5 border-l-2 border-red-500`
- Selected: `bg-primary/10`
- Hover: `hover:bg-background/50`

---

### Phase 3: Handler Function

**File:** `src/hooks/useDocumentExtraction.ts`

```typescript
export async function handlePerItemDuplicateActions(
  items: LineItemWithAction[]
): Promise<{ added: number; skipped: number; replaced: number }> {
  const toAdd = items.filter(i => i.action === 'add')
  const toSkip = items.filter(i => i.action === 'skip')
  const toReplace = items.filter(i => i.action === 'replace')

  // Delete existing items being replaced
  const existingIdsToDelete = toReplace
    .filter(i => i.existingMatch)
    .map(i => i.existingMatch!.id)

  if (existingIdsToDelete.length > 0) {
    await supabase
      .from('invoice_rows')
      .delete()
      .in('id', existingIdsToDelete)
  }

  // Insert items marked as add or replace
  const rowsToInsert = [...toAdd, ...toReplace].map(i => i.pendingRow)

  if (rowsToInsert.length > 0) {
    await supabase
      .from('invoice_rows')
      .insert(rowsToInsert)
  }

  return {
    added: toAdd.length,
    skipped: toSkip.length,
    replaced: toReplace.length,
  }
}
```

---

### Phase 4: InvoicesPage Integration

**File:** `src/pages/InvoicesPage.tsx`

```typescript
// State
const [lineItemReview, setLineItemReview] = useState<{
  vendorName: string | null
  items: LineItemWithAction[]
} | null>(null)

// Transform extraction result to LineItemWithAction[]
const transformToActionItems = (
  duplicateInfo: LineItemDuplicateInfo
): LineItemWithAction[] => {
  return duplicateInfo.pendingLineItems.map((pending, index) => {
    const match = duplicateInfo.matches.find(m =>
      m.newItem.reference_id === pending.reference_id ||
      (m.newItem.transaction_date === pending.transaction_date &&
       m.newItem.amount_agorot === pending.total_agorot)
    )

    return {
      index,
      item: {
        reference_id: pending.reference_id,
        transaction_date: pending.transaction_date,
        amount_agorot: pending.total_agorot,
        description: pending.description,
      },
      pendingRow: pending,
      existingMatch: match?.existingItems[0] ?? null,
      isDuplicate: !!match,
      action: match ? 'skip' : 'add', // Default: skip duplicates, add new
    }
  })
}

// onSuccess handler
extractSingle.mutate(request, {
  onSuccess: (result) => {
    if (result.lineItemDuplicates) {
      setLineItemReview({
        vendorName: result.lineItemDuplicates.vendorName,
        items: transformToActionItems(result.lineItemDuplicates),
      })
    }
  },
})
```

---

### Phase 5: Edge Cases

1. **Empty items** - Show message, allow close
2. **All duplicates** - Default all to skip, show warning
3. **All new** - Default all to add, option to auto-confirm
4. **Large lists (100+)** - Add pagination or virtual scroll
5. **Network errors** - Show error toast, allow retry

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/utils/merchantParser.ts` | Add "meta" to abbreviations |
| `src/lib/duplicates/types.ts` | Add `LineItemWithAction` type |
| `src/lib/duplicates/lineItemDuplicateDetector.ts` | Add debug logging |
| `src/components/duplicates/LineItemDuplicateModal.tsx` | Complete rewrite with table |
| `src/hooks/useDocumentExtraction.ts` | Add `handlePerItemDuplicateActions` |
| `src/pages/InvoicesPage.tsx` | Update state and handlers |

## Reference Files

| File | Purpose |
|------|---------|
| `src/components/documents/DocumentTable.tsx` | Table with selection pattern |
| `src/components/bank/VatChangeModal.tsx` | Modal action button pattern |
| `src/components/bank/TransactionTable.tsx` | Table styling reference |
