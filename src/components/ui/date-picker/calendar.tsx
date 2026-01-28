import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import {
  Calendar as AriaCalendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  Heading,
  type CalendarProps as AriaCalendarProps,
  type DateValue,
} from 'react-aria-components'
import { clsx } from 'clsx'

interface CalendarProps<T extends DateValue> extends AriaCalendarProps<T> {
  className?: string
}

export function Calendar<T extends DateValue>({ className, ...props }: CalendarProps<T>) {
  return (
    <AriaCalendar {...props} className={clsx('p-4', className)}>
      <header className="flex items-center justify-between mb-4">
        <button
          slot="previous"
          className="p-1.5 rounded-lg hover:bg-surface transition-colors text-text-muted hover:text-text"
        >
          <ChevronLeftIcon className="w-5 h-5" />
        </button>
        <Heading className="text-sm font-semibold text-text" />
        <button
          slot="next"
          className="p-1.5 rounded-lg hover:bg-surface transition-colors text-text-muted hover:text-text"
        >
          <ChevronRightIcon className="w-5 h-5" />
        </button>
      </header>
      <CalendarGrid className="w-full border-collapse">
        <CalendarGridHeader>
          {(day) => (
            <CalendarHeaderCell className="pb-2 text-xs font-medium text-text-muted w-10 h-10">
              {day}
            </CalendarHeaderCell>
          )}
        </CalendarGridHeader>
        <CalendarGridBody>
          {(date) => (
            <CalendarCell
              date={date}
              className={({ isSelected, isOutsideMonth, isFocusVisible, isDisabled }) =>
                clsx(
                  'w-10 h-10 flex items-center justify-center text-sm rounded-lg cursor-pointer transition-colors outline-none',
                  isOutsideMonth && 'text-text-muted/50',
                  !isOutsideMonth && !isSelected && 'text-text hover:bg-surface',
                  isSelected && 'bg-primary text-background font-medium',
                  isFocusVisible && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                  isDisabled && 'opacity-50 cursor-not-allowed'
                )
              }
            />
          )}
        </CalendarGridBody>
      </CalendarGrid>
    </AriaCalendar>
  )
}
