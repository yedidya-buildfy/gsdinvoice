# Phase 5: Bank Statement Import - Research

**Researched:** 2026-01-27
**Domain:** File parsing (xlsx/csv), data tables, Israeli banking formats
**Confidence:** MEDIUM

## Summary

This phase requires parsing bank statement files (xlsx and csv formats) from Israeli banks, storing transactions in the database, and displaying them in a sortable/filterable table. The primary challenge is handling varied Israeli bank export formats with Hebrew text and DD/MM/YYYY date formats.

The standard approach is to use **SheetJS (xlsx)** for xlsx parsing and **PapaParse** for CSV parsing, both well-established libraries with TypeScript support. For the transaction table, the existing **react-aria-components** Table component should be extended with sorting/filtering capabilities, maintaining consistency with Phase 4's DocumentTable pattern.

**Primary recommendation:** Use SheetJS for xlsx parsing with `codepage: 65001` for Hebrew UTF-8 support, create a flexible parser service that detects column mappings automatically, and implement client-side sorting/filtering with the existing Table component pattern.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| xlsx (SheetJS) | 0.20.3 | Parse xlsx files | Most popular xlsx parser, 100+ contributors, handles multiple formats |
| papaparse | 5.x | Parse CSV files | Fastest CSV parser, auto-delimiter detection, streaming support |
| @types/papaparse | 5.5.x | TypeScript types for PapaParse | 2M+ weekly downloads, well-maintained |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dayjs | 1.x | Date parsing | Parse DD/MM/YYYY Israeli date format with customParseFormat plugin |
| dayjs/plugin/customParseFormat | - | Custom date format parsing | Required for non-ISO date formats |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SheetJS | ExcelJS | ExcelJS is heavier, better for writing complex workbooks |
| PapaParse | SheetJS for CSV | SheetJS modifies CSV during parse, PapaParse is CSV-pure |
| TanStack Table | react-aria Table | Already using react-aria-components, maintain consistency |

**Installation:**
```bash
npm install xlsx papaparse dayjs @types/papaparse
```

Note: SheetJS includes TypeScript types, no separate @types/xlsx needed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   ├── parsers/
│   │   ├── index.ts           # Export all parsers
│   │   ├── xlsxParser.ts      # SheetJS xlsx parsing
│   │   ├── csvParser.ts       # PapaParse csv parsing
│   │   └── bankStatementParser.ts  # Unified parsing + column detection
│   └── utils/
│       ├── currency.ts        # Agorot conversion utilities
│       └── dateUtils.ts       # Israeli date parsing utilities
├── hooks/
│   ├── useBankStatementUpload.ts  # Upload + parse hook
│   └── useTransactions.ts     # Fetch/manage transactions
├── components/
│   └── bank/
│       ├── BankUploader.tsx       # Upload UI for bank files
│       ├── TransactionTable.tsx   # Sortable/filterable table
│       ├── TransactionFilters.tsx # Filter controls
│       └── ColumnMapper.tsx       # UI for mapping unknown columns (future)
└── pages/
    └── BankMovementsPage.tsx   # Main page with upload + table
```

### Pattern 1: Unified Parser Service
**What:** Single entry point that detects file type and parses accordingly
**When to use:** Always for bank statement uploads
**Example:**
```typescript
// Source: Custom implementation based on SheetJS docs
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export interface ParsedTransaction {
  date: string;           // ISO format YYYY-MM-DD
  valueDate?: string;     // ISO format
  description: string;    // Hebrew text preserved
  reference?: string;
  amountAgorot: number;   // Integer, positive = income, negative = expense
  balanceAgorot?: number;
}

export async function parseBankStatement(
  file: File
): Promise<ParsedTransaction[]> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'xlsx' || extension === 'xls') {
    return parseXlsxStatement(file);
  } else if (extension === 'csv') {
    return parseCsvStatement(file);
  }

  throw new Error('Unsupported file type');
}

