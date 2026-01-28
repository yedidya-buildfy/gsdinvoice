import { LineItemsTable } from './LineItemsTable'
import type { UseInvoiceFormReturn } from './hooks/useInvoiceForm'
import { getCurrenciesForSelect, getCurrencySymbol } from '@/lib/utils/currency'

interface ExtractedDataPanelProps {
  form: UseInvoiceFormReturn
  confidenceScore: number | null
}

function ConfidenceBadge({ score }: { score: number | null }) {
  if (score === null) return null

  let colorClass: string
  let label: string

  if (score >= 80) {
    colorClass = 'bg-green-500/20 text-green-400'
    label = 'High'
  } else if (score >= 50) {
    colorClass = 'bg-yellow-500/20 text-yellow-400'
    label = 'Medium'
  } else {
    colorClass = 'bg-red-500/20 text-red-400'
    label = 'Low'
  }

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
      {label} ({score}%)
    </span>
  )
}

function FormField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  prefix,
  suffix,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'number' | 'date'
  placeholder?: string
  prefix?: string
  suffix?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-muted mb-1.5">
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">
            {prefix}
          </span>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          dir="auto"
          className={`w-full px-3 py-2 bg-background border border-text-muted/20 rounded-lg text-text text-sm focus:outline-none focus:border-primary transition-colors ${
            prefix ? 'pl-8' : ''
          } ${suffix ? 'pr-8' : ''}`}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-muted mb-1.5">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-background border border-text-muted/20 rounded-lg text-text text-sm focus:outline-none focus:border-primary transition-colors"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

// Get currencies for the dropdown, with common currencies first
const CURRENCY_OPTIONS = getCurrenciesForSelect().map((c) => ({
  value: c.code,
  label: `${c.code} - ${c.name}`,
}))

export function ExtractedDataPanel({
  form,
  confidenceScore,
}: ExtractedDataPanelProps) {
  const { invoiceData, setInvoiceField, lineItems, addLineItem, updateLineItem, removeLineItem } = form

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 space-y-6">
        {/* Header with confidence */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text">Invoice Details</h3>
          <ConfidenceBadge score={confidenceScore} />
        </div>

        {/* Basic Info */}
        <div className="space-y-4">
          <FormField
            label="Vendor Name"
            value={invoiceData.vendor_name}
            onChange={(value) => setInvoiceField('vendor_name', value)}
            placeholder="Enter vendor name"
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Invoice Number"
              value={invoiceData.invoice_number}
              onChange={(value) => setInvoiceField('invoice_number', value)}
              placeholder="INV-001"
            />
            <FormField
              label="Invoice Date"
              value={invoiceData.invoice_date}
              onChange={(value) => setInvoiceField('invoice_date', value)}
              type="date"
            />
          </div>

          <SelectField
            label="Currency"
            value={invoiceData.currency}
            onChange={(value) => setInvoiceField('currency', value)}
            options={CURRENCY_OPTIONS}
          />
        </div>

        {/* Amounts */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-text-muted">Amounts</h4>

          <div className="grid grid-cols-3 gap-4">
            <FormField
              label="Subtotal"
              value={invoiceData.subtotal}
              onChange={(value) => setInvoiceField('subtotal', value)}
              type="number"
              prefix={getCurrencySymbol(invoiceData.currency)}
            />
            <FormField
              label="VAT Amount"
              value={invoiceData.vat_amount}
              onChange={(value) => setInvoiceField('vat_amount', value)}
              type="number"
              prefix={getCurrencySymbol(invoiceData.currency)}
            />
            <FormField
              label="Total Amount"
              value={invoiceData.total_amount}
              onChange={(value) => setInvoiceField('total_amount', value)}
              type="number"
              prefix={getCurrencySymbol(invoiceData.currency)}
            />
          </div>
        </div>

        {/* Line Items */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-text-muted">Line Items</h4>
          <LineItemsTable
            items={lineItems}
            onAdd={addLineItem}
            onUpdate={updateLineItem}
            onRemove={removeLineItem}
            currency={invoiceData.currency}
          />
        </div>
      </div>
    </div>
  )
}
