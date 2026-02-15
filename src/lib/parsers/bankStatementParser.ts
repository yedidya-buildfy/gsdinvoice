/**
 * Bank statement parser with automatic column detection
 * Handles Israeli bank exports (xlsx/csv) with varied column formats
 */

import { parseXlsxFile, xlsxToObjects } from './xlsxParser';
import { parseCsvFile } from './csvParser';
import { shekelToAgorot } from '@/lib/currency';
import { parseIsraeliDate } from '@/lib/utils/dateUtils';

/**
 * Parsed transaction interface
 * All amounts are in agorot (1 ILS = 100 agorot)
 * Positive amounts = income, negative = expense
 */
export interface ParsedTransaction {
  date: string; // ISO YYYY-MM-DD
  valueDate: string | null;
  description: string;
  reference: string | null;
  amountAgorot: number; // positive = income, negative = expense
  balanceAgorot: number | null;
}

/**
 * Column patterns based on REAL Israeli bank files
 * Bank statements (הוצאות.xlsx, הכנסות.xlsx):
 *   - Header in row 8: ["תאריך","יום ערך","תיאור התנועה","₪ זכות/חובה ","₪ יתרה ","אסמכתה","עמלה","ערוץ ביצוע"]
 *
 * Credit cards (פירוטי אשראי.xlsx):
 *   - Header in row 1: ["תאריך\r\nעסקה","שם בית עסק","סכום\r\nבש\"ח","סכום\r\nבדולר",...]
 */
const COLUMN_PATTERNS = {
  date: ['תאריך', 'תאריך עסקה'],
  valueDate: ['יום ערך', 'מועד חיוב'],
  description: ['תיאור התנועה', 'שם בית עסק', 'פירוט', 'תיאור'],
  reference: ['אסמכתא', 'אסמכתה'],
  amount: ['זכות/חובה', 'סכום בש"ח', 'סכום'],
  balance: ['יתרה'],
};

/**
 * Normalize header string for matching
 * Removes whitespace, newlines, currency symbols
 */
function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/\r\n/g, ' ')
    .replace(/₪/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detect column mapping from headers
 * Maps field names to actual column names in the file
 * Handles PapaParse duplicate header renaming (e.g., "תאריך" -> "תאריך_1")
 */
function detectColumnMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};

  console.log('[Column Detection] Starting column detection for', headers.length, 'headers');

  headers.forEach((header, index) => {
    // Remove PapaParse duplicate suffix (_1, _2, etc.) for matching purposes
    const headerWithoutSuffix = header.replace(/_\d+$/, '');
    const normalized = normalizeHeader(headerWithoutSuffix);
    // Store trimmed header to match xlsxToObjects keys (keep the suffix for actual access)
    const trimmedHeader = header.trim();

    console.log(`[Column Detection] Header ${index}: "${header}" -> normalized: "${normalized}"`);

    // Check each pattern type
    for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
      // Skip if we already have a mapping for this field
      if (mapping[field]) continue;

      for (const pattern of patterns) {
        const normalizedPattern = normalizeHeader(pattern);
        if (normalized.includes(normalizedPattern)) {
          mapping[field] = trimmedHeader;
          console.log(`[Column Detection] MATCHED: "${field}" -> "${trimmedHeader}" (pattern: "${pattern}")`);
          break;
        }
      }
    }
  });

  console.log('[Column Detection] Final mapping:', mapping);
  return mapping;
}

/**
 * Detect header row by scanning first 15 rows
 * Looks for row containing 'תאריך' AND ('יתרה' OR 'סכום' OR 'זכות')
 */
function detectHeaderRow(data: unknown[][]): number {
  for (let i = 0; i < Math.min(15, data.length); i++) {
    const row = data[i];
    if (!Array.isArray(row)) continue;

    const rowStr = row.map((cell) => String(cell || '')).join('|');
    const hasDate = rowStr.includes('תאריך');
    const hasAmount =
      rowStr.includes('יתרה') ||
      rowStr.includes('סכום') ||
      rowStr.includes('זכות');

    if (hasDate && hasAmount) {
      return i;
    }
  }

  return 0; // Default to first row if not found
}

/**
 * Normalize transaction from raw row object
 * Converts all fields to proper types and formats
 */
// Log counter for debugging - reset when module reloads
let normalizeLogCount = 0;

function normalizeTransaction(
  row: Record<string, unknown>,
  mapping: Record<string, string>
): ParsedTransaction | null {
  const shouldLog = normalizeLogCount < 5;

  // Extract date - required field
  const dateColumn = mapping.date;
  const dateValue = dateColumn ? row[dateColumn] : null;

  if (shouldLog) {
    console.log(`[Normalize ${normalizeLogCount}] Date column: "${dateColumn}", value: "${dateValue}", type: ${typeof dateValue}`);
    console.log(`[Normalize ${normalizeLogCount}] Row keys:`, Object.keys(row));
  }

  const date = parseIsraeliDate(dateValue as string | number | Date);

  if (!date) {
    if (shouldLog) {
      console.log(`[Normalize ${normalizeLogCount}] REJECTED - date parse failed for value: "${dateValue}"`);
      normalizeLogCount++;
    }
    return null; // Skip rows without valid date
  }

  // Extract value date
  const valueDateValue = mapping.valueDate ? row[mapping.valueDate] : null;
  const valueDate = parseIsraeliDate(valueDateValue as string | number | Date);

  // Extract description
  const description = mapping.description
    ? String(row[mapping.description] || '')
    : '';

  // Extract reference
  const reference = mapping.reference
    ? String(row[mapping.reference] || '')
    : null;

  // Extract amount - handle both number and string
  let amountAgorot = 0;
  if (mapping.amount) {
    const amountValue = row[mapping.amount];
    if (shouldLog) {
      console.log(`[Normalize ${normalizeLogCount}] Amount column: "${mapping.amount}", value: "${amountValue}", type: ${typeof amountValue}`);
    }
    if (typeof amountValue === 'number') {
      amountAgorot = shekelToAgorot(amountValue);
    } else if (typeof amountValue === 'string' && amountValue.trim()) {
      amountAgorot = shekelToAgorot(amountValue);
    }
  }

  // Extract balance
  let balanceAgorot: number | null = null;
  if (mapping.balance) {
    const balanceValue = row[mapping.balance];
    if (typeof balanceValue === 'number') {
      balanceAgorot = shekelToAgorot(balanceValue);
    } else if (typeof balanceValue === 'string' && balanceValue.trim()) {
      balanceAgorot = shekelToAgorot(balanceValue);
    }
  }

  if (shouldLog) {
    console.log(`[Normalize ${normalizeLogCount}] SUCCESS - date: ${date}, desc: ${description.substring(0, 30)}, amount: ${amountAgorot}`);
    normalizeLogCount++;
  }

  return {
    date,
    valueDate,
    description,
    reference,
    amountAgorot,
    balanceAgorot,
  };
}

