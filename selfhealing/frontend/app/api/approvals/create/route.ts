import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireSecurityOperator } from '@/lib/server/security'
import { createApproval } from '@/lib/server/approval'
import { prisma } from '@/lib/server/db'
import { logger, resolveRequestId } from '@/lib/server/logger'
import { errorResponse, handleApiError, firstZodIssue } from '@/lib/server/response'

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

  const parsed = approvalCreateSchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse(firstZodIssue(parsed.error), 400)
  }

  try {
    const { incidentId, patchId, operator } = parsed.data

    const incident = await prisma.incident.findUnique({ where: { id: incidentId }, select: { id: true } })
    if (!incident) {
      return errorResponse('Incident not found.', 404)
    }

    const approval = await createApproval({
      incidentId,
      patchId,
      operator,
    })

    await logger.info({
      service: 'approval',
      message: 'Approval request created',
      route: '/api/approvals/create',
      method: 'POST',
      status: 200,
      requestId,
      approvalId: approval.approvalId,
      incidentId,
    })

    return NextResponse.json(approval)
  } catch (err) {
    return handleApiError(err)
  }
}

export const approvalCreateSchema = z.object({
  incidentId: z.string().trim().min(1, 'incidentId is required.').max(64),
  patchId: z.string().trim().min(1, 'patchId is required.').max(64),
  operator: z.string().trim().min(1, 'operator is required.').max(128),
})