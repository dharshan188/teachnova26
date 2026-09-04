import 'server-only'

// BuildHub — No-AI availability model (attack-demo, WITHOUT-AI side).
//
// LOCAL DEMO LIMITATION (intentional and documented):
// The No-AI build is a faithful copy of BuildHub WITHOUT the AI build's
// source-IP abuse guard. It deliberately ships NO auto-mitigation: a burst of
// failed sign-ins is never rejected. Its only protection is a conservative,
// self-imposed SAFE DEGRADATION threshold — past it the service stops serving,
// exactly like an app that has exhausted its backend under load with no
// supervisor to recover it. This keeps the WITHOUT-AI failure real, observable
// and confined to this local loopback demo.
//
// Recovery WITHOUT AI = operator reset (POST /api/demo/attack {action:'reset'})
// or a restart of the process: every process boot clears the previous run's
// attack-log rows (see ensureBootClean), so a fresh start is clean. No
// self-healing, by design.
//
// State derives from the REAL structured log events the app already persists
// to Postgres (AUTH_FAILED / ATTACK_DEGRADED / ATTACK_UNAVAILABLE). This is
// deliberate: Next.js production runs route handlers in isolated worker
// contexts, so a module-level in-memory map is NOT shared between the login
// route, /health and the telemetry route. Deriving state from shared log rows
// makes every route observe the same truth.

import { prisma } from './db'
import { logger } from './logger'

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

const DEMO_AUTH_DEGRADE_THRESHOLD = intEnv('DEMO_AUTH_DEGRADE_THRESHOLD', 40)
const DEMO_AUTH_FAIL_THRESHOLD = intEnv('DEMO_AUTH_FAIL_THRESHOLD', 60)
const DEMO_AUTH_WINDOW_MS = intEnv('DEMO_AUTH_WINDOW_MS', 60_000)

export type AvailabilityPhase = 'normal' | 'degraded' | 'unavailable'

// Once per isolate (per process boot), clear the previous run's attack-demo
// rows so "operator restart = clean recovery" holds for every route handler.
function bootCleaned(): boolean {
  const globalStore = globalThis as unknown as Record<string, boolean | undefined>
  const key = '__buildhub_no_ai_boot_cleaned__'
  if (globalStore[key]) return true
  globalStore[key] = true
  return false
}

async function ensureBootClean(): Promise<void> {
  if (bootCleaned()) return
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    await prisma.logEvent.deleteMany({
      where: {
        createdAt: { gte: since },
        OR: [
          { service: 'attack' },
          { errorCode: { in: ['AUTH_FAILED', 'ATTACK_DEGRADED', 'ATTACK_UNAVAILABLE'] } },
        ],
      },
    })
  } catch (err) {
    console.error('[availability] boot clean failed:', err instanceof Error ? err.message : 'unknown')
  }
}

/** Resolves the source address. Loopback only for this demo. */
export function sourceIpFor(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const raw = (forwarded?.split(',')[0] ?? realIp ?? '').trim()
  if (!raw || ['127.0.0.1', '::1', 'localhost'].includes(raw.toLowerCase())) {
    return '127.0.0.1'
  }
  return raw
}

export interface Availability {
  phase: AvailabilityPhase
  available: boolean
  failCount: number
  degradeThreshold: number
  failThreshold: number
  windowMs: number
  firstFailureAt: string | null
  degradedAt: string | null
  unavailableAt: string | null
}

export async function availabilityInfo(): Promise<Availability> {
  await ensureBootClean()
  const windowStart = new Date(Date.now() - DEMO_AUTH_WINDOW_MS)

  const [failures, degradedRow, unavailableRow] = await Promise.all([
    prisma.logEvent.findMany({
      where: {
        level: 'WARN',
        errorCode: 'AUTH_FAILED',
        route: '/api/auth/login',
        createdAt: { gte: windowStart },
      },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.logEvent.findFirst({
      where: { errorCode: 'ATTACK_DEGRADED' },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.logEvent.findFirst({
      where: { errorCode: 'ATTACK_UNAVAILABLE' },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const failCount = failures.length
  const phase: AvailabilityPhase =
    unavailableRow || failCount >= DEMO_AUTH_FAIL_THRESHOLD
      ? 'unavailable'
      : failCount >= DEMO_AUTH_DEGRADE_THRESHOLD
        ? 'degraded'
        : 'normal'

  return {
    phase,
    available: phase !== 'unavailable',
    failCount,
    degradeThreshold: DEMO_AUTH_DEGRADE_THRESHOLD,
    failThreshold: DEMO_AUTH_FAIL_THRESHOLD,
    windowMs: DEMO_AUTH_WINDOW_MS,
    firstFailureAt: failures[0]?.createdAt.toISOString() ?? null,
    degradedAt: degradedRow?.createdAt.toISOString() ?? null,
    unavailableAt: unavailableRow?.createdAt.toISOString() ?? null,
  }
}

export async function availabilityPhase(): Promise<AvailabilityPhase> {
  return (await availabilityInfo()).phase
}

/**
 * Records a failed sign-in (called AFTER the AUTH_FAILED log row exists). No
 * mitigation — the failure is only reflected in shared log state, and when the
 * safe threshold is crossed the run's first ATTACK_DEGRADED / ATTACK_UNAVAILABLE
 * rows latch the phase (persisted, so every route agrees).
 */
export async function registerAuthFailure(requestId: string | null): Promise<AvailabilityPhase> {
  const info = await availabilityInfo()

  if (info.phase === 'unavailable' && !info.unavailableAt) {
    await logger.error({
      service: 'attack',
      message: `SERVICE UNAVAILABLE — ${info.failCount} failed sign-in attempts exceeded the safe degradation threshold with no auto-mitigation (without-AI build)`,
      route: '/api/auth/login',
      method: 'POST',
      status: 503,
      requestId: requestId ?? undefined,
      errorCode: 'ATTACK_UNAVAILABLE',
    })
  } else if (info.phase === 'degraded' && !info.degradedAt) {
    await logger.warn({
      service: 'attack',
      message: `SERVICE DEGRADED — sustained failed sign-in burst observed, no mitigation active (without-AI build)`,
      route: '/api/auth/login',
      method: 'POST',
      status: 200,
      requestId: requestId ?? undefined,
      errorCode: 'ATTACK_DEGRADED',
    })
  }
  return info.phase
}

/** Clears all attack-demo state (operator reset; equivaled by a process boot). */
export async function resetAvailability(): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  await prisma.logEvent.deleteMany({
    where: {
      createdAt: { gte: since },
      OR: [
        { service: 'attack' },
        { errorCode: { in: ['AUTH_FAILED', 'ATTACK_DEGRADED', 'ATTACK_UNAVAILABLE'] } },
      ],
    },
  })
}