/**
 * Parse bank statement file (xlsx or csv)
 * Automatically detects file type, header row, and column mapping
 *
 * @param file - File object to parse
 * @returns Promise resolving to array of normalized transactions
 */
export async function parseBankStatement(
  file: File
): Promise<ParsedTransaction[]> {
  // Reset log counter for each new file parse
  normalizeLogCount = 0;
  console.log('[Bank Parser] Starting to parse file:', file.name, 'Size:', file.size, 'bytes');

  const fileName = file.name.toLowerCase();
  const isXlsx = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
  const isCsv = fileName.endsWith('.csv');

  if (!isXlsx && !isCsv) {
    console.error('[Bank Parser] Unsupported file type:', fileName);
    throw new Error('Unsupported file type. Expected .xlsx or .csv');
  }

  console.log('[Bank Parser] File type detected:', isXlsx ? 'XLSX' : 'CSV');

  let data: unknown[][];

  if (isXlsx) {
    // Parse xlsx to array of arrays
    console.log('[Bank Parser] Parsing as XLSX...');
    data = await parseXlsxFile(file);
    console.log('[Bank Parser] XLSX parsed, total rows:', data.length);
  } else {
    // Parse csv to objects, then convert to array of arrays for consistency
    console.log('[Bank Parser] Parsing as CSV...');
    const csvData = await parseCsvFile<Record<string, unknown>>(file);
    console.log('[Bank Parser] CSV parsed, total rows:', csvData.length);

    if (csvData.length === 0) {
      console.warn('[Bank Parser] CSV returned 0 rows!');
      return [];
    }

    const headers = Object.keys(csvData[0]);
    console.log('[Bank Parser] CSV headers extracted:', headers);
    console.log('[Bank Parser] Number of headers:', headers.length);

    data = [
      headers,
      ...csvData.map((row) => headers.map((h) => row[h])),
    ] as unknown[][];

    console.log('[Bank Parser] Data array created with', data.length, 'rows (including header)');
  }

  // Detect header row
  const headerRowIndex = detectHeaderRow(data);
  console.log('[Bank Parser] Header row detected at index:', headerRowIndex);

  const headers = data[headerRowIndex] as string[];
  console.log('[Bank Parser] Headers at detected row:', headers);

  // Detect column mapping
  const mapping = detectColumnMapping(headers);
  console.log('[Bank Parser] Column mapping result:', mapping);
  console.log('[Bank Parser] Mapped fields:', Object.keys(mapping));

  // Check for critical missing mappings
  if (!mapping.date) {
    console.error('[Bank Parser] CRITICAL: No date column mapped! Headers were:', headers);
    return [];  // Don't process without date column
  }
  if (!mapping.amount) {
    console.error('[Bank Parser] CRITICAL: No amount column mapped! Headers were:', headers);
    return [];  // Don't process without amount column
  }
  if (!mapping.description) {
    console.warn('[Bank Parser] Warning: No description column mapped');
  }

  // Convert to objects
  const rows = xlsxToObjects<Record<string, unknown>>(data, headerRowIndex);
  console.log('[Bank Parser] Converted to', rows.length, 'row objects');

  if (rows.length > 0) {
    console.log('[Bank Parser] First row object:', rows[0]);
  }

  // Normalize transactions
  const transactions: ParsedTransaction[] = [];
  let skippedNoDate = 0;
  let skippedOther = 0;

  for (const row of rows) {
    const transaction = normalizeTransaction(row, mapping);
    if (transaction) {
      transactions.push(transaction);
    } else {
      // Log why row was skipped
      const dateValue = mapping.date ? row[mapping.date] : null;
      if (!dateValue) {
        skippedNoDate++;
      } else {
        skippedOther++;
        if (skippedOther <= 3) {
          console.log('[Bank Parser] Row skipped - date value:', dateValue, 'row:', row);
        }
      }
    }
  }

  console.log('[Bank Parser] Final result:');
  console.log('[Bank Parser]   - Valid transactions:', transactions.length);
  console.log('[Bank Parser]   - Skipped (no date):', skippedNoDate);
  console.log('[Bank Parser]   - Skipped (other):', skippedOther);

  if (transactions.length > 0) {
    console.log('[Bank Parser] First transaction:', transactions[0]);
    console.log('[Bank Parser] Last transaction:', transactions[transactions.length - 1]);
  }

  return transactions;
}
