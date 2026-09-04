'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'

// DEMO-ONLY presentation gate for the hard-overload comparison.
//
// This is NOT a real resilience feature and it never fakes telemetry. It is a
// thin client component that watches the REAL /api/health endpoint and mirrors
// whatever that endpoint truly reports:
//
//   status === "unavailable" -> full-screen "SERVICE UNAVAILABLE" page
//   status === "degraded"    -> slim DEGRADED banner
//   otherwise                -> nothing (normal app)
//
// It cannot create an outage and it cannot hide one. Routes under /demo/* stay
// reachable so the operator can keep using the comparison and reset flow while
// the main app surfaces reflect the real outage. Labeled accurately as a
// controlled local resilience demonstration.

interface HealthShape {
  status?: string
  availability?: string
  systemHealth?: number | string
  latencyMs?: number
}

const EXEMPT_PREFIX = '/demo'

async function healthFrom(res: Response): Promise<HealthShape> {
  if (res.status === 503 || res.status >= 500) return { status: 'unavailable' }
  if (res.status === 429) return { status: 'degraded' }
  try {
    const payload = (await res.json()) as HealthShape
    return payload ?? {}
  } catch {
    return {}
  }
}

export function ServiceUnavailableGate({
  enabled,
  children,
}: {
  enabled: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' })
        const payload = await healthFrom(res)
        if (!cancelled) setStatus(payload.status ?? null)
      } catch {
        if (!cancelled) setStatus(null)
      }
    }
    void check()
    const interval = setInterval(() => void check(), 2500)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [enabled])

  const exempt = pathname === EXEMPT_PREFIX || pathname.startsWith(`${EXEMPT_PREFIX}/`)

  if (!enabled || exempt || status === null) return <>{children}</>

  if (status === 'unavailable') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bh-bg px-6 text-center">
        <div className="max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-bh-muted">BuildHub</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-bh-danger">SERVICE UNAVAILABLE</h1>
          <p className="mt-4 text-base text-bh-ink">BuildHub is temporarily unavailable.</p>
          <p className="mt-1 text-sm text-bh-muted">Cause: Excessive authentication/API traffic detected.</p>

          <dl className="mx-auto mt-8 w-full max-w-xs rounded-lg bg-bh-surface-2 p-4 text-left">
            <div className="flex items-baseline justify-between gap-3 py-1">
              <dt className="text-xs text-bh-muted">System status</dt>
              <dd className="font-mono text-xs font-semibold text-bh-danger">OFFLINE</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-1">
              <dt className="text-xs text-bh-muted">Recovery</dt>
              <dd className="font-mono text-xs font-semibold text-bh-ink">Operator restart/reset required</dd>
            </div>
          </dl>

          <a
            href="/demo"
            className="mt-8 inline-flex items-center gap-2 rounded-lg border border-bh-line bg-bh-surface-2 px-4 py-2 text-sm font-medium text-bh-ink hover:bg-bh-surface-2/70"
          >
            View incident dashboard
          </a>

          <p className="mt-8 text-[11px] leading-relaxed text-bh-faint">
            Controlled local resilience demonstration (loopback only). This page is driven solely by the
            real <span className="font-mono">/api/health</span> state — it is never simulated.
          </p>
        </div>
      </div>
    )
  }

  if (status === 'degraded') {
    return (
      <div className="relative bg-bh-surface-2">
        <div
          className={cn(
            'flex items-center justify-between gap-4 border-b border-bh-line px-6 py-1.5 text-xs',
            status === 'degraded' && 'text-amber-600',
          )}
        >
          <span className="font-medium">
            DEGRADED — BuildHub is under elevated authentication/API traffic. /api/health reports{' '}
            <span className="font-mono">degraded</span>.
          </span>
          <a href="/demo" className="shrink-0 font-semibold text-bh-accent hover:underline">
            Incident dashboard
          </a>
        </div>
        {children}
      </div>
    )
  }

  return <>{children}</>
}