async function parseXlsxStatement(file: File): Promise<ParsedTransaction[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    codepage: 65001,  // UTF-8 for Hebrew
    cellDates: true   // Parse dates as Date objects
  });

  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet);

  return rawData.map(row => normalizeTransaction(row));
}
```

### Pattern 2: Flexible Column Detection
**What:** Detect column names dynamically since Israeli banks use different headers
**When to use:** When parsing any bank statement
**Example:**
```typescript
// Source: Custom implementation for Israeli banks
const COLUMN_PATTERNS = {
  date: ['תאריך', 'תאריך העסקה', 'date', 'תאריך ערך'],
  valueDate: ['תאריך ערך', 'value date', 'ערך'],
  description: ['תיאור', 'פרטים', 'description', 'תאור הפעולה'],
  reference: ['אסמכתא', 'reference', 'מספר אסמכתא', 'אסמכתה'],
  amount: ['סכום', 'amount', 'סכום בש"ח', 'זכות', 'חובה'],
  debit: ['חובה', 'debit', 'הוצאה'],
  credit: ['זכות', 'credit', 'הכנסה'],
  balance: ['יתרה', 'balance', 'יתרה בש"ח']
};

function detectColumnMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};

  for (const header of headers) {
    const normalizedHeader = header.trim().toLowerCase();

    for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
      if (patterns.some(p => normalizedHeader.includes(p.toLowerCase()))) {
        mapping[field] = header;
        break;
      }
    }
  }

  return mapping;
}
```

### Pattern 3: Amount Handling with Agorot
**What:** Convert decimal shekel amounts to integer agorot for precision
**When to use:** Any monetary value storage or calculation
**Example:**
```typescript
// Source: Best practice from currency.js / MDN
export function shekelToAgorot(amount: number | string): number {
  // Handle string input (may have commas, spaces)
  if (typeof amount === 'string') {
    amount = parseFloat(amount.replace(/[,\s]/g, ''));
  }

  if (isNaN(amount)) return 0;

  // Multiply by 100 and round to avoid floating point errors
  return Math.round(amount * 100);
}

export function agorotToShekel(agorot: number): number {
  return agorot / 100;
}

export function formatShekel(agorot: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS'
  }).format(agorot / 100);
}
```

### Pattern 4: Israeli Date Parsing
**What:** Parse DD/MM/YYYY format to ISO date
**When to use:** Parsing any Israeli bank date
**Example:**
```typescript
// Source: day.js documentation
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

const DATE_FORMATS = [
  'DD/MM/YYYY',
  'DD/MM/YY',
  'DD.MM.YYYY',
  'DD-MM-YYYY',
  'YYYY-MM-DD'  // Some exports use ISO
];

