'use client'

import { forwardRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { Icon, type IconName } from './icon'

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string
  label: string
  hint?: string
  error?: string
  type?: string
  icon?: IconName
  className?: string
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(
  ({ id, label, hint, error, type = 'text', icon, className, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false)
    const isPassword = type === 'password'
    const actualType = isPassword && showPassword ? 'text' : type

    return (
      <div className={className}>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label htmlFor={id} className="text-sm font-medium text-bh-ink">
            {label}
          </label>
          {hint && <span className="text-xs text-bh-faint">{hint}</span>}
        </div>
        <div className="relative">
          {icon && (
            <span className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-bh-faint">
              <Icon name={icon} size={18} />
            </span>
          )}
          <input
            id={id}
            ref={ref}
            type={actualType}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
            className={cn(
              'h-10.5 w-full rounded-lg border bg-bh-surface px-3.5 text-sm text-bh-ink',
              'placeholder:text-bh-faint transition-colors',
              'focus:border-bh-accent focus:outline-none focus:ring-2 focus:ring-bh-accent/20',
              icon && 'pl-10',
              isPassword && 'pr-10',
              error
                ? 'border-bh-danger focus:border-bh-danger focus:ring-bh-danger/20'
                : 'border-bh-line-strong',
            )}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-bh-faint hover:text-bh-ink"
            >
              <Icon name={showPassword ? 'eyeOff' : 'eye'} size={18} />
            </button>
          )}
        </div>
        {error && (
          <p id={`${id}-error`} role="alert" className="mt-1.5 flex items-start gap-1 text-xs text-bh-danger">
            <Icon name="warning" size={14} className="mt-px shrink-0" />
            {error}
          </p>
        )}
      </div>
    )
  },
)
Field.displayName = 'Field'
