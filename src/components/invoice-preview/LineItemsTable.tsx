import { useCallback } from 'react'
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import type { LineItemFormData } from './hooks/useInvoiceForm'
import { getCurrencySymbol } from '@/lib/utils/currency'

interface LineItemsTableProps {
  items: LineItemFormData[]
  onAdd: () => void
  onUpdate: (id: string, field: keyof LineItemFormData, value: string | number) => void
  onRemove: (id: string) => void
  currency: string
}

function InlineInput({
  value,
  onChange,
  type = 'text',
  placeholder,
  align = 'left',
}: {
  value: string | number
  onChange: (value: string) => void
  type?: 'text' | 'number'
  placeholder?: string
  align?: 'left' | 'right' | 'center'
}) {
  const alignClass = {
    left: 'text-left',
    right: 'text-right',
    center: 'text-center',
  }[align]

  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      dir="auto"
      className={`w-full px-2 py-1 bg-transparent border-0 text-text text-sm focus:outline-none focus:bg-surface-hover/50 rounded transition-colors ${alignClass}`}
    />
  )
}

export function LineItemsTable({
  items,
  onAdd,
  onUpdate,
  onRemove,
  currency,
}: LineItemsTableProps) {
  const currencySymbol = getCurrencySymbol(currency)

  const handleFieldChange = useCallback(
    (id: string, field: keyof LineItemFormData, value: string) => {
      if (field === 'quantity' || field === 'unit_price' || field === 'total') {
        const numValue = value === '' ? 0 : parseFloat(value)
        onUpdate(id, field, isNaN(numValue) ? 0 : numValue)
      } else {
        onUpdate(id, field, value)
      }
    },
    [onUpdate]
  )

  return (
    <div className="border border-text-muted/20 rounded-lg overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[1fr_80px_100px_100px_40px] gap-2 px-3 py-2 bg-surface/50 border-b border-text-muted/20">
        <div className="text-xs font-medium text-text-muted">Description</div>
        <div className="text-xs font-medium text-text-muted text-center">
          Qty
        </div>
        <div className="text-xs font-medium text-text-muted text-right">
          Unit Price
        </div>
        <div className="text-xs font-medium text-text-muted text-right">
          Total
        </div>
        <div />
      </div>

      {/* Table body */}
      <div className="divide-y divide-text-muted/10">
        {items.length === 0 ? (
          <div className="px-3 py-4 text-center text-text-muted text-sm">
            No line items. Click &quot;Add Item&quot; to add one.
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="group grid grid-cols-[1fr_80px_100px_100px_40px] gap-2 px-3 py-1 hover:bg-surface/30 transition-colors items-center"
            >
              <InlineInput
                value={item.description}
                onChange={(v) => handleFieldChange(item.id, 'description', v)}
                placeholder="Item description"
              />
              <InlineInput
                value={item.quantity || ''}
                onChange={(v) => handleFieldChange(item.id, 'quantity', v)}
                type="number"
                placeholder="0"
                align="center"
              />
              <div className="flex items-center">
                <span className="text-text-muted text-xs mr-1">
                  {currencySymbol}
                </span>
                <InlineInput
                  value={item.unit_price || ''}
                  onChange={(v) => handleFieldChange(item.id, 'unit_price', v)}
                  type="number"
                  placeholder="0.00"
                  align="right"
                />
              </div>
              <div className="flex items-center">
                <span className="text-text-muted text-xs mr-1">
                  {currencySymbol}
                </span>
                <InlineInput
                  value={item.total || ''}
                  onChange={(v) => handleFieldChange(item.id, 'total', v)}
                  type="number"
                  placeholder="0.00"
                  align="right"
                />
              </div>
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
