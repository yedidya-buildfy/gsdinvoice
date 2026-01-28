import type { ReactNode } from 'react'
import {
  Dialog as AriaDialog,
  DialogTrigger as AriaDialogTrigger,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
  Heading as AriaHeading,
} from 'react-aria-components'
import type {
  DialogProps as AriaDialogProps,
  ModalOverlayProps as AriaModalOverlayProps,
} from 'react-aria-components'
import { cx } from '@/utils/cx'

interface ModalOverlayProps extends AriaModalOverlayProps {
  children: ReactNode
}

function ModalOverlay({ children, ...props }: ModalOverlayProps) {
  return (
    <AriaModalOverlay
      {...props}
      className={(state) =>
        cx(
          'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm',
          state.isEntering && 'duration-200 ease-out animate-in fade-in',
          state.isExiting && 'duration-150 ease-in animate-out fade-out',
          typeof props.className === 'function' ? props.className(state) : props.className
        )
      }
    >
      <AriaModal
        className={(state) =>
          cx(
            'w-full',
            state.isEntering && 'duration-200 ease-out animate-in zoom-in-95',
            state.isExiting && 'duration-150 ease-in animate-out zoom-out-95'
          )
        }
      >
        {children}
      </AriaModal>
    </AriaModalOverlay>
  )
}

interface ModalContentProps extends AriaDialogProps {
  children: ReactNode
}

function ModalContent({ children, ...props }: ModalContentProps) {
  return (
    <AriaDialog
      {...props}
      className={cx(
        'mx-auto rounded-xl bg-surface p-6 shadow-xl ring-1 ring-white/10 outline-none',
        // Default max-width if not specified in className
        !props.className?.includes('max-w-') && 'max-w-md',
        props.className
      )}
    >
      {children}
    </AriaDialog>
  )
}

interface ModalTitleProps {
  children: ReactNode
  className?: string
}

function ModalTitle({ children, className }: ModalTitleProps) {
  return (
    <AriaHeading slot="title" className={cx('text-lg font-semibold text-text', className)}>
      {children}
    </AriaHeading>
  )
}

interface ModalActionsProps {
  children: ReactNode
  className?: string
}

function ModalActions({ children, className }: ModalActionsProps) {
  return (
    <div className={cx('mt-6 flex flex-col gap-3', className)}>
      {children}
    </div>
  )
}

export const Modal = {
  Trigger: AriaDialogTrigger,
  Overlay: ModalOverlay,
  Content: ModalContent,
  Title: ModalTitle,
  Actions: ModalActions,
}
