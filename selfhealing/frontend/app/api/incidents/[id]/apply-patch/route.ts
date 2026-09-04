import { NextResponse } from 'next/server'

import { getSessionUser } from '@/lib/server/auth'
import { prisma } from '@/lib/server/db'
import { logger } from '@/lib/server/logger'
import { errorResponse, handleApiError } from '@/lib/server/response'

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: incidentId } = await ctx.params
  const user = await getSessionUser()
  if (!user) {
    return errorResponse('Not authenticated.', 401)
  }

  const requestId = request.headers.get('x-request-id') ?? undefined

  try {
    // Check for an existing pending approval
    const pendingApproval = await prisma.approval.findFirst({
      where: { incidentId, status: 'PENDING' },
      select: {
        approvalId: true,
        patchId: true,
        status: true,
        operator: true,
        createdAt: true,
        expiresAt: true,
      },
    })

    if (!pendingApproval) {
      return errorResponse('No pending approval for this incident.', 404)
    }

    // Check expiration
    if (pendingApproval.expiresAt && new Date() > pendingApproval.expiresAt) {
      await prisma.approval.update({
        where: { approvalId: pendingApproval.approvalId },
        data: { status: 'EXPIRED', statusUpdatedAt: new Date() },
      })
      return NextResponse.json({
        expired: true,
        message: 'Approval has expired.',
        status: 'EXPIRED',
      })
    }

    // Verify the approval is APPROVED (not just pending)
    if (pendingApproval.status !== 'APPROVED') {
      return errorResponse('Approval is not APPROVED.', 400)
    }

    // Apply the patch - in the real system this would be a sandboxed apply
    // For now, we'll update the incident status and simulate the apply
    await prisma.incident.update({
      where: { id: incidentId },
      data: {
        status: 'VALIDATING',
        summary: pendingApproval.patchId,
      },
    })

    // Record the patch applied event
    const eventDetail = 'Patch ' + pendingApproval.patchId + ' applied with approval ' + pendingApproval.approvalId
    await prisma.incidentEvent.create({
      data: {
        incidentId,
        stage: 'PATCH_APPLIED',
        label: 'Patch applied via approval',
        detail: eventDetail,
      },
    })

    await logger.info({
      service: 'incident',
      message: 'Patch applied awaiting validation',
      route: '/api/incidents/[id]/apply-patch',
      method: 'POST',
      status: 200,
      requestId,
      incidentId,
      approvalId: pendingApproval.approvalId,
    })

    return NextResponse.json({
      approved: true,
      approvalId: pendingApproval.approvalId,
      patchId: pendingApproval.patchId,
      status: 'AWAITING_VALIDATION',
      message: 'Patch applied. Validation in progress.',
    })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: incidentId } = await ctx.params
  const user = await getSessionUser()
  if (!user) {
    return errorResponse('Not authenticated.', 401)
  }

  const approval = await prisma.approval.findFirst({
    where: { incidentId },
    select: {
      id: true,
      approvalId: true,
      status: true,
      operator: true,
      createdAt: true,
      expiresAt: true,
      patchId: true,
    },
  })

  if (!approval) {
    return NextResponse.json({ hasApproval: false })
  }

  return NextResponse.json({
    hasApproval: true,
    approvalId: approval.approvalId,
    status: approval.status,
    patchId: approval.patchId,
    createdAt: approval.createdAt,
    expiresAt: approval.expiresAt,
  })
}