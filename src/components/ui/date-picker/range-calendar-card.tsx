import { useMemo, useState, useEffect, useRef } from 'react'
import {
  endOfMonth,
  endOfWeek,
  getLocalTimeZone,
  startOfMonth,
  startOfWeek,
  today,
  parseDate,
  type CalendarDate,
} from '@internationalized/date'
import type { DateValue } from 'react-aria-components'
import { CalendarIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { clsx } from 'clsx'
import { RangeCalendar } from './range-calendar'
import { RangePresetButton } from './range-preset-button'

interface RangeCalendarCardProps {
  startDate: string
  endDate: string
  onChange: (startDate: string, endDate: string) => void
  className?: string
}

const now = today(getLocalTimeZone())
const locale = 'en-US'

function dateValueToString(date: DateValue | null): string {
  if (!date) return ''
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}

function stringToDateValue(dateStr: string): CalendarDate | null {
  if (!dateStr) return null
  try {
    return parseDate(dateStr)
  } catch {
    return null
  }
}

export function RangeCalendarCard({ startDate, endDate, onChange, className }: RangeCalendarCardProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const [value, setValue] = useState<{ start: DateValue; end: DateValue } | null>(() => {
    const start = stringToDateValue(startDate)
    const end = stringToDateValue(endDate)
    if (start && end) {
      return { start, end }
    }
    return null
  })

  // Sync external props to internal state
  useEffect(() => {
    const start = stringToDateValue(startDate)
    const end = stringToDateValue(endDate)
    if (start && end) {
      setValue({ start, end })
    } else {
      setValue(null)
    }
  }, [startDate, endDate])

  const presets = useMemo(
    () => ({
      today: { label: 'Today', value: { start: now, end: now } },
      yesterday: { label: 'Yesterday', value: { start: now.subtract({ days: 1 }), end: now.subtract({ days: 1 }) } },
      thisWeek: { label: 'This week', value: { start: startOfWeek(now, locale), end: endOfWeek(now, locale) } },
      lastWeek: {
        label: 'Last week',
        value: {
          start: startOfWeek(now, locale).subtract({ weeks: 1 }),
          end: endOfWeek(now, locale).subtract({ weeks: 1 }),
        },
      },
      thisMonth: { label: 'This month', value: { start: startOfMonth(now), end: endOfMonth(now) } },
      lastMonth: {
        label: 'Last month',
        value: {
          start: startOfMonth(now).subtract({ months: 1 }),
          end: endOfMonth(now).subtract({ months: 1 }),
        },
      },
      thisYear: { label: 'This year', value: { start: startOfMonth(now.set({ month: 1 })), end: endOfMonth(now.set({ month: 12 })) } },
      lastYear: {
        label: 'Last year',
        value: {
          start: startOfMonth(now.set({ month: 1 }).subtract({ years: 1 })),
          end: endOfMonth(now.set({ month: 12 }).subtract({ years: 1 })),
        },
      },
    }),
    [locale]
  )

  const selectedPreset = useMemo(() => {
    if (!value) return null
    for (const [key, preset] of Object.entries(presets)) {
      if (
        preset.value.start.compare(value.start as CalendarDate) === 0 &&
        preset.value.end.compare(value.end as CalendarDate) === 0
      ) {
        return key
      }
    }
    return null
  }, [value, presets])

  const handlePresetClick = (preset: { start: DateValue; end: DateValue }) => {
    setValue(preset)
  }

  const handleApply = () => {
    if (value) {
      onChange(dateValueToString(value.start), dateValueToString(value.end))
    }
    setIsOpen(false)
  }

  const handleCancel = () => {
    // Reset to external values
    const start = stringToDateValue(startDate)
    const end = stringToDateValue(endDate)
    if (start && end) {
      setValue({ start, end })
    } else {
      setValue(null)
    }
    setIsOpen(false)
  }

  const handleClear = () => {
    setValue(null)
    onChange('', '')
    setIsOpen(false)
  }

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        handleCancel()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, startDate, endDate])

  const displayText = useMemo(() => {
    if (!startDate && !endDate) return 'Select date range'
    if (startDate && endDate) {
      const formatDate = (d: string) => {
        const date = new Date(d)
        return new Intl.DateTimeFormat('en-US', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }).format(date)
      }
      return `${formatDate(startDate)} - ${formatDate(endDate)}`
    }
    return 'Select date range'
  }, [startDate, endDate])

  return (
    <div ref={containerRef} className={clsx('relative', className)}>
      {/* Trigger button */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setIsOpen(!isOpen)
          }
        }}
        className={clsx(
          'flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors cursor-pointer',
          'bg-surface border-text-muted/20 text-text hover:border-primary/50',
          isOpen && 'border-primary ring-2 ring-primary/20'
        )}
      >
        <CalendarIcon className="w-5 h-5 text-text-muted" />
        <span className="text-sm whitespace-nowrap">{displayText}</span>
        {(startDate || endDate) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleClear()
            }}
            className="p-0.5 rounded hover:bg-background/50"
          >
            <XMarkIcon className="w-4 h-4 text-text-muted hover:text-text" />
          </button>
        )}
      </div>

      {/* Dropdown - force LTR for calendar layout, open towards center */}
      {isOpen && (
        <div dir="ltr" className="absolute top-full mt-2 start-0 z-50 flex rounded-xl bg-surface shadow-xl ring-1 ring-text-muted/20">
          {/* Presets sidebar */}
          <div className="hidden w-36 flex-col gap-0.5 border-e border-text-muted/20 p-3 lg:flex">
            {Object.entries(presets).map(([key, preset]) => (
              <RangePresetButton
                key={key}
                value={preset.value}
                isSelected={selectedPreset === key}
                onClick={() => handlePresetClick(preset.value)}
              >
                {preset.label}
              </RangePresetButton>
            ))}
          </div>

          {/* Calendar area */}
          <div className="flex flex-col">
            <RangeCalendar
              value={value}
              onChange={setValue}
            />

            {/* Footer with inputs and buttons */}
            <div className="flex justify-between gap-3 border-t border-text-muted/20 p-4">
              <div className="hidden items-center gap-2 md:flex">
                {value && (
                  <>
                    <div className="text-xs text-text-muted">
                      {dateValueToString(value.start)}
                    </div>
                    <div className="text-sm text-text-muted">-</div>
                    <div className="text-xs text-text-muted">
                      {dateValueToString(value.end)}
                    </div>
                  </>
                )}
              </div>
              <div className="grid w-full grid-cols-2 gap-3 md:flex md:w-auto">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-text-muted/20 text-text hover:bg-background transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={!value}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-background hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
