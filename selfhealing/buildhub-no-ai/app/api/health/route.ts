import { NextResponse } from 'next/server'

import { prisma } from '@/lib/server/db'
import { logger, resolveRequestId } from '@/lib/server/logger'
import { availabilityPhase } from '@/lib/server/demo-availability'

type ComponentStatus = 'healthy' | 'degraded' | 'unavailable'

interface Component {
  id: string
  name: string
  status: ComponentStatus
  detail: string
}

// Public health endpoint. Intentionally not behind authentication so external
// probes / load balancers can reach it, mirroring how a real system exposes
// `/health`. It only returns operational status — never session data.
//
// WITHOUT-AI demo behavior: when the safe degradation threshold is crossed the
// availability latch holds the service UNAVAILABLE (503) until the operator
// restarts the process — there is no self-healing, by design.
export async function GET(request: Request) {
  const requestId = resolveRequestId(request)
  const startedAt = Date.now()

  // The WITH-AI build keys availability to the attacking source address; the
  // WITHOUT-AI build's latch is global for the loopback demo.
  const availability = await availabilityPhase()

  const availabilityStatus: ComponentStatus =
    availability === 'unavailable' || availability === 'degraded'
      ? availability
      : 'healthy'

  const components: Component[] = [
    {
      id: 'app',
      name: 'Application',
      status: availability === 'unavailable' ? 'unavailable' : 'healthy',
      detail:
        availability === 'unavailable'
          ? 'Safe degradation threshold reached (no auto-mitigation)'
          : 'BuildHub No-AI demo',
    },
    {
      id: 'availability',
      name: 'Availability',
      status: availabilityStatus,
      detail:
        availability === 'unavailable'
          ? 'Latched UNAVAILABLE — failed sign-in burst exceeded the safe threshold'
          : availability === 'degraded'
            ? 'Degrading — sustained failed sign-in burst, no mitigation active'
            : 'Accepting traffic normally',
    },
  ]

  let database: Component = { id: 'database', name: 'Database', status: 'healthy', detail: 'reachable' }
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    database = { id: 'database', name: 'Database', status: 'unavailable', detail: 'unreachable' }
  }
  components.push(database)

  const unhealthy = components.filter((c) => c.status === 'unavailable')
  const degraded = components.filter((c) => c.status === 'degraded')

  await logger.info({
    service: 'health',
    message:
      unhealthy.length > 0
        ? `Health check: ${unhealthy.length} unavailable`
        : degraded.length > 0
          ? `Health check: ${degraded.length} degraded`
          : 'Health check: all systems operational',
    route: '/api/health',
    method: 'GET',
    status: unhealthy.length > 0 ? 503 : 200,
    requestId,
  })

  const status =
    unhealthy.length > 0 ? 'unavailable' : degraded.length > 0 ? 'degraded' : 'ok'

  const body = {
    status,
    checkedAt: new Date().toISOString(),
    latencyMs: Date.now() - startedAt,
    systemHealth: unhealthy.length > 0 ? 'unavailable' : status,
    components,
  }

  return status === 'unavailable'
    ? NextResponse.json(body, { status: 503 })
    : NextResponse.json(body)
}