import { NextResponse } from 'next/server'

import { requireSecurityOperator } from '@/lib/server/security'
import { handleApiError } from '@/lib/server/response'
import { logger, resolveRequestId } from '@/lib/server/logger'
import { prisma } from '@/lib/server/db'
import { sendTelegram } from '@/lib/server/telegram'

// Phase 8 — operator-gated conduit check. Sends a single TEST message to the
// configured Telegram chat and records the delivery row. Never returns or logs
// the bot token.
export async function POST(request: Request) {
  const requestId = resolveRequestId(request)

  const guard = await requireSecurityOperator()
  if (!guard.ok) return guard.response

  try {
    const timestamp = new Date().toISOString()
    const result = await sendTelegram({
      type: 'TEST',
      message: `BuildHub Security Telegram test — ${timestamp}`,
    })

    await logger.info({
      service: 'security',
      message: 'Telegram test message attempted',
      route: '/api/telegram/test',
      method: 'POST',
      status: 200,
      requestId,
      errorCode: result.ok ? null : 'TELEGRAM_FAILED',
    })

    const recent = await prisma.telegramNotification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        type: true,
        severity: true,
        deliveryStatus: true,
        telegramMessageId: true,
        error: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      ok: result.ok,
      configured: result.configured,
      deliveryStatus: result.deliveryStatus,
      telegramMessageId: result.telegramMessageId,
      error: result.error,
      recent: recent.map((row) => ({
        id: row.id,
        type: row.type,
        severity: row.severity,
        deliveryStatus: row.deliveryStatus,
        telegramMessageId: row.telegramMessageId,
        error: row.error,
        createdAt: row.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}