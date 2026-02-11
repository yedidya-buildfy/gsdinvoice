import { MagnifyingGlassIcon, XMarkIcon, FunnelIcon, LinkIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { RangeCalendarCard } from '@/components/ui/date-picker'
import type { InvoiceFilterState } from './invoiceFilterTypes'

interface InvoiceFiltersProps {
  filters: InvoiceFilterState
  onChange: (filters: InvoiceFilterState) => void
  children?: React.ReactNode
}

const FILE_TYPE_OPTIONS = [
  { value: 'pdf', label: 'PDF' },
  { value: 'xlsx', label: 'Excel' },
  { value: 'csv', label: 'CSV' },
  { value: 'image', label: 'Image' },
]

const AI_STATUS_OPTIONS: { value: InvoiceFilterState['aiStatus']; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'processed', label: 'Processed' },
  { value: 'failed', label: 'Failed' },
]

const BANK_LINK_OPTIONS: { value: InvoiceFilterState['bankLinkStatus']; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'yes', label: 'Linked' },
  { value: 'partly', label: 'Partial' },
  { value: 'no', label: 'Not Linked' },
]

const APPROVAL_OPTIONS: { value: InvoiceFilterState['approvalStatus']; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'approved', label: 'Approved' },
  { value: 'not_approved', label: 'Not Approved' },
]

