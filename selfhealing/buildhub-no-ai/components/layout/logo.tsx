import Link from 'next/link'
import { cn } from '@/lib/cn'

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-md bg-bh-accent text-white shadow-sm"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none">
        <path
          d="M4 12h5l2-4.5 3 9L15.5 12H20"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

export function Logo({
  href = '/',
  className,
  textClassName,
}: {
  href?: string
  className?: string
  textClassName?: string
}) {
  return (
    <Link
      href={href}
      className={cn('inline-flex items-center gap-2.5', className)}
      aria-label="BuildHub home"
    >
      <LogoMark />
      <span className={cn('text-lg font-semibold tracking-tight text-bh-ink', textClassName)}>
        Build<span className="text-bh-accent">Hub</span>
      </span>
    </Link>
  )
}
