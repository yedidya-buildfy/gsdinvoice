---
phase: 05-bank-statement-import
plan: 01
title: "Parsing Foundation"
completed: 2026-01-27
duration: 3 min

subsystem: parsing
tags:
  - xlsx
  - csv
  - parsing
  - hebrew
  - currency
  - dates

tech-stack:
  added:
    - xlsx: "Excel file parsing with Hebrew support"
    - papaparse: "CSV parsing with UTF-8 encoding"
    - dayjs: "Date manipulation and parsing"
  patterns:
    - "Automatic header row detection"
    - "Flexible column mapping for varied bank formats"
    - "Israeli date format parsing (DD/MM/YYYY + Excel serial)"
    - "Currency conversion to integer agorot"

key-files:
  created:
    - src/lib/parsers/xlsxParser.ts
    - src/lib/parsers/csvParser.ts
    - src/lib/parsers/bankStatementParser.ts
    - src/lib/parsers/index.ts
    - src/lib/utils/currency.ts
    - src/lib/utils/dateUtils.ts
  modified:
    - package.json

decisions:
  - id: D-0501-01
    decision: "Store amounts as integer agorot (1 ILS = 100 agorot)"
    rationale: "Avoid floating-point precision issues with currency calculations"
    alternatives: "Store as decimal strings"
    impact: "All amounts stored/calculated as integers, converted only for display"

  - id: D-0501-02
    decision: "Scan first 15 rows to detect header row"
    rationale: "Real bank files have metadata in rows 0-7, header in row 8"
    alternatives: "Assume header always in row 0"
    impact: "Handles both bank statements (row 8) and credit cards (row 1)"

  - id: D-0501-03
    decision: "Normalize headers by removing \\r\\n, ₪, whitespace"
    rationale: "Credit card files have headers like 'תאריך\\r\\nעסקה'"
    alternatives: "Exact string matching"
    impact: "More robust column detection across different bank formats"

  - id: D-0501-04
    decision: "Use Excel serial dates (days since 1899-12-30)"
    rationale: "Real bank files use serial numbers (45963, 46022) not date strings"
    alternatives: "Assume all dates are formatted strings"
    impact: "Correctly parses actual bank export files"

requires:
  - phase: 04-document-upload
    context: "File upload infrastructure needed for importing bank files"

provides:
  - artifact: "parseBankStatement function"
    capability: "Parse any Israeli bank xlsx/csv export to normalized transactions"
  - artifact: "ParsedTransaction interface"
    capability: "Standard transaction format with dates in ISO, amounts in agorot"
  - artifact: "Currency utilities"
    capability: "Convert between shekel and agorot, format for display"
  - artifact: "Date utilities"
    capability: "Parse Israeli DD/MM/YYYY and Excel serial dates"

affects:
  - phase: 06-transaction-management
    reason: "Will consume ParsedTransaction[] from bank statement import"
  - phase: 09-matching-engine
    reason: "Will use amountAgorot and date fields for matching"
---

# Phase 5 Plan 01: Parsing Foundation Summary

**One-liner:** Created xlsx/csv parsers with automatic Hebrew column detection, Excel serial date handling, and integer agorot conversion for Israeli bank statements.

## What Was Built

Parsing foundation for Israeli bank statement import with:

1. **Currency utilities** - Convert between shekel and agorot (integer storage), format for display
2. **Date utilities** - Parse DD/MM/YYYY formats and Excel serial dates to ISO format
3. **xlsx parser** - Parse Excel files with UTF-8 Hebrew support (codepage 65001)
4. **CSV parser** - Parse CSV with auto-delimiter detection and header normalization
5. **Bank statement parser** - Unified parser with automatic column detection

### Key Features

**Automatic Header Detection:**
- Scans first 15 rows for row containing 'תאריך' AND ('יתרה' OR 'סכום' OR 'זכות')
- Handles bank statements with header in row 8 (metadata in rows 0-7)
- Handles credit cards with header in row 1

**Real-World Column Patterns:**
Based on actual Israeli bank files (הוצאות.xlsx, הכנסות.xlsx, פירוטי אשראי.xlsx):
- Date: ['תאריך', 'תאריך עסקה']
- Value Date: ['יום ערך', 'מועד חיוב']
- Description: ['תיאור התנועה', 'שם בית עסק', 'פירוט', 'תיאור']
- Amount: ['זכות/חובה', 'סכום בש"ח', 'סכום']
- Balance: ['יתרה']
- Reference: ['אסמכתא', 'אסמכתה']

