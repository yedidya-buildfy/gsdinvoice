"use client"

import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { DocumentIcon } from '@heroicons/react/24/outline'

interface SpreadsheetViewerProps {
  url: string
  fileType?: string
}

interface SheetData {
  name: string
  data: string[][]
}

const MAX_ROWS = 1000

function hasRTLContent(text: string): boolean {
  const rtlPattern = /[\u0590-\u05FF\u0600-\u06FF]/
  return rtlPattern.test(text)
}

async function parseSpreadsheet(url: string, fileType?: string): Promise<SheetData[]> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Failed to load spreadsheet')
  }

  const arrayBuffer = await response.arrayBuffer()
  const isCSV = fileType?.includes('csv') || url.toLowerCase().includes('.csv')

  if (isCSV) {
    // Try UTF-8 first, fallback to Hebrew encoding
    let text = new TextDecoder('utf-8').decode(arrayBuffer)
    if (text.includes('\ufffd')) {
      text = new TextDecoder('windows-1255').decode(arrayBuffer)
    }

    const rows = text.split('\n').map(line => {
      const cells: string[] = []
      let current = ''
      let inQuotes = false

      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === ',' && !inQuotes) {
          cells.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      cells.push(current.trim())
      return cells
    }).filter(row => row.some(cell => cell.length > 0))

    return [{
      name: 'Sheet1',
      data: rows.slice(0, MAX_ROWS),
    }]
  }

  // XLSX parsing
  const workbook = XLSX.read(arrayBuffer, {
    type: 'array',
    codepage: 65001,
    cellDates: true,
  })

  return workbook.SheetNames.map(name => {
    const worksheet = workbook.Sheets[name]
    const jsonData = XLSX.utils.sheet_to_json<string[]>(worksheet, {
      header: 1,
      defval: '',
      raw: false,
    })

    return {
      name,
      data: jsonData.slice(0, MAX_ROWS).map(row => row.map(String)),
    }
  })
}

export function SpreadsheetViewer({ url, fileType }: SpreadsheetViewerProps) {
  const [sheets, setSheets] = useState<SheetData[]>([])
  const [activeSheet, setActiveSheet] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string>('')

  useEffect(() => {
    async function loadSpreadsheet() {
      setIsLoading(true)
      setError(null)

      try {
        // Extract filename from URL
        const urlParts = url.split('/')
        const name = urlParts[urlParts.length - 1]?.split('?')[0] || 'Spreadsheet'
        setFileName(decodeURIComponent(name))

        const parsedSheets = await parseSpreadsheet(url, fileType)
        setSheets(parsedSheets)
        setActiveSheet(0)
      } catch (err) {
        console.error('[SpreadsheetViewer] Error:', err)
        setError(err instanceof Error ? err.message : 'Failed to load spreadsheet')
      } finally {
        setIsLoading(false)
      }
    }

    loadSpreadsheet()
  }, [url, fileType])

  const currentSheet = sheets[activeSheet]

  // Get max columns and generate headers (A, B, C, ...)
  const { maxCols, columnHeaders } = useMemo(() => {
    if (!currentSheet) return { maxCols: 0, columnHeaders: [] }
    const max = Math.max(...currentSheet.data.map(row => row.length), 1)
    const headers = Array.from({ length: max }, (_, i) =>
      String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : '')
    )
    return { maxCols: max, columnHeaders: headers }
  }, [currentSheet])

  // Detect RTL for the sheet
  const sheetIsRTL = useMemo(() => {
    if (!currentSheet) return false
    const sampleCells = currentSheet.data.flat().slice(0, 100).filter(Boolean)
    const rtlCount = sampleCells.filter(hasRTLContent).length
    return rtlCount > sampleCells.length * 0.3
  }, [currentSheet])

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 rounded-lg border border-gray-800">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading spreadsheet...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 rounded-lg border border-gray-800">
        <div className="text-center">
          <DocumentIcon className="w-16 h-16 text-gray-700 mx-auto mb-4" />
          <p className="text-red-400">{error}</p>
        </div>
      </div>
    )
  }

  if (!currentSheet || currentSheet.data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 rounded-lg border border-gray-800">
        <div className="text-center">
          <DocumentIcon className="w-16 h-16 text-gray-700 mx-auto mb-4" />
          <p className="text-gray-400">No data found in spreadsheet</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full bg-gray-900 rounded-lg border border-gray-800 overflow-hidden flex flex-col">
      {/* Spreadsheet Header */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <DocumentIcon className="w-5 h-5 text-green-500" />
          <span className="text-sm font-medium text-white truncate max-w-[200px]">
            {fileName}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {/* Sheet tabs */}
          {sheets.length > 1 && (
            <div className="flex items-center gap-1">
              {sheets.map((sheet, index) => (
                <button
                  key={sheet.name}
                  type="button"
                  onClick={() => setActiveSheet(index)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    index === activeSheet
                      ? 'bg-green-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  {sheet.name}
                </button>
              ))}
            </div>
          )}
          <span className="text-xs text-gray-400">
            {currentSheet.data.length} rows x {maxCols} columns
          </span>
        </div>
      </div>

      {/* Spreadsheet Table */}
      <div className="flex-1 overflow-auto" dir={sheetIsRTL ? 'rtl' : 'ltr'}>
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-800">
              <th className="w-12 px-3 py-2 text-xs font-medium text-gray-400 border-r border-b border-gray-700 bg-gray-850 sticky left-0 z-20">
                #
              </th>
              {columnHeaders.map((header, i) => (
                <th
                  key={i}
                  className="min-w-[120px] px-3 py-2 text-xs font-medium text-gray-400 border-r border-b border-gray-700 bg-gray-800 text-left"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {currentSheet.data.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-gray-800/50 transition-colors">
                {/* Row number */}
                <td className="px-3 py-2 text-xs text-gray-500 border-r border-b border-gray-800 bg-gray-900/50 text-center font-mono sticky left-0">
                  {rowIndex + 1}
                </td>
                {/* Cells */}
                {columnHeaders.map((_, colIndex) => {
                  const cellValue = row[colIndex] ?? ''
                  const cellIsRTL = hasRTLContent(cellValue)

                  return (
                    <td
                      key={colIndex}
                      className="px-3 py-2 text-xs text-gray-300 border-r border-b border-gray-800 whitespace-nowrap"
                      style={{
                        direction: cellIsRTL ? 'rtl' : 'ltr',
                        textAlign: cellIsRTL ? 'right' : 'left',
                      }}
                    >
                      {cellValue}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
