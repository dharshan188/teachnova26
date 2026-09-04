import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/server/auth'
import { prisma } from '@/lib/server/db'
import { errorResponse } from '@/lib/server/response'

// BuildHub — No-AI Demo
//
// Real log view: returns the actual backend LogEvent rows produced by the
// demo flow (fault-injection failures and post creation). Nothing here is
// fabricated — the entries are the app's own persisted structured logs.

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return errorResponse('Not authenticated.', 401)
  }

  const events = await prisma.logEvent.findMany({
    where: {
      OR: [{ service: 'fault-injection' }, { service: 'demo' }, { route: '/api/posts' }],
    },
    orderBy: { createdAt: 'desc' },
    take: 40,
  })

  return NextResponse.json({
    entries: events.map((e) => ({
      id: e.id,
      timestamp: e.createdAt.toISOString(),
      level: e.level,
      service: e.service,
      message: e.message,
      route: e.route,
      method: e.method,
      status: e.status,
      errorCode: e.errorCode,
    })),
  })
}