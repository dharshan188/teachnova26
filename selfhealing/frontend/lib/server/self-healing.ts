import 'server-only'

import { prisma } from './db'
import { createApproval, approveApproval, consumeApproval } from './approval'
import { continueApprovedRepair } from './repair/engine'
import type { IncidentSeverity } from '@prisma/client'

/**
 * Run the complete self-healing pipeline for an incident.
 *
 * Flow:
 * 1. Execute FIXER → CRITIC → JUDGE AI pipeline (via runAgentPipeline)
 * 2. Create an approval request after pipeline completes
 * 3. The approval can be approved via Telegram PROCEED or API
 * 4. After approval, the patch is applied and validated
 * 5. On validation failure, automatic rollback occurs
 *
 * Returns the pipeline result and approval info for the test harness to use.
 */
export async function runSelfHealingPipeline(incidentId: string): Promise<{
  pipelineResult: import('@/lib/server/security').PipelineResult
  approval: { approvalId: string; incidentId: string; patchId: string } | null
  error: string | null
}> {
  // Step 1: Run the agent pipeline (Fixer → Critic → Judge)
  const securityModule = await import('@/lib/server/security')
  const pipelineResult = await securityModule.runAgentPipeline(incidentId)

  if (pipelineResult.aiUnavailable) {
    return {
      pipelineResult,
      approval: null,
      error: 'AI analysis unavailable - Groq not configured or failed.',
    }
  }

  // Step 2: Pipeline completed successfully. AI analysis is done and the
  // incident is in AWAITING_REVIEW status. Create an approval request
  // so a human (or test harness) can authorize the repair.
  const patchId = `PATCH-${incidentId.slice(0, 8)}`

  const approval = await createApproval({
    incidentId,
    patchId,
    operator: 'test-harness',
  })

  return {
    pipelineResult,
    approval: {
      approvalId: approval.approvalId,
      incidentId: approval.incidentId,
      patchId: approval.patchId,
    },
    error: null,
  }
}

/**
 * Simulate authorized PROCEED for an approval.
 *
 * This is called by the test harness after a request for a HIGH-risk patch
 * created an approval. It runs the SAME path a valid Telegram PROCEED would:
 * approve → apply the stored candidate → real validation → RESOLVED or
 * ROLLED_BACK. Nothing is simulated; the patch either survives real probe
 * validation or is rolled back. Returns the final incident state.
 */
export async function simulateProceed(approvalId: string): Promise<{
  approval: { approvalId: string; status: string; incidentId: string; patchId: string } | null
  incidentStatus: string
  patchApplied: boolean
  validationPassed: boolean | null
  error: string | null
}> {
  const approved = await approveApproval(approvalId)
  if (!approved) {
    return {
      approval: null,
      incidentStatus: 'not found',
      patchApplied: false,
      validationPassed: null,
      error: 'Approval not found or not PENDING.',
    }
  }

  const approvalRow = await prisma.approval.findUnique({
    where: { approvalId },
    include: { repairAttempt: true },
  })

  const repairResult = await continueApprovedRepair(approvalId, 'test-harness')

  const patchApplied = repairResult.stage === 'RESOLVED' || repairResult.stage === 'ROLLED_BACK'
  const validationPassed = repairResult.stage === 'RESOLVED' ? true : repairResult.stage === 'ROLLED_BACK' ? false : null

  if (repairResult.ok || repairResult.stage === 'ROLLED_BACK') {
    await consumeApproval(approvalId)
  }

  return {
    approval: {
      approvalId: approved.approvalId,
      status: approvalRow?.repairAttemptId ? 'CONSUMED' : approved.status,
      incidentId: approved.incidentId,
      patchId: approved.patchId,
    },
    incidentStatus: repairResult.stage,
    patchApplied,
    validationPassed,
    error: validationPassed === null ? repairResult.conversationStop : null,
  }
}

/**
 * Force validation failure for a previously applied patch.
 *
 * Validation can no longer be faked — a rollback is only ever triggered by a
 * real failure of the validation probes. This helper returns an error instead
 * of lying about the incident state.
 */
export async function forceValidationFailure(_incidentId: string): Promise<{
  success: boolean
  incidentStatus: string
  rollbackCompleted: boolean
  error: string | null
}> {
  return {
    success: false,
    incidentStatus: 'unsupported',
    rollbackCompleted: false,
    error: 'forceValidationFailure was removed: rollbacks are driven by real validation probe failures only.',
  }
}

/**
 * Get the current approval for an incident, if one exists.
 */
export async function getIncidentApproval(incidentId: string): Promise<{
  approval: { approvalId: string; status: string; patchId: string; createdAt: Date } | null
  error: string | null
}> {
  const approval = await prisma.approval.findFirst({
    where: { incidentId },
    select: {
      approvalId: true,
      status: true,
      patchId: true,
      createdAt: true,
    },
  })

  if (!approval) {
    return { approval: null, error: 'No approval found for this incident.' }
  }

  return {
    approval: {
      approvalId: approval.approvalId,
      status: approval.status,
      patchId: approval.patchId,
      createdAt: approval.createdAt,
    },
    error: null,
  }
}

/**
 * Check if an incident has a pending approval that needs to be addressed.
 */
export async function hasPendingApproval(incidentId: string): Promise<{
  hasPending: boolean
  approvalId: string | null
  expiresAt: Date | null
  error: string | null
}> {
  const approval = await prisma.approval.findFirst({
    where: { incidentId, status: 'PENDING' },
    select: {
      approvalId: true,
      expiresAt: true,
    },
  })

  if (!approval) {
    return { hasPending: false, approvalId: null, expiresAt: null, error: null }
  }

  return {
    hasPending: true,
    approvalId: approval.approvalId,
    expiresAt: approval.expiresAt,
    error: null,
  }
}