export function parseIsraeliDate(dateStr: string): string | null {
  if (!dateStr) return null;

  const trimmed = dateStr.trim();

  for (const format of DATE_FORMATS) {
    const parsed = dayjs(trimmed, format, true); // strict mode
    if (parsed.isValid()) {
      return parsed.format('YYYY-MM-DD');
    }
  }

  // Fallback: try native Date parsing
  const native = new Date(trimmed);
  if (!isNaN(native.getTime())) {
    return dayjs(native).format('YYYY-MM-DD');
  }

  return null;
}
```

### Anti-Patterns to Avoid
- **Storing amounts as floats:** Use integer agorot for all monetary values, convert only for display
- **Assuming column order:** Israeli banks change export formats; always detect columns by header name
- **Ignoring encoding:** Always use `codepage: 65001` for xlsx, `encoding: "UTF-8"` for CSV
- **Single date format:** Support multiple date formats, Israeli banks are inconsistent
- **Loading entire file into memory:** For very large files, consider streaming (PapaParse supports this)

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| xlsx parsing | Custom binary parser | SheetJS | Complex binary format, edge cases |
| CSV parsing | String.split() | PapaParse | Quoted fields, delimiters, encoding |
| Date parsing | RegExp extraction | dayjs + customParseFormat | Timezone handling, validation |
| Currency formatting | Template strings | Intl.NumberFormat | Locale-aware, RTL support |
| Duplicate detection | Simple equality | Hash-based with normalized fields | Floating point, whitespace variations |

**Key insight:** Israeli bank exports are inconsistent in column naming, date formats, and encoding. Libraries handle edge cases that would take weeks to discover and fix manually.

## Common Pitfalls

### Pitfall 1: Hebrew Text Garbled/Question Marks
**What goes wrong:** Hebrew characters display as ??? or garbage
**Why it happens:** Wrong encoding when parsing xlsx/csv
**How to avoid:**
- xlsx: Use `codepage: 65001` option
- csv: Use `encoding: "UTF-8"` in PapaParse
- Ensure file has UTF-8 BOM for CSV
**Warning signs:** First Hebrew text in preview shows question marks

### Pitfall 2: Dates Parsed as Numbers
**What goes wrong:** Excel serial dates (like 45000) instead of proper dates
**Why it happens:** SheetJS can return dates as Excel serial numbers
**How to avoid:** Use `cellDates: true` option, or convert serial to date:
```typescript
// Excel serial date to JS Date
const excelEpoch = new Date(1899, 11, 30);
const jsDate = new Date(excelEpoch.getTime() + serialDate * 86400000);
```
**Warning signs:** Dates appear as large integers (40000-50000 range)

### Pitfall 3: Amount Sign Confusion
**What goes wrong:** Income shows as expense or vice versa
**Why it happens:** Banks use different conventions:
- Some use positive/negative in single column
- Some use separate debit/credit columns
- Credit card statements show expenses as positive
**How to avoid:** Detect column pattern, handle both cases:
```typescript
// If separate columns
if (mapping.debit && mapping.credit) {
  const debit = parseFloat(row[mapping.debit]) || 0;
  const credit = parseFloat(row[mapping.credit]) || 0;
  return shekelToAgorot(credit - debit);
}
// If single column
return shekelToAgorot(row[mapping.amount]);
```
**Warning signs:** All transactions same sign, total doesn't match expected

### Pitfall 4: Duplicate Transactions on Re-upload
**What goes wrong:** Same transactions appear multiple times
**Why it happens:** User uploads overlapping date ranges
**How to avoid:** Generate stable hash from transaction fields:
```typescript
function generateTransactionHash(tx: ParsedTransaction): string {
  const normalized = `${tx.date}|${tx.description.trim()}|${tx.amountAgorot}|${tx.reference || ''}`;
  // Use SubtleCrypto for browser-safe hashing
  return btoa(normalized); // Simple, or use SHA-256
}
```
**Warning signs:** Transaction count doubles after upload

### Pitfall 5: Large File Performance
**What goes wrong:** Browser freezes on large statements (1000+ rows)
**Why it happens:** Synchronous parsing blocks main thread
**How to avoid:**
- Parse in chunks using Web Worker (future optimization)
- Show progress indicator
- Use PapaParse `step` callback for streaming
**Warning signs:** Upload button unresponsive, no progress feedback

## Code Examples

Verified patterns from official sources:

### Complete xlsx Parsing with SheetJS
```typescript
// Source: SheetJS docs + custom implementation
import * as XLSX from 'xlsx';

export async function parseXlsxFile(file: File): Promise<unknown[][]> {
  const buffer = await file.arrayBuffer();

  const workbook = XLSX.read(buffer, {
    type: 'array',
    codepage: 65001,    // UTF-8 for Hebrew
    cellDates: true,    // Parse dates as Date objects
    cellNF: false,      // Don't parse number formats
    cellStyles: false   // Don't parse styles (performance)
  });

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Get as array of arrays (with headers)
  return XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: ''  // Default empty cells to empty string
  });
}

export function xlsxToObjects<T>(
  data: unknown[][],
  headerRow = 0
): T[] {
  if (data.length <= headerRow) return [];

  const headers = data[headerRow] as string[];
  const rows = data.slice(headerRow + 1);

  return rows.map(row => {
    const obj: Record<string, unknown> = {};
    headers.forEach((header, i) => {
      if (header) {
        obj[header.trim()] = row[i];
      }
    });
    return obj as T;
  });
}
```

### Complete CSV Parsing with PapaParse
```typescript
// Source: PapaParse docs
import Papa from 'papaparse';

export function parseCsvFile<T>(file: File): Promise<T[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,           // First row is headers
      encoding: 'UTF-8',      // Hebrew support
      skipEmptyLines: true,   // Ignore blank rows
      dynamicTyping: false,   // Keep as strings for controlled parsing
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        if (results.errors.length > 0) {
          console.warn('CSV parse warnings:', results.errors);
        }
        resolve(results.data as T[]);
      },
      error: (error) => {
        reject(new Error(`CSV parse error: ${error.message}`));
      }
    });
  });
}
```

### Transaction Table with Sorting
```typescript
// Source: react-aria-components + existing Table component pattern
import { useState, useMemo } from 'react';
import type { SortDescriptor } from 'react-aria-components';
import type { Transaction } from '@/types/database';

