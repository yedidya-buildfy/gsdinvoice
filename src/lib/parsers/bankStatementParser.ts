/**
 * Bank statement parser with automatic column detection
 * Handles Israeli bank exports (xlsx/csv) with varied column formats
 */

import { parseXlsxFile, xlsxToObjects } from './xlsxParser';
import { parseCsvFile } from './csvParser';
import { shekelToAgorot } from '@/lib/utils/currency';
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
 */
function detectColumnMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};

  headers.forEach((header) => {
    const normalized = normalizeHeader(header);

    // Check each pattern type
    for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
      for (const pattern of patterns) {
        const normalizedPattern = normalizeHeader(pattern);
        if (normalized.includes(normalizedPattern)) {
          mapping[field] = header;
          break;
        }
      }
    }
  });

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
function normalizeTransaction(
  row: Record<string, unknown>,
  mapping: Record<string, string>
): ParsedTransaction | null {
  // Extract date - required field
  const dateValue = mapping.date ? row[mapping.date] : null;
  const date = parseIsraeliDate(dateValue as string | number | Date);
  if (!date) {
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
  const transactions: ParsedTransaction[] = [];
  for (const row of rows) {
    const transaction = normalizeTransaction(row, mapping);
    if (transaction) {
      transactions.push(transaction);
    }
  }

  return transactions;
}
