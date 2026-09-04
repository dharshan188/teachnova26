import 'server-only'

import { prisma } from './db'
import { randomInt } from 'node:crypto'
import { Prisma } from '@prisma/client'

const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CONSUMED'

export interface ApprovalCreateInput {
  incidentId: string
  patchId: string
  operator: string
  expiresInMs?: number
  repairAttemptId?: string | null
}

export interface Approval {
  id: string
  approvalId: string
  incidentId: string
  patchId: string
  status: ApprovalStatus
  operator: string
  createdAt: Date
  expiresAt: Date
  statusUpdatedAt: Date
}

function nextApprovalId(): string {
  return `APR-${String(randomInt(100000, 1000000))}`
}

export async function createApproval({
  incidentId,
  patchId,
  operator,
  expiresInMs = APPROVAL_TIMEOUT_MS,
  repairAttemptId = null,
}: ApprovalCreateInput): Promise<Approval> {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + expiresInMs)

  // Collision-safe unique id generation (approvalId has a unique index).
  // Only unique-id collisions are retried; FK violation (unknown incident) and
  // any other error propagate so callers can render an honest error.
  let approval: Awaited<ReturnType<typeof prisma.approval.create>> | null = null
  for (let attempt = 0; attempt < 5 && !approval; attempt += 1) {
    try {
      approval = await prisma.approval.create({
        data: {
          approvalId: nextApprovalId(),
          incidentId,
          patchId,
          status: 'PENDING',
          operator,
          createdAt: now,
          expiresAt,
          statusUpdatedAt: now,
          repairAttemptId,
        },
      })
    } catch (err) {
      const isUniqueCollision =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
      if (!isUniqueCollision) throw err
      // unique collision — retry with a fresh id
    }
  }
  if (!approval) throw new Error('Failed to allocate a unique approval id')

  return toApproval(approval)
}

function toApproval(row: {
  id: string
  approvalId: string
  incidentId: string
  patchId: string
  status: string
  operator: string
  createdAt: Date
  expiresAt: Date
  statusUpdatedAt: Date
}): Approval {
  return {
    id: row.id,
    approvalId: row.approvalId,
    incidentId: row.incidentId,
    patchId: row.patchId,
    status: row.status as ApprovalStatus,
    operator: row.operator,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    statusUpdatedAt: row.statusUpdatedAt,
  }
}

/**
 * Get a pending approval by approvalId. Returns null if not found or not PENDING.
 */
export async function getPendingApproval(approvalId: string): Promise<Approval | null> {
  const row = await prisma.approval.findFirst({ where: { approvalId, status: 'PENDING' } })
  return row ? toApproval(row) : null
}

interface UpdateResult {
  ok: boolean
  approval: Approval | null
  reason?: string
}

async function transitionApproval(
  approvalId: string,
  from: ApprovalStatus,
  to: ApprovalStatus,
  reason: string,
): Promise<UpdateResult> {
  const existing = await prisma.approval.findUnique({
    where: { approvalId },
    select: { id: true, status: true, expiresAt: true },
  })
  if (!existing) return { ok: false, approval: null, reason: 'approval not found' }
  if (existing.status !== from) {
    return { ok: false, approval: null, reason: `approval is ${existing.status}, expected ${from}` }
  }
  const updated = await prisma.approval.update({
    where: { id: existing.id },
    data: { status: to, statusUpdatedAt: new Date() },
  })
  return { ok: true, approval: toApproval(updated), reason }
}

/**
 * Approve a pending approval. Updates status to APPROVED.
 */
export async function approveApproval(approvalId: string): Promise<Approval | null> {
  const result = await transitionApproval(approvalId, 'PENDING', 'APPROVED', 'approved')
  return result.ok ? result.approval : null
}

/**
 * Reject a pending approval. Updates status to REJECTED.
 */
export async function rejectApproval(approvalId: string): Promise<Approval | null> {
  const result = await transitionApproval(approvalId, 'PENDING', 'REJECTED', 'rejected')
  return result.ok ? result.approval : null
}

/**
 * Mark a PENDING approval EXPIRED when its expiry has passed.
 */
export async function expireApproval(approvalId: string): Promise<Approval | null> {
  const row = await prisma.approval.findUnique({ where: { approvalId } })
  if (!row || row.status !== 'PENDING') return row ? toApproval(row) : null
  if (new Date() <= row.expiresAt) return toApproval(row)
  const updated = await prisma.approval.update({
    where: { id: row.id },
    data: { status: 'EXPIRED', statusUpdatedAt: new Date() },
  })
  return toApproval(updated)
}

export function isExpired(approval: Approval): boolean {
  return new Date() > approval.expiresAt
}

export function canConsume(approval: Approval): boolean {
  return approval.status === 'APPROVED' && !isExpired(approval)
}

/**
 * Consume an APPROVED approval after the patch has been applied + validated.
 */
export async function consumeApproval(approvalId: string): Promise<Approval | null> {
  const result = await transitionApproval(approvalId, 'APPROVED', 'CONSUMED', 'consumed')
  return result.ok ? result.approval : null
}

/**
 * Lists all approvals that reference a given incident (for UI binding checks).
 */
export async function approvalsForIncident(incidentId: string): Promise<Approval[]> {
  const rows = await prisma.approval.findMany({
    where: { incidentId },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(toApproval)
}