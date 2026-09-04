import { NextResponse } from 'next/server'

import { requireSecurityOperator, runAgentPipeline } from '@/lib/server/security'
import { runSelfHealingRepair } from '@/lib/server/repair/engine'
import { prisma } from '@/lib/server/db'
import { errorResponse, firstZodIssue, handleApiError } from '@/lib/server/response'
import { logger, resolveRequestId } from '@/lib/server/logger'
import { runPipelineSchema } from '@/lib/validation'

// Phase 9 — repairs incidents.
//
// Fault-triggered incidents (incident.metadata.faultId) run the full
// self-healing conversation engine (evidence → Coder/Critic → Judge → risk →
// patch → validation → resolve/rollback). Security incidents keep the legacy
// single-pass Fixer/Critic/Judge analysis pipeline. Nothing is faked: model
// failures are recorded as AI UNAVAILABLE / AI_REPAIR_FAILED.
export async function POST(request: Request) {
  const requestId = resolveRequestId(request)

  const guard = await requireSecurityOperator()
  if (!guard.ok) return guard.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('Invalid request body.', 400)
  }

  const parsed = runPipelineSchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse(firstZodIssue(parsed.error), 400)
  }

  try {
    const incident = await prisma.incident.findUnique({
      where: { id: parsed.data.incidentId },
      select: { id: true, ref: true, metadata: true },
    })
    if (!incident) return errorResponse('Incident not found.', 404)

    const faultId = ((incident.metadata ?? null) as { faultId?: string } | null)?.faultId ?? null

    const result = faultId
      ? await runSelfHealingRepair(incident.id, { scenario: parsed.data.scenario })
      : await runAgentPipeline(incident.id)

    await logger.info({
      service: 'security',
      message: 'Repair pipeline run requested',
      route: '/api/security/run',
      method: 'POST',
      status: 200,
      requestId,
      incidentId: parsed.data.incidentId,
      errorCode: faultId ? null : (result as { aiUnavailable?: boolean }).aiUnavailable ? 'AI_UNAVAILABLE' : null,
    })

    return NextResponse.json(result)
  } catch (err) {
    return handleApiError(err)
  }
}