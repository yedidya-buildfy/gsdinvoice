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
      transformHeader: (header) => header.trim().replace(/\r\n/g, ' '),
      complete: (results) => resolve(results.data as T[]),
      error: (error) => reject(new Error(`CSV parse error: ${error.message}`)),
    });
  });
}
