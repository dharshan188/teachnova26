import 'server-only'

// Phase 8.5 / attack-demo — source-IP auth-abuse guard.
//
// Detects an authentication-failure burst from a single source address and
// applies a TEMPORARY source-IP mitigation (reject further login attempts with
// 429 until the block expires). Detection + block are real: failed sign-ins
// are counted per source in a sliding window, and crossing the threshold
// updates state, persists structured security log events, creates a real
// SecurityFinding, promotes it to an Incident and queues the REAL
// Fixer/Critic/Judge agent pipeline (all via lib/server/security).
//
// The guard is purely in-memory (per-process) by design:
//   - a fresh server start has a clean guard (deterministic demos/tests),
//   - blocks are TEMPORARY and expire automatically (AUTH_GUARD_BLOCK_MS),
//   - no OS firewall, no network config, no process instrumentation involved.
//
// Safety: only loopback trust resolution is used to derive the source address;
// this powers a demo abuse-guard, never authorization.

import { prisma } from './db'
import { logger } from './logger'

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

// --- Configuration (env-tunable, safe defaults) -----------------------------
const AUTH_GUARD_ENABLED = process.env.AUTH_GUARD_ENABLED !== 'false'
const AUTH_GUARD_FAIL_THRESHOLD = intEnv('AUTH_GUARD_FAIL_THRESHOLD', 10)
const AUTH_GUARD_WINDOW_MS = intEnv('AUTH_GUARD_WINDOW_MS', 60_000)
const AUTH_GUARD_BLOCK_MS = intEnv('AUTH_GUARD_BLOCK_MS', 120_000)

interface SourceEntry {
  failures: number[]
  requestIds: string[]
  blockedUntil: number
  blockedCount: number
}

// The in-memory store MUST be a single process-global object: Next.js production
// builds split route handlers into separate chunks, and a plain module-level
// `Map` would give the login route and the /api/demo/attack telemetry route
// SEPARATE copies of guard state (the block would work but the demo would not
// observe it). globalThis keeps one authoritative store per process.
const STORE_KEY = '__buildhub_auth_guard_store__'
const globalStore = globalThis as unknown as Record<string, Map<string, SourceEntry> | undefined>
if (!globalStore[STORE_KEY]) globalStore[STORE_KEY] = new Map()
const sources = globalStore[STORE_KEY] as Map<string, SourceEntry>

/** Resolves the source address of a request. Loopback only for this demo. */
export function sourceIpFor(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const raw = (forwarded?.split(',')[0] ?? realIp ?? '').trim()
  if (!raw || ['127.0.0.1', '::1', 'localhost'].includes(raw.toLowerCase())) {
    return '127.0.0.1'
  }
  return raw
}

export function isAuthGuardEnabled(): boolean {
  return AUTH_GUARD_ENABLED
}

function entryFor(ip: string): SourceEntry {
  let entry = sources.get(ip)
  if (!entry) {
    entry = { failures: [], requestIds: [], blockedUntil: 0, blockedCount: 0 }
    sources.set(ip, entry)
  }
  return entry
}

export function isSourceBlocked(ip: string): boolean {
  if (!AUTH_GUARD_ENABLED) return false
  const entry = sources.get(ip)
  return entry ? entry.blockedUntil > Date.now() : false
}

export function blockExpiresAt(ip: string): number | null {
  const entry = sources.get(ip)
  if (!entry || entry.blockedUntil <= Date.now()) return null
  return entry.blockedUntil
}

/** Marks a request as rejected-by-mitigation (blocked source). */
export function recordBlockedRequest(ip: string): void {
  const entry = entryFor(ip)
  entry.blockedCount += 1
}

export function sourceSnapshot(ip: string): {
  blocked: boolean
  blockedUntil: string | null
  failCount: number
  blockedCount: number
  threshold: number
  windowMs: number
  blockMs: number
} {
  const entry = sources.get(ip)
  const now = Date.now()
  const failures = (entry?.failures ?? []).filter((t) => now - t <= AUTH_GUARD_WINDOW_MS)
  return {
    blocked: entry ? entry.blockedUntil > now : false,
    blockedUntil: entry && entry.blockedUntil > now ? new Date(entry.blockedUntil).toISOString() : null,
    failCount: failures.length,
    blockedCount: entry?.blockedCount ?? 0,
    threshold: AUTH_GUARD_FAIL_THRESHOLD,
    windowMs: AUTH_GUARD_WINDOW_MS,
    blockMs: AUTH_GUARD_BLOCK_MS,
  }
}

/**
 * Escalation: persists the burst as a real SecurityFinding, promotes it to an
 * Incident and queued REAL agent runs, then fires the analysis pipeline. All
 * failures are recorded honestly (agent runs FAILED with the real error when
 * the model is unavailable). Runs detached so mitigation never depends on AI.
 */
