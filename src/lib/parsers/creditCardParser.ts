/**
 * Credit card statement parser with automatic column detection
 * Handles Israeli credit card exports (xlsx/csv) with varied column formats
 */

import { parseXlsxFile, xlsxToObjects } from './xlsxParser';
import { parseCsvFile } from './csvParser';
import { shekelToAgorot } from '@/lib/utils/currency';
import { parseIsraeliDate } from '@/lib/utils/dateUtils';

/**
 * Parsed credit card transaction interface
 * All amounts are in agorot (1 ILS = 100 agorot)
 * Foreign amounts stored separately for reference
 */
export interface ParsedCreditCardTransaction {
  date: string; // ISO YYYY-MM-DD (transaction date)
  billingDate: string | null; // ISO YYYY-MM-DD (charge date)
  merchantName: string; // Business name
  amountAgorot: number; // ILS amount in agorot (always present)
  foreignAmount: number | null; // Original amount if foreign currency
  foreignCurrency: string | null; // 'USD', 'EUR', etc.
  cardLastFour: string; // Last 4 digits of card
  transactionType: string | null; // 'רגילה', 'הוראת קבע'
  notes: string | null; // Raw notes field
}

/**
 * Column patterns for Israeli credit cards
 * Based on real credit card statement format (פירוטי אשראי.xlsx)
 */
const CREDIT_CARD_COLUMN_PATTERNS = {
  date: ['תאריך עסקה', 'תאריך'],
  billingDate: ['מועד חיוב', 'תאריך חיוב'],
  merchantName: ['שם בית עסק', 'בית עסק', 'שם בית העסק'],
  amountILS: ['סכום בש"ח', 'סכום בשקלים', 'סכום'],
  foreignAmount: ['סכום במטבע מקור', 'סכום בדולר', 'סכום במט"ח'],
  card: ['כרטיס', 'מספר כרטיס', '4 ספרות אחרונות'],
  transactionType: ['סוג עסקה'],
  notes: ['הערות', 'פרטים נוספים'],
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
    .replace(/\$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detect column mapping from headers
 * Maps field names to actual column names in the file
 * Uses exact matching first, then falls back to includes matching
 * First match wins to avoid overwriting with longer column names
 */
function detectColumnMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};

  headers.forEach((header) => {
    const normalized = normalizeHeader(header);
    // Store trimmed header to match xlsxToObjects keys
    const trimmedHeader = header.trim();

    // Check each pattern type
    for (const [field, patterns] of Object.entries(CREDIT_CARD_COLUMN_PATTERNS)) {
      // Skip if already mapped (first match wins)
      if (mapping[field]) continue;

      for (const pattern of patterns) {
        const normalizedPattern = normalizeHeader(pattern);
        // Prefer exact match, then check if starts with pattern
        // This prevents "מזהה כרטיס בארנק דיגילטי" from matching "כרטיס" pattern
        const isExactMatch = normalized === normalizedPattern;
        const startsWithPattern = normalized.startsWith(normalizedPattern);

        if (isExactMatch || startsWithPattern) {
          mapping[field] = trimmedHeader;
          break;
        }
      }
    }
  });

  return mapping;
}

/**
 * Detect header row by scanning first 15 rows
 * Looks for row containing 'תאריך' AND ('בית עסק' OR 'סכום')
 */
function detectHeaderRow(data: unknown[][]): number {
  for (let i = 0; i < Math.min(15, data.length); i++) {
    const row = data[i];
    if (!Array.isArray(row)) continue;

    const rowStr = row.map((cell) => String(cell || '')).join('|');
    const hasDate = rowStr.includes('תאריך');
    const hasAmount =
      rowStr.includes('בית עסק') ||
      rowStr.includes('סכום');

    if (hasDate && hasAmount) {
      return i;
    }
  }

  return 0; // Default to first row if not found
}

/**
 * Extract last 4 digits from card field
 * Handles formats like: "1234", "**** 1234", "ויזה 4176", "מאסטרקארד 9710"
 */
function extractCardLastFour(cardValue: unknown): string {
  const str = String(cardValue || '').trim();

  // Skip empty or placeholder values
  if (!str || str === '-' || str === '—') {
    return '0000';
  }

  // Look for 4 digits at the end of the string (common format: "ויזה 4176")
  const endMatch = str.match(/(\d{4})\s*$/);
  if (endMatch) {
    return endMatch[1];
  }

  // Fallback: find any 4 consecutive digits
  const matches = str.match(/\d{4}/g);
  if (matches && matches.length > 0) {
    // Take the last match
    return matches[matches.length - 1];
  }

  return '0000'; // Default if not found
}

