import { NextResponse } from 'next/server'

import { prisma } from '@/lib/server/db'
import { getSessionUser } from '@/lib/server/auth'
import { errorResponse, handleApiError } from '@/lib/server/response'
import { logger } from '@/lib/server/logger'
import {
  computeOverview,
  computeComponentsHealth,
  detectSecurityFindings,
  serializeLogEvent,
} from '@/lib/server/observability'

// Single summary payload backing the command center Overview + shell status.
export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) {
    return errorResponse('Not authenticated.', 401)
  }

  const requestId = request.headers.get('x-request-id') ?? undefined

  try {
    const [overview, components, securityEvents, recentLogRows] = await Promise.all([
      computeOverview(),
      computeComponentsHealth(),
      detectSecurityFindings(),
      prisma.logEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ])

    const refMap = new Map<string, string>()
    const incidentIds = recentLogRows
      .map((log) => log.incidentId)
      .filter((v): v is string => Boolean(v))
    if (incidentIds.length > 0) {
      const incidents = await prisma.incident.findMany({
        where: { id: { in: incidentIds } },
        select: { id: true, ref: true },
      })
      incidents.forEach((incident) => refMap.set(incident.id, incident.ref))
    }

    await logger.info({
      service: 'api',
      message: 'Observability summary fetched',
      route: '/api/observability/summary',
      method: 'GET',
      status: 200,
      requestId,
    })

    return NextResponse.json({
      overview,
      components,
      securityEvents,
      recentLogs: await Promise.all(
        recentLogRows.map((log) => serializeLogEvent(log, refMap)),
      ),
    })
  } catch (err) {
    return handleApiError(err)
  }
}