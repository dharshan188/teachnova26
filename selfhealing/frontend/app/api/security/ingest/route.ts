import { NextResponse } from 'next/server'

import { promoteFindingsToIncidents, requireSecurityOperator } from '@/lib/server/security'
import { handleApiError } from '@/lib/server/response'
import { logger, resolveRequestId } from '@/lib/server/logger'

// Phase 8 — promotes all fresh (DETECTED) security findings into incidents with
// queued REAL agent runs. Idempotent: without new findings this is a no-op.
export async function POST(request: Request) {
  const requestId = resolveRequestId(request)

  const guard = await requireSecurityOperator()
  if (!guard.ok) return guard.response

  try {
    const result = await promoteFindingsToIncidents()

    await logger.info({
      service: 'security',
      message: 'Findings promoted to incidents',
      route: '/api/security/ingest',
      method: 'POST',
      status: 200,
      requestId,
    })

    return NextResponse.json(result)
  } catch (err) {
    return handleApiError(err)
  }
}