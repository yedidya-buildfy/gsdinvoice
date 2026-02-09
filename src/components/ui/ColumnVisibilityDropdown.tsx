import { useState, useRef, useEffect } from 'react'
import { ViewColumnsIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import type { ColumnDef } from '@/types/columnVisibility'

interface ColumnVisibilityDropdownProps<K extends string> {
  columns: ColumnDef<K>[]
  visibility: Record<K, boolean>
  onToggle: (key: K) => void
  onReset: () => void
  activeConditionalColumns?: Set<K>
}

export function ColumnVisibilityDropdown<K extends string>({
  columns,
  visibility,
  onToggle,
  onReset,
  activeConditionalColumns,
}: ColumnVisibilityDropdownProps<K>) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Filter columns: if activeConditionalColumns is provided, only show columns that are in it or are always present
  const visibleColumns = activeConditionalColumns
    ? columns.filter((col) => activeConditionalColumns.has(col.key))
    : columns

  const hiddenCount = visibleColumns.filter((col) => visibility[col.key] === false).length

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-text-muted hover:text-text hover:bg-surface/50 transition-colors"
      >
        <ViewColumnsIcon className="w-4 h-4" />
        Columns
        {hiddenCount > 0 && (
          <span className="rounded-full bg-primary/20 text-primary px-1.5 py-0.5 text-[10px] leading-none font-semibold">
            {hiddenCount} hidden
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-text-muted/20 bg-surface shadow-lg">
          <div className="p-1">
            <div className="max-h-64 overflow-y-auto">
              {visibleColumns.map((col) => {
                const checked = visibility[col.key] !== false
                return (
                  <button
                    key={col.key}
                    type="button"
                    onClick={() => onToggle(col.key)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text hover:bg-background transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      readOnly
                      className="checkbox-dark pointer-events-none"
                    />
                    <span>{col.label}</span>
                  </button>
                )
              })}
            </div>

            {hiddenCount > 0 && (
              <>
                <div className="my-1 border-t border-text-muted/10" />
                <button
                  type="button"
                  onClick={() => {
                    onReset()
                    setIsOpen(false)
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-text-muted hover:text-text hover:bg-background transition-colors"
                >
                  <ArrowPathIcon className="w-3.5 h-3.5" />
                  Reset All
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
