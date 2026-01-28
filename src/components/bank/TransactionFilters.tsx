import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
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
      <select
        value={filters.type}
        onChange={(e) => onChange({ ...filters, type: e.target.value as 'all' | 'income' | 'expense' })}
        className="px-3 py-2 bg-surface border border-text-muted/20 rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        <option value="all">All</option>
        <option value="income">Income</option>
        <option value="expense">Expense</option>
      </select>

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
