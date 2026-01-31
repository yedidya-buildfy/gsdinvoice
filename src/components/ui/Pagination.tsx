import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { cx } from '@/utils/cx'

interface PaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  className?: string
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  className,
}: PaginationProps) {
  // Calculate range of items shown
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalItems)

  const canGoPrevious = currentPage > 1
  const canGoNext = currentPage < totalPages

  const handlePrevious = () => {
    if (canGoPrevious) {
      onPageChange(currentPage - 1)
    }
  }

  const handleNext = () => {
    if (canGoNext) {
      onPageChange(currentPage + 1)
    }
  }

  // Don't render if there's only one page or no items
  if (totalPages <= 1) {
    return null
  }

  return (
    <div
      className={cx(
        'flex items-center justify-between px-4 py-3 border-t border-text-muted/10',
        className
      )}
    >
      {/* Left: Item range */}
      <div className="text-sm text-text-muted">
        Showing <span className="font-medium text-text">{startItem}</span>
        {' - '}
        <span className="font-medium text-text">{endItem}</span>
        {' of '}
        <span className="font-medium text-text">{totalItems}</span> items
      </div>

      {/* Center: Page indicator */}
      <div className="text-sm text-text-muted">
        Page <span className="font-medium text-text">{currentPage}</span>
        {' of '}
        <span className="font-medium text-text">{totalPages}</span>
      </div>

      {/* Right: Navigation buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handlePrevious}
          disabled={!canGoPrevious}
          className={cx(
            'inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors',
            canGoPrevious
              ? 'text-text hover:bg-surface/50 hover:text-text'
              : 'text-text-muted/40 cursor-not-allowed'
          )}
        >
          <ChevronLeftIcon className="w-4 h-4" />
          Previous
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={!canGoNext}
          className={cx(
            'inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors',
            canGoNext
              ? 'text-text hover:bg-surface/50 hover:text-text'
              : 'text-text-muted/40 cursor-not-allowed'
          )}
        >
          Next
          <ChevronRightIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
