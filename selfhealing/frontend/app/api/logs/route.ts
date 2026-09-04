import { NextResponse } from 'next/server'
import { z } from 'zod'

import { prisma } from '@/lib/server/db'
import { getSessionUser } from '@/lib/server/auth'
import { errorResponse, handleApiError } from '@/lib/server/response'
import { logger } from '@/lib/server/logger'
import { serializeLogEvent } from '@/lib/server/observability'

const CUSTOM_FROM = new Set(['1h', '6h', '24h', '7d'])

const logsQuerySchema = z.object({
  level: z.enum(['INFO', 'WARN', 'ERROR', 'SECURITY']).optional(),
  service: z.string().trim().max(64).optional(),
  route: z.string().trim().max(200).optional(),
  method: z.string().trim().toUpperCase().max(10).optional(),
  status: z.coerce.number().int().min(100).max(599).optional(),
  q: z.string().trim().max(200).optional(),
  from: z.string().trim().max(16).optional(),
  to: z.string().trim().max(16).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
})

function resolveFrom(from?: string): Date | undefined {
  if (!from) return undefined
  if (CUSTOM_FROM.has(from)) {
    const units: Record<string, number> = { h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 }
    const quantity = Number(from.slice(0, -1))
    if (Number.isFinite(quantity)) {
      return new Date(Date.now() - quantity * (units[from.slice(-1)] ?? units.h))
    }
  }
  const date = new Date(from)
  if (!Number.isNaN(date.getTime())) return date
  return undefined
}

export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) {
    return errorResponse('Not authenticated.', 401)
  }

  const parsed = logsQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  )
  if (!parsed.success) {
    return errorResponse('Invalid query parameters.', 400)
  }

  const { level, service, route, method, status, q, from, to, page, pageSize } =
    parsed.data

  const fromDate = resolveFrom(from)
  const toDate = to ? new Date(to) : undefined

  const where = {
    ...(level ? { level } : {}),
    ...(service ? { service } : {}),
    ...(route ? { route } : {}),
    ...(method ? { method } : {}),
    ...(status ? { status } : {}),
    ...(q ? { message: { contains: q } } : {}),
    ...(fromDate ? { createdAt: { gte: fromDate } } : {}),
    ...(toDate && !Number.isNaN(toDate.getTime())
      ? { createdAt: { lte: toDate } }
      : {}),
  }
  const requestId = request.headers.get('x-request-id') ?? undefined

  try {
    const [logs, total] = await Promise.all([
      prisma.logEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.logEvent.count({ where }),
    ])

    const incidentIds = Array.from(
      new Set(logs.map((log) => log.incidentId).filter((v): v is string => Boolean(v))),
    )
    const refMap = new Map<string, string>()
    if (incidentIds.length > 0) {
      const incidents = await prisma.incident.findMany({
        where: { id: { in: incidentIds } },
        select: { id: true, ref: true },
      })
      incidents.forEach((incident) => refMap.set(incident.id, incident.ref))
    }

    await logger.info({
      service: 'api',
      message: `Log events fetched: ${logs.length} returned`,
      route: '/api/logs',
      method: 'GET',
      status: 200,
      requestId,
    })

    return NextResponse.json({
      logs: await Promise.all(logs.map((log) => serializeLogEvent(log, refMap))),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    })
  } catch (err) {
    return handleApiError(err)
  }
}