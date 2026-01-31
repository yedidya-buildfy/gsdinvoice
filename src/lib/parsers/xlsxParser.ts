/**
 * XLSX file parser with Hebrew text support
 * Parses Excel files and converts to array of arrays
 */

import * as XLSX from 'xlsx';

/**
 * Parse XLSX file to array of arrays
 * @param file - File object to parse
 * @returns Promise resolving to 2D array of cell values
 */
export async function parseXlsxFile(file: File): Promise<unknown[][]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: 'array',
    codepage: 65001, // UTF-8 for Hebrew text
    cellDates: false, // Keep as serial numbers, we handle conversion
    cellNF: false,
    cellStyles: false,
  });

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  return XLSX.utils.sheet_to_json(worksheet, {
    header: 1, // Return array of arrays
    defval: '', // Default value for empty cells
  });
}

/**
 * Convert array of arrays to array of objects using header row as keys
 * @param data - 2D array from xlsx parser
 * @param headerRow - Index of row containing headers (default: 0)
 * @returns Array of objects with header keys
 */
export function xlsxToObjects<T>(data: unknown[][], headerRow = 0): T[] {
  console.log('[xlsxToObjects] Converting data, headerRow:', headerRow);
  console.log('[xlsxToObjects] Total rows in data:', data.length);

  if (data.length <= headerRow) {
    console.warn('[xlsxToObjects] No data rows after header!');
    return [];
  }

  const headers = data[headerRow] as string[];
  console.log('[xlsxToObjects] Headers from data:', headers);

  const result: T[] = [];

  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i];
    const obj: Record<string, unknown> = {};

    headers.forEach((header, index) => {
      if (header && header.trim()) {
        obj[header.trim()] = row[index];
      }
    });

    result.push(obj as T);
  }

  console.log('[xlsxToObjects] Created', result.length, 'row objects');
  if (result.length > 0) {
    console.log('[xlsxToObjects] First row keys:', Object.keys(result[0] as object));
    console.log('[xlsxToObjects] First row values:', Object.values(result[0] as object));
  }

  return result;
}
