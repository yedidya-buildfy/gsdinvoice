import { cx } from '@/utils/cx'

interface DuplicateActionButtonProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  description: string
  onClick: () => void
  disabled?: boolean
  selected?: boolean
}

export function DuplicateActionButton({
  icon: Icon,
  label,
  description,
  onClick,
  disabled,
  selected,
}: DuplicateActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'flex items-start gap-3 w-full p-3 rounded-lg text-start transition-colors',
        selected
          ? 'bg-primary/20 border-2 border-primary ring-2 ring-primary/20'
          : 'bg-background/50 hover:bg-background border border-text-muted/20',
        'disabled:opacity-50 disabled:cursor-not-allowed'
      )}
    >
      <Icon className="w-5 h-5 mt-0.5 shrink-0 text-primary" />
      <div>
        <div className={cx('text-sm font-medium', selected ? 'text-primary' : 'text-text')}>
          {label}
        </div>
        <div className="text-xs text-text-muted mt-0.5">{description}</div>
      </div>
    </button>
  )
}
