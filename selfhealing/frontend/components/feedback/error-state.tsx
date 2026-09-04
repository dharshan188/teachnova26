'use client'

import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

interface ErrorStateProps {
  title?: string
  description?: string
  onRetry?: () => void
  className?: string
}

export function ErrorState({
  title = 'Something went wrong',
  description = "We couldn't load this content. Please try again.",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-bh-danger/20 bg-bh-danger/5 px-6 py-14 text-center',
        className,
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-bh-danger/10 text-bh-danger">
        <Icon name="warning" size={22} />
      </span>
      <h3 className="mt-4 text-base font-semibold text-bh-ink">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-bh-muted">{description}</p>
      {onRetry && (
        <Button variant="outline" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}