/**
 * Normalize credit card transaction from raw row object
 * Converts all fields to proper types and formats
 */
function normalizeCreditCardTransaction(
  row: Record<string, unknown>,
  mapping: Record<string, string>
): ParsedCreditCardTransaction | null {
  // Extract date - required field
  const dateValue = mapping.date ? row[mapping.date] : null;
  const date = parseIsraeliDate(dateValue as string | number | Date);
  if (!date) {
    return null; // Skip rows without valid date
  }

  // Extract billing date
  const billingDateValue = mapping.billingDate ? row[mapping.billingDate] : null;
  const billingDate = parseIsraeliDate(billingDateValue as string | number | Date);

  // Extract merchant name - required field
  const merchantName = mapping.merchantName
    ? String(row[mapping.merchantName] || '')
    : '';
  if (!merchantName.trim()) {
    return null; // Skip rows without merchant name
  }

  // Extract ILS amount
  let amountAgorot = 0;
  if (mapping.amountILS) {
    const amountValue = row[mapping.amountILS];
    if (typeof amountValue === 'number') {
      amountAgorot = shekelToAgorot(amountValue);
    } else if (typeof amountValue === 'string' && amountValue.trim()) {
      amountAgorot = shekelToAgorot(amountValue);
    }
  }

  // Extract foreign amount if present
  let foreignAmount: number | null = null;
  if (mapping.foreignAmount) {
    const foreignValue = row[mapping.foreignAmount];
    if (typeof foreignValue === 'number' && foreignValue !== 0) {
      foreignAmount = foreignValue;
    } else if (typeof foreignValue === 'string' && foreignValue.trim()) {
      const parsed = parseFloat(foreignValue.replace(/[^\d.-]/g, ''));
      if (!isNaN(parsed) && parsed !== 0) {
        foreignAmount = parsed;
      }
    }
  }

  // Infer foreign currency (simple heuristic - could be improved)
  let foreignCurrency: string | null = null;
  if (foreignAmount !== null) {
    // Check if column header mentions currency
    const foreignColName = mapping.foreignAmount || '';
    if (foreignColName.includes('דולר') || foreignColName.includes('USD')) {
      foreignCurrency = 'USD';
    } else if (foreignColName.includes('יורו') || foreignColName.includes('EUR')) {
      foreignCurrency = 'EUR';
    } else {
      foreignCurrency = 'USD'; // Default assumption for foreign currency
    }
  }

  // Extract card last four
  const cardValue = mapping.card ? row[mapping.card] : null;
  const cardLastFour = extractCardLastFour(cardValue);

  // Extract transaction type
  const transactionType = mapping.transactionType
    ? String(row[mapping.transactionType] || '')
    : null;

  // Extract notes
  const notes = mapping.notes
    ? String(row[mapping.notes] || '')
    : null;

  return {
    date,
    billingDate,
    merchantName,
    amountAgorot,
    foreignAmount,
    foreignCurrency,
    cardLastFour,
    transactionType,
    notes,
  };
}

/**
 * Parse credit card statement file (xlsx or csv)
 * Automatically detects file type, header row, and column mapping
 *
 * @param file - File object to parse
 * @returns Promise resolving to array of normalized credit card transactions
 */
export async function parseCreditCardStatement(
  file: File
): Promise<ParsedCreditCardTransaction[]> {
  const fileName = file.name.toLowerCase();
  const isXlsx = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
  const isCsv = fileName.endsWith('.csv');

  if (!isXlsx && !isCsv) {
    throw new Error('Unsupported file type. Expected .xlsx or .csv');
  }

  let data: unknown[][];

  if (isXlsx) {
    // Parse xlsx to array of arrays
    data = await parseXlsxFile(file);
  } else {
    // Parse csv to objects, then convert to array of arrays for consistency
    const csvData = await parseCsvFile<Record<string, unknown>>(file);
    if (csvData.length === 0) {
      return [];
    }
    const headers = Object.keys(csvData[0]);
    data = [
      headers,
      ...csvData.map((row) => headers.map((h) => row[h])),
    ] as unknown[][];
  }

  // Detect header row
  const headerRowIndex = detectHeaderRow(data);
  const headers = data[headerRowIndex] as string[];

  // Detect column mapping
  const mapping = detectColumnMapping(headers);

  // Convert to objects
  const rows = xlsxToObjects<Record<string, unknown>>(data, headerRowIndex);

  // Normalize transactions
  const transactions: ParsedCreditCardTransaction[] = [];
  for (const row of rows) {
    const transaction = normalizeCreditCardTransaction(row, mapping);
    if (transaction) {
      transactions.push(transaction);
    }
  }

  return transactions;
}
