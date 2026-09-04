'use client'

import { cloneElement, forwardRef, isValidElement, type ButtonHTMLAttributes, type ReactElement } from 'react'
import { cn } from '@/lib/cn'
import { Icon, type IconName } from './icon'

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'subtle'
type Size = 'sm' | 'md' | 'lg' | 'icon'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: IconName
  /**
   * Render the button styles on a single child element (e.g. a `Link`)
   * instead of a `<button>`. Useful for navigation that must stay an anchor.
   */
  asChild?: boolean
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-bh-accent text-white hover:bg-bh-accent-strong disabled:hover:bg-bh-accent shadow-sm',
  secondary: 'bg-bh-surface-2 text-bh-ink hover:bg-bh-line',
  ghost: 'bg-transparent text-bh-muted hover:text-bh-ink hover:bg-bh-surface-2',
  outline:
    'bg-transparent border border-bh-line-strong text-bh-ink hover:border-bh-accent hover:text-bh-accent',
  danger: 'bg-bh-danger text-white hover:opacity-90 shadow-sm',
  subtle: 'bg-bh-accent-soft text-bh-accent-strong hover:bg-bh-accent/15',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-9.5 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-[15px] gap-2',
  icon: 'h-9 w-9 px-0 justify-center',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild, className, variant = 'primary', size = 'md', loading, icon, children, ...props }, ref) => {
    const classes = cn(
      'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bh-accent',
      'disabled:cursor-not-allowed disabled:opacity-55',
      variantClasses[variant],
      sizeClasses[size],
      loading && 'pointer-events-none opacity-80',
      className,
    )

    if (asChild && isValidElement(children)) {
      const child = children as ReactElement<{ className?: string }>
      return cloneElement(child, {
        className: cn(child.props.className, classes),
        ...props,
      })
    }

    return (
      <button
        ref={ref}
        className={classes}
        disabled={props.disabled || loading}
        {...props}
      >
        {loading ? (
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-label="Loading"
          />
        ) : (
          icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />
        )}
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'