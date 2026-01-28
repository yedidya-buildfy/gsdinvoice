import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import {
  RangeCalendar as AriaRangeCalendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  Heading,
  Button,
  I18nProvider,
  type RangeCalendarProps as AriaRangeCalendarProps,
  type DateValue,
} from 'react-aria-components'
import { clsx } from 'clsx'

interface RangeCalendarProps<T extends DateValue> extends Omit<AriaRangeCalendarProps<T>, 'visibleDuration'> {
  className?: string
}

export function RangeCalendar<T extends DateValue>({ className, ...props }: RangeCalendarProps<T>) {
  return (
    <I18nProvider locale="en-US">
      <AriaRangeCalendar {...props} visibleDuration={{ months: 2 }} className={clsx('p-4', className)}>
        <header className="flex items-center justify-between mb-4">
          <Button
            slot="previous"
            className="p-1.5 rounded-lg hover:bg-surface transition-colors text-text-muted hover:text-text"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </Button>
          <Heading className="text-sm font-semibold text-text" />
          <Button
            slot="next"
            className="p-1.5 rounded-lg hover:bg-surface transition-colors text-text-muted hover:text-text"
          >
            <ChevronRightIcon className="w-5 h-5" />
          </Button>
        </header>
      <div className="flex gap-8">
        <CalendarGrid className="border-collapse">
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
                className={({ isSelected, isOutsideMonth, isFocusVisible, isDisabled, isSelectionStart, isSelectionEnd }) =>
                  clsx(
                    'w-10 h-10 flex items-center justify-center text-sm cursor-pointer transition-colors outline-none',
                    isOutsideMonth && 'text-text-muted/50',
                    !isOutsideMonth && !isSelected && 'text-text hover:bg-surface rounded-lg',
                    isSelected && !isSelectionStart && !isSelectionEnd && 'bg-primary/20 text-text',
                    (isSelectionStart || isSelectionEnd) && 'bg-primary text-background font-medium rounded-lg',
                    isFocusVisible && 'ring-2 ring-primary ring-offset-2 ring-offset-background rounded-lg',
                    isDisabled && 'opacity-50 cursor-not-allowed'
                  )
                }
              />
            )}
          </CalendarGridBody>
        </CalendarGrid>
        <CalendarGrid offset={{ months: 1 }} className="border-collapse">
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
                className={({ isSelected, isOutsideMonth, isFocusVisible, isDisabled, isSelectionStart, isSelectionEnd }) =>
                  clsx(
                    'w-10 h-10 flex items-center justify-center text-sm cursor-pointer transition-colors outline-none',
                    isOutsideMonth && 'text-text-muted/50',
                    !isOutsideMonth && !isSelected && 'text-text hover:bg-surface rounded-lg',
                    isSelected && !isSelectionStart && !isSelectionEnd && 'bg-primary/20 text-text',
                    (isSelectionStart || isSelectionEnd) && 'bg-primary text-background font-medium rounded-lg',
                    isFocusVisible && 'ring-2 ring-primary ring-offset-2 ring-offset-background rounded-lg',
                    isDisabled && 'opacity-50 cursor-not-allowed'
                  )
                }
              />
            )}
          </CalendarGridBody>
        </CalendarGrid>
      </div>
      </AriaRangeCalendar>
    </I18nProvider>
  )
}
