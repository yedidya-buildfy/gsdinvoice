/**
 * CSV file parser with Hebrew text support
 * Uses papaparse for robust CSV parsing
 */

import Papa from 'papaparse';

/**
 * Parse CSV file to array of objects
 * @param file - File object to parse
 * @returns Promise resolving to array of row objects
 */
export function parseCsvFile<T>(file: File): Promise<T[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      encoding: 'UTF-8',
      skipEmptyLines: true,
      dynamicTyping: false, // Keep as strings for consistent parsing
      transformHeader: (header, index) => {
        const trimmed = header.trim().replace(/\r\n/g, ' ');
        console.log(`[CSV Parser] Header ${index}: "${header}" -> "${trimmed}"`);
        return trimmed;
      },
      complete: (results) => {
        console.log('[CSV Parser] Parse complete');
        console.log('[CSV Parser] Total rows parsed:', results.data.length);
        console.log('[CSV Parser] Fields/Headers:', results.meta.fields);
        console.log('[CSV Parser] Errors:', results.errors);
        if (results.data.length > 0) {
          console.log('[CSV Parser] First row sample:', results.data[0]);
        }
        if (results.data.length > 1) {
          console.log('[CSV Parser] Second row sample:', results.data[1]);
        }
        resolve(results.data as T[]);
      },
      error: (error) => {
        console.error('[CSV Parser] Parse error:', error);
        reject(new Error(`CSV parse error: ${error.message}`));
      },
    });
  });
}
