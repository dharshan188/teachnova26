import { cn } from '@/lib/cn'

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

interface BadgeProps {
  tone?: Tone
  className?: string
  children: React.ReactNode
  dot?: boolean
}

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-bh-surface-2 text-bh-muted',
  accent: 'bg-bh-accent-soft text-bh-accent-strong',
  success: 'bg-bh-success/10 text-bh-success',
  warning: 'bg-bh-warning/10 text-bh-warning',
  danger: 'bg-bh-danger/10 text-bh-danger',
  info: 'bg-bh-info/10 text-bh-info',
}

export function Badge({ tone = 'neutral', className, children, dot }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        toneClasses[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  )
}