function FileTypeMultiSelect({
  value,
  onChange,
}: {
  value: string[]
  onChange: (value: string[]) => void
}) {
  const toggleType = (type: string) => {
    if (value.includes(type)) {
      onChange(value.filter((t) => t !== type))
    } else {
      onChange([...value, type])
    }
  }

  const displayText =
    value.length === 0
      ? 'File Type'
      : value.length === 1
        ? FILE_TYPE_OPTIONS.find((o) => o.value === value[0])?.label || value[0]
        : `${value.length} types`

  return (
    <div className="relative group">
      <button
        type="button"
        className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-text-muted/20 rounded-lg text-text hover:border-text-muted/40 transition-colors text-sm"
      >
        <span>{displayText}</span>
        {value.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onChange([])
            }}
            className="p-0.5 rounded hover:bg-background/50"
          >
            <XMarkIcon className="w-3.5 h-3.5 text-text-muted hover:text-text" />
          </button>
        )}
      </button>
      <div className="absolute top-full start-0 mt-1 z-50 hidden group-hover:block bg-surface border border-text-muted/20 rounded-lg shadow-lg min-w-[140px]">
        {FILE_TYPE_OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex items-center gap-2 px-3 py-2 hover:bg-background/50 cursor-pointer text-sm"
          >
            <input
              type="checkbox"
              checked={value.includes(option.value)}
              onChange={() => toggleType(option.value)}
              className="checkbox-dark"
            />
            <span className="text-text">{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

function AIStatusSelect({
  value,
  onChange,
}: {
  value: InvoiceFilterState['aiStatus']
  onChange: (value: InvoiceFilterState['aiStatus']) => void
}) {
  const selectedLabel = AI_STATUS_OPTIONS.find((opt) => opt.value === value)?.label || 'All Statuses'
  const isFiltered = value !== 'all'

  return (
    <div className="relative group">
      <button
        type="button"
        className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-text-muted/20 rounded-lg text-text hover:border-text-muted/40 transition-colors text-sm"
      >
        <FunnelIcon className="w-4 h-4 text-text-muted" />
        <span>{selectedLabel}</span>
        {isFiltered && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onChange('all')
            }}
            className="p-0.5 rounded hover:bg-background/50"
          >
            <XMarkIcon className="w-3.5 h-3.5 text-text-muted hover:text-text" />
          </button>
        )}
      </button>
      <div className="absolute top-full start-0 mt-1 z-50 hidden group-hover:block bg-surface border border-text-muted/20 rounded-lg shadow-lg min-w-[140px]">
        {AI_STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-background/50 text-start text-sm transition-colors first:rounded-t-lg last:rounded-b-lg ${
              value === option.value ? 'text-primary font-medium' : 'text-text'
            }`}
          >
            {value === option.value && <span className="text-primary">&#10003;</span>}
            <span className={value === option.value ? '' : 'ps-5'}>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function BankLinkStatusSelect({
  value,
  onChange,
}: {
  value: InvoiceFilterState['bankLinkStatus']
  onChange: (value: InvoiceFilterState['bankLinkStatus']) => void
}) {
  const selectedLabel = BANK_LINK_OPTIONS.find((opt) => opt.value === value)?.label || 'All'
  const isFiltered = value !== 'all'

  return (
    <div className="relative group">
      <button
        type="button"
        className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-text-muted/20 rounded-lg text-text hover:border-text-muted/40 transition-colors text-sm"
      >
        <LinkIcon className="w-4 h-4 text-text-muted" />
        <span>Link: {selectedLabel}</span>
        {isFiltered && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onChange('all')
            }}
            className="p-0.5 rounded hover:bg-background/50"
          >
            <XMarkIcon className="w-3.5 h-3.5 text-text-muted hover:text-text" />
          </button>
        )}
      </button>
      <div className="absolute top-full start-0 mt-1 z-50 hidden group-hover:block bg-surface border border-text-muted/20 rounded-lg shadow-lg min-w-[140px]">
        {BANK_LINK_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-background/50 text-start text-sm transition-colors first:rounded-t-lg last:rounded-b-lg ${
              value === option.value ? 'text-primary font-medium' : 'text-text'
            }`}
          >
            {value === option.value && <span className="text-primary">&#10003;</span>}
            <span className={value === option.value ? '' : 'ps-5'}>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function ApprovalStatusSelect({
  value,
  onChange,
}: {
  value: InvoiceFilterState['approvalStatus']
  onChange: (value: InvoiceFilterState['approvalStatus']) => void
}) {
  const selectedLabel = APPROVAL_OPTIONS.find((opt) => opt.value === value)?.label || 'All'
  const isFiltered = value !== 'all'

  return (
    <div className="relative group">
      <button
        type="button"
        className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-text-muted/20 rounded-lg text-text hover:border-text-muted/40 transition-colors text-sm"
      >
        <CheckCircleIcon className="w-4 h-4 text-text-muted" />
        <span>Approved: {selectedLabel}</span>
        {isFiltered && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onChange('all')
            }}
            className="p-0.5 rounded hover:bg-background/50"
          >
            <XMarkIcon className="w-3.5 h-3.5 text-text-muted hover:text-text" />
          </button>
        )}
      </button>
      <div className="absolute top-full start-0 mt-1 z-50 hidden group-hover:block bg-surface border border-text-muted/20 rounded-lg shadow-lg min-w-[140px]">
        {APPROVAL_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-background/50 text-start text-sm transition-colors first:rounded-t-lg last:rounded-b-lg ${
              value === option.value ? 'text-primary font-medium' : 'text-text'
            }`}
          >
            {value === option.value && <span className="text-primary">&#10003;</span>}
            <span className={value === option.value ? '' : 'ps-5'}>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function InvoiceFilters({ filters, onChange, children }: InvoiceFiltersProps) {
  const handleDateChange = (startDate: string, endDate: string) => {
    onChange({ ...filters, dateFrom: startDate, dateTo: endDate })
  }

  return (
    <div className="flex flex-wrap gap-3 items-center">
      {/* Date range picker */}
      <RangeCalendarCard
        startDate={filters.dateFrom}
        endDate={filters.dateTo}
        onChange={handleDateChange}
      />

      {/* File type multi-select */}
      <FileTypeMultiSelect
        value={filters.fileTypes}
        onChange={(fileTypes) => onChange({ ...filters, fileTypes })}
      />

      {/* AI Status select */}
      <AIStatusSelect
        value={filters.aiStatus}
        onChange={(aiStatus) => onChange({ ...filters, aiStatus })}
      />

      {/* Bank Link Status select */}
      <BankLinkStatusSelect
        value={filters.bankLinkStatus}
        onChange={(bankLinkStatus) => onChange({ ...filters, bankLinkStatus })}
      />

      {/* Approval Status select */}
      <ApprovalStatusSelect
        value={filters.approvalStatus}
        onChange={(approvalStatus) => onChange({ ...filters, approvalStatus })}
      />

      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <MagnifyingGlassIcon className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
        <input
          type="text"
          placeholder="Search name or vendor..."
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="w-full ps-10 pe-4 py-2 bg-surface border border-text-muted/20 rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
        />
        {filters.search && (
          <button
            type="button"
            onClick={() => onChange({ ...filters, search: '' })}
            className="absolute end-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-background/50"
          >
            <XMarkIcon className="w-4 h-4 text-text-muted hover:text-text" />
          </button>
        )}
      </div>

      {children}
    </div>
  )
}
