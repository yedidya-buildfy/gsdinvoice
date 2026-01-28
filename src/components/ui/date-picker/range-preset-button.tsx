import { clsx } from 'clsx'
import type { DateValue } from 'react-aria-components'

interface RangePresetButtonProps {
  children: React.ReactNode
  value: { start: DateValue; end: DateValue }
  isSelected?: boolean
  onClick: () => void
}

export function RangePresetButton({ children, isSelected, onClick }: RangePresetButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'px-3 py-2 text-sm text-start rounded-lg transition-colors',
        isSelected
          ? 'bg-primary/20 text-primary font-medium'
          : 'text-text-muted hover:bg-surface hover:text-text'
      )}
    >
      {children}
    </button>
  )
}
