'use client'

import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'
import { Icon, type IconName } from '@/components/ui/icon'

interface EmptyStateProps {
  icon?: IconName
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  actionVariant?: 'primary' | 'secondary' | 'outline'
  className?: string
}

export function EmptyState({
  icon = 'sparkles',
  title,
  description,
  actionLabel,
  onAction,
  actionVariant = 'primary',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-bh-line-strong bg-bh-surface px-6 py-14 text-center',
        className,
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-bh-surface-2 text-bh-muted">
        <Icon name={icon} size={22} />
      </span>
      <h3 className="mt-4 text-base font-semibold text-bh-ink">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-bh-muted">{description}</p>
      )}
      {actionLabel && onAction && (
        <Button variant={actionVariant} className="mt-5" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