async function escalateBurst(ip: string, requestIds: string[], count: number, at: number) {
  try {
    const { ingestAnalyzerFindings, promoteFindingsToIncidents, runAgentPipeline } =
      await import('./security')
    const finding = {
      ruleId: 'AUTH_BURST',
      title: 'Authentication failure burst',
      severity: 'HIGH' as const,
      endpoint: '/api/auth/login',
      method: 'POST',
      detail: `${count} failed sign-in attempts from ${ip} within a sliding window. Source temporarily blocked by BuildHub's source-IP mitigation.`,
      windowStartMs: at - AUTH_GUARD_WINDOW_MS,
      bucketKey: `ip:${ip}`,
      count,
      requestIds,
    }
    await ingestAnalyzerFindings([finding])
    const { promoted } = await promoteFindingsToIncidents()
    if (promoted.length > 0) {
      const incident = await prisma.incident.findFirst({
        where: { ref: promoted[promoted.length - 1] },
        orderBy: { createdAt: 'desc' },
      })
      if (incident) {
        await runAgentPipeline(incident.id)
      }
    }
  } catch (err) {
    await logger.error({
      service: 'security',
      message: 'AUTH_BURST escalation failed and was recorded honestly',
      route: '/api/auth/login',
      method: 'POST',
      status: 200,
      errorCode: 'AUTH_BURST',
    })
    if (err instanceof Error) {
      console.error('[auth-guard] escalateBurst failed:', err.message)
    }
  }
}

/**
 * Records a failed sign-in for a source. When the sliding-window threshold is
 * crossed, the source becomes temporarily blocked and the burst is escalated
 * to the real security pipeline (detached).
 */
export async function registerAuthFailure(
  ip: string,
  requestId: string | null,
): Promise<{ justBlocked: boolean }> {
  if (!AUTH_GUARD_ENABLED) return { justBlocked: false }

  const now = Date.now()
  const entry = entryFor(ip)
  entry.failures.push(now)
  if (requestId) entry.requestIds.push(requestId)

  const active = entry.failures.filter((t) => now - t <= AUTH_GUARD_WINDOW_MS)
  entry.failures = active
  entry.requestIds = entry.requestIds.slice(-8)

  if (entry.blockedUntil > now) return { justBlocked: false }

  if (active.length >= AUTH_GUARD_FAIL_THRESHOLD) {
    entry.blockedUntil = now + AUTH_GUARD_BLOCK_MS
    await logger.warn({
      service: 'security',
      message: `Authentication failure burst detected from ${ip} — source temporarily blocked for ${Math.round(AUTH_GUARD_BLOCK_MS / 1000)}s`,
      route: '/api/auth/login',
      method: 'POST',
      status: 200,
      requestId: requestId ?? undefined,
      errorCode: 'AUTH_BURST',
    })
    // Detached — mitigation (blocking) takes effect immediately.
    void escalateBurst(ip, entry.requestIds.slice(), active.length, now)
    return { justBlocked: true }
  }
  return { justBlocked: false }
}

/** Clears all in-memory guard state (operator/demo tooling; also safety valve). */
export function resetAuthGuard(): void {
  sources.clear()
}

export interface AuthAttackOverview {
  failCount: number
  threshold: number
  windowMs: number
  blockMs: number
  blocked: boolean
  blockedCount: number
  blockedUntil: string | null
  firstFailureAt: string | null
  detectedAt: string | null
  mitigatedAt: string | null
}

/**
 * DB-derived view of the current auth-burst state. The in-memory map above is
 * authoritative for the login route's 429 rejection, but waiters (telemetry,
 * health, comparison page) run in other isolates and read shared log rows, so
 * this function composes the same truth from real LogEvents: AUTH_FAILED rows
 * within the guard window, the AUTH_BURST event, and persists IP_BLOCKED rows
 * (one per rejected request).
 */
export async function attackOverview(): Promise<AuthAttackOverview> {
  const now = Date.now()
  const windowStart = new Date(now - AUTH_GUARD_WINDOW_MS)

  const [failures, detectedRow, firstBlockedRow, blockedRows] = await Promise.all([
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
      where: { errorCode: 'AUTH_BURST' },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.logEvent.findFirst({
      where: { errorCode: 'IP_BLOCKED' },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.logEvent.findMany({
      where: { errorCode: 'IP_BLOCKED', createdAt: { gte: windowStart } },
      select: { createdAt: true },
    }),
  ])

  const blockedAtMs = firstBlockedRow ? firstBlockedRow.createdAt.getTime() : null
  const blocked = blockedAtMs !== null && now < blockedAtMs + AUTH_GUARD_BLOCK_MS

  return {
    failCount: failures.length,
    threshold: AUTH_GUARD_FAIL_THRESHOLD,
    windowMs: AUTH_GUARD_WINDOW_MS,
    blockMs: AUTH_GUARD_BLOCK_MS,
    blocked,
    blockedCount: blockedRows.length,
    blockedUntil:
      blocked && blockedAtMs !== null
        ? new Date(blockedAtMs + AUTH_GUARD_BLOCK_MS).toISOString()
        : null,
    firstFailureAt: failures[0]?.createdAt.toISOString() ?? null,
    detectedAt: detectedRow?.createdAt.toISOString() ?? null,
    mitigatedAt: firstBlockedRow?.createdAt.toISOString() ?? null,
  }
}