export function useTransactionSort(transactions: Transaction[]) {
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: 'date',
    direction: 'descending'
  });

  const sortedTransactions = useMemo(() => {
    const sorted = [...transactions].sort((a, b) => {
      const column = sortDescriptor.column as keyof Transaction;
      let aVal = a[column];
      let bVal = b[column];

      // Handle dates
      if (column === 'date' || column === 'value_date') {
        aVal = new Date(aVal as string).getTime();
        bVal = new Date(bVal as string).getTime();
      }

      // Handle amounts
      if (column === 'amount_agorot' || column === 'balance_agorot') {
        aVal = aVal as number;
        bVal = bVal as number;
      }

      if (aVal < bVal) return sortDescriptor.direction === 'ascending' ? -1 : 1;
      if (aVal > bVal) return sortDescriptor.direction === 'ascending' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [transactions, sortDescriptor]);

  return { sortedTransactions, sortDescriptor, setSortDescriptor };
}
```

### Transaction Filtering
```typescript
// Source: Custom implementation
import { useState, useMemo } from 'react';
import type { Transaction } from '@/types/database';

export interface TransactionFilters {
  search: string;
  dateFrom?: string;
  dateTo?: string;
  type?: 'income' | 'expense' | 'all';
}

export function useTransactionFilters(transactions: Transaction[]) {
  const [filters, setFilters] = useState<TransactionFilters>({
    search: '',
    type: 'all'
  });

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      // Search filter (description)
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        if (!tx.description.toLowerCase().includes(searchLower)) {
          return false;
        }
      }

      // Date range filter
      if (filters.dateFrom && tx.date < filters.dateFrom) return false;
      if (filters.dateTo && tx.date > filters.dateTo) return false;

      // Type filter
      if (filters.type === 'income' && !tx.is_income) return false;
      if (filters.type === 'expense' && tx.is_income) return false;

      return true;
    });
  }, [transactions, filters]);

  return { filteredTransactions, filters, setFilters };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Moment.js for dates | dayjs (lighter, same API) | 2020+ | 2KB vs 70KB bundle size |
| xlsx @types separate | Built-in types in xlsx | v0.19+ | No @types/xlsx needed |
| Manual CSV split | PapaParse with streaming | Always | Handles edge cases, large files |
| Float for currency | Integer cents/agorot | Best practice | Eliminates precision errors |

**Deprecated/outdated:**
- `@types/xlsx`: Stub package, xlsx has built-in types
- Moment.js: In maintenance mode, use dayjs for new projects
- SheetJS from npm: Install from cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz

## Open Questions

Things that couldn't be fully resolved:

1. **Exact Israeli Bank Column Formats**
   - What we know: Banks use Hebrew headers, formats vary
   - What's unclear: Exact column names for Hapoalim, Leumi, Discount, Mizrachi
   - Recommendation: Use flexible column detection with pattern matching, collect real samples to refine

2. **Header Row Detection**
   - What we know: Some bank exports have metadata rows before headers
   - What's unclear: How many rows, consistent pattern?
   - Recommendation: Scan first 10 rows for row that looks like headers (contains "תאריך" or "סכום")

3. **Credit Card Statement Sign Convention**
   - What we know: Credit card statements may show expenses as positive
   - What's unclear: All Israeli card companies follow same convention?
   - Recommendation: Phase 6 will handle credit cards, detect by file type marker

## Sources

### Primary (HIGH confidence)
- [SheetJS Documentation](https://docs.sheetjs.com/) - Parse options, installation, API
- [PapaParse Official](https://www.papaparse.com/) - CSV parsing config
- [@types/papaparse npm](https://www.npmjs.com/package/@types/papaparse) - TypeScript types

### Secondary (MEDIUM confidence)
- [day.js Custom Parse Format](https://day.js.org/docs/en/parse/string-format) - Date parsing
- [TanStack Table Sorting Guide](https://tanstack.com/table/latest/docs/guide/sorting) - Table patterns
- [Currency.js](https://currency.js.org/) - Currency handling best practices
- [Intl.NumberFormat MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/NumberFormat) - Formatting

### Tertiary (LOW confidence)
- [SheetJS Hebrew encoding issue #11](https://github.com/SheetJS/sheetjs/issues/11) - Hebrew support exists
- WebSearch results on Israeli bank formats - No authoritative docs found

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Well-documented, widely used libraries
- Architecture: MEDIUM - Patterns adapted from docs, not Israeli-specific
- Pitfalls: MEDIUM - Based on general xlsx/csv issues, needs validation with real Israeli bank files

**Research date:** 2026-01-27
**Valid until:** 60 days (stable libraries, unlikely to change)
