import { useState, useEffect, useMemo } from 'react'
import { cx } from '@/utils/cx'

interface LoadingIndicatorProps {
  type?: 'dot-circle' | 'spinner'
  size?: 'sm' | 'md' | 'lg'
  label?: string
  funnyLabels?: string[]
  rotateLabels?: boolean
  labelInterval?: number
  className?: string
}

const defaultFunnyLabels = [
  'חושב...',
  'עובד קשה...',
  'שותה תה...',
  'מעבד נתונים...',
  'קורא את המסמך...',
  'מנתח פרטים...',
  'עוד רגע...',
  'בודק שוב...',
  'כמעט שם...',
]

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
}

const dotSizeClasses = {
  sm: 'w-1 h-1',
  md: 'w-1.5 h-1.5',
  lg: 'w-2 h-2',
}

const labelSizeClasses = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
}

export function LoadingIndicator({
  type = 'dot-circle',
  size = 'md',
  label,
  funnyLabels = defaultFunnyLabels,
  rotateLabels = false,
  labelInterval = 2000,
  className,
}: LoadingIndicatorProps) {
  const [labelIndex, setLabelIndex] = useState(0)

  // Shuffle the labels once on mount for variety
  const shuffledLabels = useMemo(() => {
    return [...funnyLabels].sort(() => Math.random() - 0.5)
  }, [funnyLabels])

  useEffect(() => {
    if (!rotateLabels) return

    const interval = setInterval(() => {
      setLabelIndex((prev) => (prev + 1) % shuffledLabels.length)
    }, labelInterval)

    return () => clearInterval(interval)
  }, [rotateLabels, shuffledLabels.length, labelInterval])

  const displayLabel = rotateLabels ? shuffledLabels[labelIndex] : label

  return (
    <div className={cx('flex items-center gap-3', className)} dir="rtl">
      {type === 'dot-circle' && (
        <div className={cx('relative', sizeClasses[size])}>
          {/* Rotating dots */}
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div
              key={i}
              className={cx(
                'absolute rounded-full bg-primary',
                dotSizeClasses[size]
              )}
              style={{
                top: '50%',
                left: '50%',
                transform: `rotate(${i * 45}deg) translateY(-${size === 'sm' ? 6 : size === 'md' ? 9 : 12}px)`,
                opacity: 0.2 + (i * 0.1),
                animation: `dot-circle-spin 1s linear infinite`,
                animationDelay: `${i * -0.125}s`,
              }}
            />
          ))}
        </div>
      )}

      {type === 'spinner' && (
        <div
          className={cx(
            'rounded-full border-2 border-primary/20 border-t-primary animate-spin',
            sizeClasses[size]
          )}
        />
      )}

      {displayLabel && (
        <span
          className={cx(
            'text-text-muted font-medium transition-opacity duration-300',
            labelSizeClasses[size]
          )}
        >
          {displayLabel}
        </span>
      )}

      <style>{`
        @keyframes dot-circle-spin {
          0% {
            opacity: 0.2;
          }
          12.5% {
            opacity: 1;
          }
          25% {
            opacity: 0.2;
          }
          100% {
            opacity: 0.2;
          }
        }
      `}</style>
    </div>
  )
}
