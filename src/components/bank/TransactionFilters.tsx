import { MagnifyingGlassIcon, FunnelIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { RangeCalendarCard } from '@/components/ui/date-picker'

export interface TransactionFilterState {
  search: string
  dateFrom: string
  dateTo: string
  type: 'all' | 'income' | 'expense'
}

interface TransactionFiltersProps {
  filters: TransactionFilterState
  onChange: (filters: TransactionFilterState) => void
}

const TYPE_OPTIONS: { value: TransactionFilterState['type']; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
]

function TypeSelect({
  value,
  onChange,
}: {
  value: TransactionFilterState['type']
  onChange: (value: TransactionFilterState['type']) => void
}) {
  const selectedLabel = TYPE_OPTIONS.find((opt) => opt.value === value)?.label || 'All'
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
      <div className="absolute top-full start-0 mt-1 z-50 hidden group-hover:block bg-surface border border-text-muted/20 rounded-lg shadow-lg min-w-[120px]">
        {TYPE_OPTIONS.map((option) => (
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

export function TransactionFilters({ filters, onChange }: TransactionFiltersProps) {
  const handleDateChange = (startDate: string, endDate: string) => {
    onChange({ ...filters, dateFrom: startDate, dateTo: endDate })
  }

  return (
    <div className="flex flex-wrap gap-4 items-center">
      {/* Date range picker */}
      <RangeCalendarCard
        startDate={filters.dateFrom}
        endDate={filters.dateTo}
        onChange={handleDateChange}
      />

      {/* Type select */}
      <TypeSelect
        value={filters.type}
        onChange={(type) => onChange({ ...filters, type })}
      />

      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <MagnifyingGlassIcon className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
        <input
          type="text"
          placeholder="Search descriptions..."
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="w-full ps-10 pe-4 py-2 bg-surface border border-text-muted/20 rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>
    </div>
  )
}
