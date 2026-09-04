import { NextResponse } from 'next/server'

import { prisma } from '@/lib/server/db'
import { logger } from '@/lib/server/logger'
import { computeComponentsHealth, computeSystemHealth } from '@/lib/server/observability'
import {
  attackOverview,
  isAuthGuardEnabled,
  resetAuthGuard,
} from '@/lib/server/auth-guard'

import { requireSecurityOperator } from '@/lib/server/security'

// Live telemetry for the "same attack" comparison demo.
//
// This endpoint is intentionally PUBLIC (GET). It exposes only real,
// non-sensitive operational state so the attack-demo UI can render a live view
// of the WITH-AI build from the WITHOUT-AI frontend. It never exposes
// credentials, tokens or payloads — only counts, phases, timestamps and safe
// log summaries.
//
// The in-memory source-IP guard is BOTH the mitigation and the primary signal,
// so this view cannot be faked: phase transitions are a direct function of the
// guard state + real security incidents.

function serializeEvent(row: {
  id: string
  level: string
  service: string
  message: string
  route: string | null
  method: string | null
  status: number | null
  errorCode: string | null
  createdAt: Date
}) {
  return {
    id: row.id,
    level: row.level,
    service: row.service,
    message: row.message,
    route: row.route,
    method: row.method,
    status: row.status,
    errorCode: row.errorCode,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function GET(_request: Request) {
  const source = '127.0.0.1'
  const snapshot = await attackOverview()

  const startedAt = Date.now()
  const components = await computeComponentsHealth()
  const latencyMs = Date.now() - startedAt
  const systemHealth = computeSystemHealth(components)

  const unhealthyCount = components.filter((c) => c.status === 'unavailable').length
  const degradedCount = components.filter((c) => c.status === 'degraded').length
  const healthStatus: 'ok' | 'degraded' | 'unavailable' =
    unhealthyCount > 0 ? 'unavailable' : degradedCount > 0 ? 'degraded' : 'ok'

  const [events, burstIncident] = await Promise.all([
    prisma.logEvent.findMany({
      where: {
        OR: [
          { errorCode: { in: ['AUTH_FAILED', 'AUTH_BURST', 'IP_BLOCKED'] } },
          { service: 'security' },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 60,
      select: {
        id: true,
        level: true,
        service: true,
        message: true,
        route: true,
        method: true,
        status: true,
        errorCode: true,
        createdAt: true,
      },
    }),
    prisma.incident.findFirst({
      where: { errorCode: 'AUTH_BURST' },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  let runs: unknown[] = []
  if (burstIncident) {
    runs = (
      await prisma.agentRun.findMany({
        where: { incidentId: burstIncident.id },
        orderBy: { round: 'asc' },
      })
    ).map((run) => ({
      agent: run.agent,
      status: run.status,
      progress: run.progress,
      currentActivity: run.currentActivity,
      round: run.round,
      mode: run.mode,
      outputSummary: run.outputSummary,
    }))
  }

  // Phase is a pure function of live state (cannot be faked).
  let phase: 'normal' | 'attack' | 'detected' | 'mitigating' | 'recovered'
  if (snapshot.blocked) {
    phase = 'mitigating'
  } else if (snapshot.blockedCount > 0 || burstIncident) {
    phase = 'recovered' // contained: block expired or incident known, service back
  } else if (snapshot.failCount > 0) {
    phase = 'attack'
  } else {
    phase = 'normal'
  }

  return NextResponse.json({
    build: 'ai',
    port: 3000,
    source,
    guardEnabled: isAuthGuardEnabled(),
    phase,
    state: {
      threshold: snapshot.threshold,
      windowMs: snapshot.windowMs,
      blockMs: snapshot.blockMs,
      failCount: snapshot.failCount,
      blocked: snapshot.blocked,
      blockedUntil: snapshot.blockedUntil,
      blockedCount: snapshot.blockedCount,
    },
    health: {
      status: healthStatus,
      availability:
        healthStatus === 'ok' ? 'healthy' : healthStatus === 'degraded' ? 'degraded' : 'unavailable',
      latencyMs,
      checkedAt: new Date().toISOString(),
      systemHealth,
      components,
    },
    incident: burstIncident
      ? {
          ref: burstIncident.ref,
          severity: burstIncident.severity,
          status: burstIncident.status,
          riskScore: burstIncident.riskScore,
          title: burstIncident.title,
          createdAt: burstIncident.createdAt.toISOString(),
        }
      : null,
    agentRuns: runs,
    timestamps: {
      firstFailureAt: snapshot.firstFailureAt,
      detectedAt: snapshot.detectedAt,
      mitigatedAt: snapshot.mitigatedAt,
    },
    events: events.map(serializeEvent),
  })
}

// Operator reset — clears the in-memory guard so a fresh run is deterministic.
// Requires a real security-operator session (never exposed to the attack tool).
export async function POST(request: Request) {
  const operator = await requireSecurityOperator()
  if (!operator.ok) {
    return operator.response
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 })
  }
  const action = (body as { action?: unknown })?.action
  if (action !== 'reset') {
    return NextResponse.json({ ok: false, error: 'Unsupported action.' }, { status: 400 })
  }

  resetAuthGuard()
  // Clear the previous demo run's attack artifacts so a fresh run is
  // deterministic (incident/agent-run children cascade via the schema). This
  // only touches AUTH_BURST-scoped rows the demo itself created.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  await Promise.all([
    prisma.securityFinding.deleteMany({ where: { ruleId: 'AUTH_BURST' } }),
    prisma.incident.deleteMany({ where: { errorCode: 'AUTH_BURST' } }),
    prisma.logEvent.deleteMany({
      where: {
        createdAt: { gte: since },
        errorCode: { in: ['AUTH_FAILED', 'AUTH_BURST', 'IP_BLOCKED'] },
      },
    }),
  ])
  await logger.info({
    service: 'security',
    message: 'Source-IP auth guard reset by operator (demo tooling)',
    route: '/api/demo/attack',
    method: 'POST',
    status: 200,
    errorCode: 'GUARD_RESET',
  })
  return NextResponse.json({ ok: true, reset: true })
}