import { cn } from '@/lib/cn'

export function Card({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-xl border border-bh-line bg-bh-surface shadow-sm',
        className,
      )}
      {...props}
    />
  )
}