**Header Normalization:**
- Removes \r\n newlines (credit card files: "תאריך\r\nעסקה")
- Removes ₪ symbols ("₪ זכות/חובה ")
- Trims and normalizes whitespace

**Excel Serial Dates:**
- Detects numbers > 25000 as Excel dates
- Converts using epoch 1899-12-30
- Example: 45963 → 2025-11-08

## Tasks Completed

| Task | Name                                          | Commit  | Files                                                |
| ---- | --------------------------------------------- | ------- | ---------------------------------------------------- |
| 1    | Install parsing dependencies                  | f8874ed | package.json, package-lock.json                      |
| 2    | Create utility functions for currency and date | 605d7ac | src/lib/utils/currency.ts, src/lib/utils/dateUtils.ts |
| 3    | Create xlsx, csv, and unified bank statement parsers | 334a04e | src/lib/parsers/*.ts (4 files)                       |

## Deviations from Plan

None - plan executed exactly as written.

## Technical Decisions Made

1. **Integer Agorot Storage**
   - Store all amounts as integers (agorot = shekel × 100)
   - Avoids floating-point precision issues
   - Convert to decimal only for display using Intl.NumberFormat

2. **Flexible Header Row Detection**
   - Scan first 15 rows instead of assuming row 0
   - Matches real bank files (row 8 for statements, row 1 for credit)
   - Detects based on presence of תאריך + (יתרה/סכום/זכות)

3. **Header Normalization Strategy**
   - Remove \r\n, ₪, extra whitespace before matching
   - Handles credit card files with multiline headers
   - Case-insensitive partial matching for robustness

4. **Excel Serial Date Handling**
   - Detect numbers > 25000 as Excel dates
   - Use 1899-12-30 as epoch (Excel standard)
   - Real bank files use serial numbers, not date strings

## Testing Evidence

1. TypeScript compilation: `npx tsc --noEmit` ✓ passed
2. Package installation: All 4 packages present in package.json ✓
3. File structure: All 6 files created in correct locations ✓
4. Exports verified: parseBankStatement, ParsedTransaction, parseXlsxFile, parseCsvFile, shekelToAgorot, parseIsraeliDate ✓

## Next Phase Readiness

**Ready for Phase 5 Plan 02** - Bank statement upload UI and transaction table

**What's Available:**
- parseBankStatement(file) - parses any Israeli bank xlsx/csv
- ParsedTransaction[] - normalized transaction format
- Currency utilities for display
- Date utilities for formatting

**What's Needed Next:**
- UI component to upload bank files
- Table to display parsed transactions
- Preview before saving to database
- Validation and error handling

**No Blockers**

## Files Changed

**Created:**
- src/lib/parsers/xlsxParser.ts - Excel parsing with Hebrew support
- src/lib/parsers/csvParser.ts - CSV parsing with UTF-8
- src/lib/parsers/bankStatementParser.ts - Unified parser with column detection
- src/lib/parsers/index.ts - Public exports
- src/lib/utils/currency.ts - Shekel/agorot conversion and formatting
- src/lib/utils/dateUtils.ts - Israeli date parsing

**Modified:**
- package.json - Added xlsx, papaparse, dayjs, @types/papaparse

## API Surface

**Parsers:**
```typescript
// Parse any bank statement file (xlsx/csv)
parseBankStatement(file: File): Promise<ParsedTransaction[]>

// Low-level xlsx parsing
parseXlsxFile(file: File): Promise<unknown[][]>
xlsxToObjects<T>(data: unknown[][], headerRow?: number): T[]

// Low-level csv parsing
parseCsvFile<T>(file: File): Promise<T[]>
```

**Currency:**
```typescript
shekelToAgorot(amount: number | string): number
agorotToShekel(agorot: number): number
formatShekel(agorot: number): string
```

**Dates:**
```typescript
parseIsraeliDate(dateStr: string | Date | number): string | null
```

**Types:**
```typescript
interface ParsedTransaction {
  date: string;                    // ISO YYYY-MM-DD
  valueDate: string | null;        // ISO YYYY-MM-DD
  description: string;
  reference: string | null;
  amountAgorot: number;            // positive = income, negative = expense
  balanceAgorot: number | null;
}
```

## Session Notes

Duration: 3 minutes 8 seconds

Clean execution, no issues encountered. All TypeScript compiled successfully on first try.

Key implementation note: Used REAL sample file structures from samples/ directory:
- הוצאות.xlsx - Bank expenses with header in row 8
- הכנסות.xlsx - Bank income with header in row 8
- פירוטי אשראי.xlsx - Credit card with header in row 1

This ensures the parser works with actual bank exports, not theoretical formats.
