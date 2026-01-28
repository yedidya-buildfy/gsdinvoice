import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import {
  Dialog as AriaDialog,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
  Heading as AriaHeading,
} from 'react-aria-components'
import { cx } from '@/utils/cx'

interface ConfirmDialogProps {
  isOpen: boolean
  onConfirm: () => void
  onCancel: () => void
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning'
}

export function ConfirmDialog({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'warning',
}: ConfirmDialogProps) {
  if (!isOpen) return null

  const iconColors = {
    danger: 'text-red-400 bg-red-500/10',
    warning: 'text-amber-400 bg-amber-500/10',
  }

  const buttonColors = {
    danger: 'bg-red-600 hover:bg-red-700',
    warning: 'bg-amber-600 hover:bg-amber-700',
  }

  return (
    <AriaModalOverlay
      isOpen={isOpen}
      onOpenChange={(open) => !open && onCancel()}
      className={(state) =>
        cx(
          'fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm',
          state.isEntering && 'duration-200 ease-out animate-in fade-in',
          state.isExiting && 'duration-150 ease-in animate-out fade-out'
        )
      }
    >
      <AriaModal
        className={(state) =>
          cx(
            'w-full max-w-md mx-4',
            state.isEntering && 'duration-200 ease-out animate-in zoom-in-95',
            state.isExiting && 'duration-150 ease-in animate-out zoom-out-95'
          )
        }
      >
        <AriaDialog className="rounded-xl bg-gray-900 p-6 shadow-xl ring-1 ring-white/10 outline-none">
          <div className="flex items-start gap-4">
            <div className={cx('p-2 rounded-full', iconColors[variant])}>
              <ExclamationTriangleIcon className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <AriaHeading slot="title" className="text-lg font-semibold text-white">
                {title}
              </AriaHeading>
              <p className="mt-2 text-sm text-gray-400">
                {message}
              </p>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={cx(
                'px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors',
                buttonColors[variant]
              )}
            >
              {confirmLabel}
            </button>
          </div>
        </AriaDialog>
      </AriaModal>
    </AriaModalOverlay>
  )
}
