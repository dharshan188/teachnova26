import { forwardRef } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from './icon'

const baseField =
  'w-full rounded-lg border bg-bh-surface px-3.5 py-2.5 text-sm text-bh-ink placeholder:text-bh-faint transition-colors focus:border-bh-accent focus:outline-none focus:ring-2 focus:ring-bh-accent/20 disabled:opacity-55'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          baseField,
          'h-10.5',
          invalid && 'border-bh-danger focus:border-bh-danger focus:ring-bh-danger/20',
          !invalid && 'border-bh-line-strong',
          className,
        )}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          baseField,
          'min-h-[96px] resize-y',
          invalid && 'border-bh-danger focus:border-bh-danger focus:ring-bh-danger/20',
          !invalid && 'border-bh-line-strong',
          className,
        )}
        {...props}
      />
    )
  },
)
Textarea.displayName = 'Textarea'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, invalid, children, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            baseField,
            'h-10.5 appearance-none pr-9',
            invalid && 'border-bh-danger focus:border-bh-danger focus:ring-bh-danger/20',
            !invalid && 'border-bh-line-strong',
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-bh-muted">
          <Icon name="chevronDown" size={16} />
        </span>
      </div>
    )
  },
)
Select.displayName = 'Select'
