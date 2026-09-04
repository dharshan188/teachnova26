import { NextResponse } from 'next/server'

import { getSessionUser } from '@/lib/server/auth'
import { errorResponse } from '@/lib/server/response'
import { logger } from '@/lib/server/logger'
import { fetchIncidentDetail } from '@/lib/server/observability'

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return errorResponse('Not authenticated.', 401)
  }

  const { id } = await ctx.params
  const detail = await fetchIncidentDetail(id)
  if (!detail) {
    return errorResponse('Incident not found.', 404)
  }

  await logger.info({
    service: 'api',
    message: `Incident detail fetched: ${detail.ref}`,
    route: `/api/incidents/${id}`,
    method: 'GET',
    status: 200,
    requestId: request.headers.get('x-request-id') ?? undefined,
  })

  return NextResponse.json({ incident: detail })
}