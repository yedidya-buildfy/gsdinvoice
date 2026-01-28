import {
  DateInput as AriaDateInput,
  DateSegment,
  type DateInputProps as AriaDateInputProps,
  type DateValue,
} from 'react-aria-components'
import { clsx } from 'clsx'

interface DateInputProps<T extends DateValue> extends AriaDateInputProps<T> {
  className?: string
}

export function DateInput<T extends DateValue>({ className, ...props }: DateInputProps<T>) {
  return (
    <AriaDateInput
      {...props}
      className={clsx(
        'flex items-center gap-0.5 px-3 py-2 rounded-lg border border-text-muted/20 bg-background text-sm text-text',
        'focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary',
        className
      )}
    >
      {(segment) => (
        <DateSegment
          segment={segment}
          className={({ isFocused, isPlaceholder }) =>
            clsx(
              'rounded px-0.5 outline-none',
              isFocused && 'bg-primary text-background',
              isPlaceholder && 'text-text-muted'
            )
          }
        />
      )}
    </AriaDateInput>
  )
}
