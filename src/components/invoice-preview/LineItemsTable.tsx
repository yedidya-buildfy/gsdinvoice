import { useCallback, useMemo } from 'react'
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import type { LineItemFormData } from './hooks/useInvoiceForm'

interface LineItemsTableProps {
  items: LineItemFormData[]
  onAdd: () => void
  onUpdate: (id: string, field: keyof LineItemFormData, value: string | number | null) => void
  onRemove: (id: string) => void
}

function InlineInput({
  value,
  onChange,
  type = 'text',
  placeholder,
  align = 'left',
  className = '',
}: {
  value: string | number | null
  onChange: (value: string) => void
  type?: 'text' | 'number' | 'date'
  placeholder?: string
  align?: 'left' | 'right' | 'center'
  className?: string
}) {
  const alignClass = {
    left: 'text-left',
    right: 'text-right',
    center: 'text-center',
  }[align]

  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      dir="auto"
      className={`w-full px-2 py-1 bg-transparent border-0 text-text text-sm focus:outline-none focus:bg-surface-hover/50 rounded transition-colors ${alignClass} ${className}`}
    />
  )
}

export function LineItemsTable({
  items,
  onAdd,
  onUpdate,
  onRemove,
}: LineItemsTableProps) {
  // Check if any item has VAT amount > 0
  const showVatColumn = useMemo(() => {
    return items.some((item) => item.vat_amount && item.vat_amount > 0)
  }, [items])

  const handleFieldChange = useCallback(
    (id: string, field: keyof LineItemFormData, value: string) => {
      if (field === 'amount' || field === 'vat_rate' || field === 'vat_amount') {
        if (value === '') {
          onUpdate(id, field, field === 'amount' ? 0 : null)
        } else {
          const numValue = parseFloat(value)
          onUpdate(id, field, isNaN(numValue) ? (field === 'amount' ? 0 : null) : numValue)
        }
      } else {
        onUpdate(id, field, value)
      }
    },
    [onUpdate]
  )

  // Dynamic grid columns based on whether VAT column is shown
  const gridCols = showVatColumn
    ? 'grid-cols-[1fr_180px_100px_120px_100px_40px]'
    : 'grid-cols-[1fr_180px_100px_120px_40px]'

  return (
    <div className="border border-text-muted/20 rounded-lg overflow-hidden">
      {/* Table header */}
      <div className={`grid ${gridCols} gap-2 px-3 py-2 bg-surface/50 border-b border-text-muted/20`}>
        <div className="text-xs font-medium text-text-muted">Description</div>
        <div className="text-xs font-medium text-text-muted">Reference ID</div>
        <div className="text-xs font-medium text-text-muted text-center">Date</div>
        <div className="text-xs font-medium text-text-muted text-right">Amount</div>
        {showVatColumn && (
          <div className="text-xs font-medium text-text-muted text-right">VAT Amount</div>
        )}
        <div />
      </div>

      {/* Table body */}
      <div className="divide-y divide-text-muted/10 max-h-[300px] overflow-y-auto">
        {items.length === 0 ? (
          <div className="px-3 py-4 text-center text-text-muted text-sm">
            No line items. Click &quot;Add Item&quot; to add one.
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className={`group grid ${gridCols} gap-2 px-3 py-1 hover:bg-surface/30 transition-colors items-center`}
            >
              <InlineInput
                value={item.description}
                onChange={(v) => handleFieldChange(item.id, 'description', v)}
                placeholder="Item description"
              />
              <InlineInput
                value={item.reference_id}
                onChange={(v) => handleFieldChange(item.id, 'reference_id', v)}
                placeholder="Ref ID"
                className="font-mono text-xs"
              />
              <InlineInput
                value={item.transaction_date}
                onChange={(v) => handleFieldChange(item.id, 'transaction_date', v)}
                type="date"
                align="center"
              />
              <div className="flex items-center justify-end gap-1">
                <InlineInput
                  value={item.amount || ''}
                  onChange={(v) => handleFieldChange(item.id, 'amount', v)}
                  type="number"
                  placeholder="0.00"
                  align="right"
                  className="flex-1"
                />
                <span className="text-text-muted text-xs w-8 text-left">
                  {item.currency || 'ILS'}
                </span>
              </div>
              {showVatColumn && (
                <div className="flex items-center justify-end gap-1">
                  <InlineInput
                    value={item.vat_amount ?? ''}
                    onChange={(v) => handleFieldChange(item.id, 'vat_amount', v)}
                    type="number"
                    placeholder="0.00"
                    align="right"
                    className="flex-1"
                  />
                  <span className="text-text-muted text-xs w-8 text-left">
                    {item.currency || 'ILS'}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className="p-1 rounded text-text-muted opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-all"
                aria-label="Delete item"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add button */}
      <div className="px-3 py-2 border-t border-text-muted/20">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-primary hover:bg-primary/10 rounded-lg transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Add Item
        </button>
      </div>
    </div>
  )
}
