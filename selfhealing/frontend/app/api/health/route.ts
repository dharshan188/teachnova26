import { NextResponse } from 'next/server'

import { logger, resolveRequestId } from '@/lib/server/logger'
import {
  computeComponentsHealth,
  computeSystemHealth,
} from '@/lib/server/observability'

// Public health endpoint. Intentionally not behind authentication so external
// probes / load balancers can reach it, mirroring how a real system exposes
// `/health`. It only returns operational status — never session data.
export async function GET(request: Request) {
  const requestId = resolveRequestId(request)
  const startedAt = Date.now()

  const components = await computeComponentsHealth()
  const unhealthy = components.filter(
    (component) => component.status === 'unavailable',
  )
  const degraded = components.filter(
    (component) => component.status === 'degraded',
  )

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
    status: 200,
    requestId,
  })

  const status =
    unhealthy.length > 0 ? 'unavailable' : degraded.length > 0 ? 'degraded' : 'ok'

  return NextResponse.json({
    status,
    checkedAt: new Date().toISOString(),
    latencyMs: Date.now() - startedAt,
    systemHealth: computeSystemHealth(components),
    components,
  })
}