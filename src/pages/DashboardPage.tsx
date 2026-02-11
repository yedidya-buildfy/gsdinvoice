import { useState } from 'react'
import { RangeCalendarCard } from '@/components/ui/date-picker'
import { CCBankMatchWidget } from '@/components/dashboard/CCBankMatchWidget'
import { MatchingGapsWidget } from '@/components/dashboard/MatchingGapsWidget'

export function DashboardPage() {
  // Global date filter for all dashboard widgets - default to no filter (show all data)
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')

  const handleDateChange = (startDate: string, endDate: string) => {
    setFromDate(startDate)
    setToDate(endDate)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-text">Dashboard</h1>
        <RangeCalendarCard
          startDate={fromDate}
          endDate={toDate}
          onChange={handleDateChange}
        />
      </div>

      {/* Dashboard Widgets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Invoice-Transaction Matching Gaps */}
        <MatchingGapsWidget fromDate={fromDate} toDate={toDate} />

        {/* CC-Bank Matching Widget */}
        <CCBankMatchWidget fromDate={fromDate} toDate={toDate} />
      </div>
    </div>
  )
}
