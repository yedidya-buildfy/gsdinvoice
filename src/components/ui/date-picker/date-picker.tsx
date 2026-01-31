import { useRef } from 'react'
import { getLocalTimeZone, parseDate, today } from '@internationalized/date'
import { CalendarIcon } from '@heroicons/react/24/outline'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import {
  DatePicker as AriaDatePicker,
  Dialog as AriaDialog,
  Group as AriaGroup,
  Popover as AriaPopover,
  Calendar as AriaCalendar,
  CalendarGrid as AriaCalendarGrid,
  CalendarGridBody as AriaCalendarGridBody,
  CalendarGridHeader as AriaCalendarGridHeader,
  CalendarHeaderCell as AriaCalendarHeaderCell,
  CalendarCell as AriaCalendarCell,
  Button as AriaButton,
  Heading as AriaHeading,
  I18nProvider,
  type DateValue,
} from 'react-aria-components'
import { useDateFormatter } from 'react-aria'
import { cx } from '@/utils/cx'

interface DatePickerProps {
  label?: string
  value: string // ISO date string (YYYY-MM-DD) or empty
  onChange: (value: string) => void
  placeholder?: string
}

export function DatePicker({ label, value, onChange, placeholder = 'Select date' }: DatePickerProps) {
  const triggerRef = useRef<HTMLDivElement>(null)

  const formatter = useDateFormatter({
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  // Convert ISO string to DateValue
  const dateValue = value ? parseDate(value) : null

  // Format for display
  const formattedDate = dateValue
    ? formatter.format(dateValue.toDate(getLocalTimeZone()))
    : placeholder

  const handleChange = (newValue: DateValue | null) => {
    if (newValue) {
      onChange(newValue.toString())
    } else {
      onChange('')
    }
  }

  const handleClear = (close: () => void) => {
    onChange('')
    close()
  }

  const handleToday = (close: () => void) => {
    const todayDate = today(getLocalTimeZone())
    onChange(todayDate.toString())
    close()
  }

  return (
    <I18nProvider locale="en-US">
      <div>
        {label && (
          <label className="block text-xs font-medium text-text-muted mb-1.5">
            {label}
          </label>
        )}
        <AriaDatePicker
          value={dateValue}
          onChange={handleChange}
          shouldCloseOnSelect={false}
        >
          <AriaGroup ref={triggerRef}>
            <AriaButton
              className={cx(
                'w-full flex items-center justify-between px-3 py-2',
                'bg-background border border-text-muted/20 rounded-lg',
                'text-sm text-left transition-colors',
                'hover:border-text-muted/40 focus:outline-none focus:border-primary',
                dateValue ? 'text-text' : 'text-text-muted'
              )}
            >
              <span>{formattedDate}</span>
              <CalendarIcon className="w-4 h-4 text-text-muted" />
            </AriaButton>
          </AriaGroup>

          <AriaPopover
            triggerRef={triggerRef}
            offset={4}
            placement="bottom end"
            className={({ isEntering, isExiting }) =>
              cx(
                'z-50',
                isEntering && 'duration-150 ease-out animate-in fade-in slide-in-from-top-1',
                isExiting && 'duration-100 ease-in animate-out fade-out slide-out-to-top-1'
              )
            }
          >
            <AriaDialog className="rounded-xl bg-gray-900 border border-gray-700 shadow-xl outline-none overflow-hidden" dir="ltr">
              {({ close }) => (
                <>
                  <AriaCalendar className="p-4">
                    {/* Header with month/year display and navigation */}
                    <header className="flex items-center justify-between mb-4">
                      <AriaButton
                        slot="previous"
                        className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-white"
                      >
                        <ChevronLeftIcon className="w-4 h-4" />
                      </AriaButton>
                      <AriaHeading className="text-sm font-medium text-white" />
                      <AriaButton
                        slot="next"
                        className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-white"
                      >
                        <ChevronRightIcon className="w-4 h-4" />
                      </AriaButton>
                    </header>

                    {/* Calendar Grid */}
                    <AriaCalendarGrid weekdayStyle="short" className="w-full">
                      <AriaCalendarGridHeader>
                        {(day) => (
                          <AriaCalendarHeaderCell className="pb-2 text-xs font-medium text-gray-500 w-9 h-9">
                            {day.slice(0, 1)}
                          </AriaCalendarHeaderCell>
                        )}
                      </AriaCalendarGridHeader>
                      <AriaCalendarGridBody>
                        {(date) => (
                          <AriaCalendarCell
                            date={date}
                            className={({ isSelected, isOutsideMonth, isFocusVisible, isDisabled }) =>
                              cx(
                                'w-9 h-9 flex items-center justify-center text-sm rounded-lg cursor-pointer transition-colors outline-none',
                                isOutsideMonth && 'text-gray-600',
                                !isOutsideMonth && !isSelected && 'text-gray-300 hover:bg-gray-800',
                                isSelected && 'bg-blue-600 text-white font-medium',
                                isFocusVisible && 'ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-900',
                                isDisabled && 'opacity-50 cursor-not-allowed'
                              )
                            }
                          />
                        )}
                      </AriaCalendarGridBody>
                    </AriaCalendarGrid>
                  </AriaCalendar>

                  {/* Footer with Clear and Today buttons */}
                  <div className="flex items-center justify-between px-4 pb-4">
                    <button
                      type="button"
                      onClick={() => handleClear(close)}
                      className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToday(close)}
                      className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      Today
                    </button>
                  </div>
                </>
              )}
            </AriaDialog>
          </AriaPopover>
        </AriaDatePicker>
      </div>
    </I18nProvider>
  )
}
