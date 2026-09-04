'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { cn } from '@/lib/cn'
import { isActive, mainNav, footerNav } from '@/lib/nav'
import { Icon } from '@/components/ui/icon'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/auth/auth-provider'

interface MobileNavProps {
  open: boolean
  onClose: () => void
}

export function MobileNav({ open, onClose }: MobileNavProps) {
  const pathname = usePathname()
  const { user } = useAuth()
  const guest = !user

  const visibleMain = mainNav.filter((item) => !item.requiresAuth || !guest)
  const visibleFooter = footerNav.filter((item) => !item.requiresAuth || !guest)

  useEffect(() => {
    onClose()
  }, [pathname, onClose])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div
        className="absolute inset-0 bg-bh-ink/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-bh-surface shadow-2xl">
        <div className="flex items-center justify-between px-5 py-5">
          <Link href="/" className="flex items-center gap-2.5" onClick={onClose}>
            <Icon name="code" size={26} className="text-bh-accent" />
            <span className="text-lg font-semibold tracking-tight text-bh-ink">
              Build<span className="text-bh-accent">Hub</span>
            </span>
          </Link>
          <button
            onClick={onClose}
            aria-label="Close navigation"
            className="flex h-9 w-9 items-center justify-center rounded-md text-bh-muted hover:bg-bh-surface-2 hover:text-bh-ink"
          >
            <Icon name="x" size={20} />
          </button>
        </div>

        <nav className="mt-1 flex-1 space-y-0.5 px-3" aria-label="Mobile navigation">
          {visibleMain.map((item) => {
            const active = isActive(item.href, pathname)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-bh-accent-soft text-bh-accent-strong'
                    : 'text-bh-muted hover:bg-bh-surface-2 hover:text-bh-ink',
                )}
              >
                <Icon name={item.icon} size={18} />
                {item.label}
              </Link>
            )
          })}
          {visibleFooter.map((item) => {
            const active = isActive(item.href, pathname)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-bh-accent-soft text-bh-accent-strong'
                    : 'text-bh-muted hover:bg-bh-surface-2 hover:text-bh-ink',
                )}
              >
                <Icon name={item.icon} size={18} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {guest ? (
          <div className="flex gap-2 border-t border-bh-line p-4">
            <Button asChild variant="outline" size="sm" className="flex-1">
              <Link href="/login" onClick={onClose}>Log in</Link>
            </Button>
            <Button asChild variant="primary" size="sm" className="flex-1">
              <Link href="/signup" onClick={onClose}>Sign up</Link>
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3 border-t border-bh-line p-4">
            <Avatar name={user?.name ?? 'Build'} username={user?.username} src={user?.avatar} size={34} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-bh-ink">{user?.name ?? '…'}</p>
              <p className="truncate text-xs text-bh-faint">@{user?.username ?? '…'}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
