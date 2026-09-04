import { NextResponse } from 'next/server'

import { prisma } from '@/lib/server/db'
import { getSessionUser } from '@/lib/server/auth'
import { logger } from '@/lib/server/logger'
import { availabilityInfo, resetAvailability } from '@/lib/server/demo-availability'

// Live telemetry for the "same attack" comparison demo (WITHOUT-AI side).
//
// Public (GET) so the demo UI + comparison scripts can read the real No-AI
// state. Nothing here can be faked: phase/availability are a direct function
// of the in-memory availability latch and the failed-sign-in window, mirrored
// by the real health endpoint.

const SOURCE = '127.0.0.1'

export async function GET(_request: Request) {
  const snapshot = await availabilityInfo()
  const startedAt = Date.now()

  let dbOk = false
  try {
    await prisma.$queryRaw`SELECT 1`
    dbOk = true
  } catch {
    dbOk = false
  }
  const latencyMs = Date.now() - startedAt

  const healthStatus =
    snapshot.phase === 'unavailable'
      ? 'unavailable'
      : snapshot.phase === 'degraded'
        ? 'degraded'
        : dbOk
          ? 'ok'
          : 'unavailable'

  const events = await prisma.logEvent.findMany({
    where: {
      OR: [
        { service: 'attack' },
        { errorCode: { in: ['AUTH_FAILED', 'ATTACK_DEGRADED', 'ATTACK_UNAVAILABLE'] } },
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
  })

  return NextResponse.json(
    {
      build: 'noai',
      port: 3001,
      source: SOURCE,
      phase: snapshot.phase,
      state: {
        failCount: snapshot.failCount,
        degradeThreshold: snapshot.degradeThreshold,
        failThreshold: snapshot.failThreshold,
        windowMs: snapshot.windowMs,
        firstFailureAt: snapshot.firstFailureAt,
        degradedAt: snapshot.degradedAt,
        unavailableAt: snapshot.unavailableAt,
      },
      health: {
        status: healthStatus,
        availability: healthStatus,
        latencyMs,
        checkedAt: new Date().toISOString(),
        systemHealth: healthStatus,
        components: [
          {
            name: 'availability',
            label: 'Availability',
            status: snapshot.phase,
            detail:
              snapshot.phase === 'unavailable'
                ? 'Latched UNAVAILABLE — no auto-mitigation (without-AI)'
                : snapshot.phase === 'degraded'
                  ? 'Degrading — failed sign-in burst, no mitigation active'
                  : 'Accepting traffic normally',
          },
          {
            name: 'database',
            label: 'Database',
            status: dbOk ? 'healthy' : 'unavailable',
            detail: dbOk ? 'Query engine responsive' : 'Cannot reach PostgreSQL',
          },
        ],
      },
      incident: null,
      agentRuns: [],
      timestamps: {
        firstFailureAt: snapshot.firstFailureAt,
        degradedAt: snapshot.degradedAt,
        unavailableAt: snapshot.unavailableAt,
      },
      events: events.map((e) => ({
        id: e.id,
        level: e.level,
        service: e.service,
        message: e.message,
        route: e.route,
        method: e.method,
        status: e.status,
        errorCode: e.errorCode,
        createdAt: e.createdAt.toISOString(),
      })),
    },
    {
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}

// Operator reset — clears the without-AI availability latch. Requires a signed
// in session (never exposed to the attack tool, which is unauthenticated).
export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Authentication required.' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 })
  }
  if ((body as { action?: unknown })?.action !== 'reset') {
    return NextResponse.json({ ok: false, error: 'Unsupported action.' }, { status: 400 })
  }

  await resetAvailability()
  await logger.info({
    service: 'attack',
    message: 'Availability latch reset by operator (demo tooling)',
    route: '/api/demo/attack',
    method: 'POST',
    status: 200,
    errorCode: 'AVAILABILITY_RESET',
  })
  return NextResponse.json({ ok: true, reset: true })
}