import 'server-only'

// Phase 9 — self-healing orchestration.
//
//   evidence → memory → Coder/Critic conversation → Judge → deterministic risk →
//   patch (auto or approval) → real validation → RESOLVED | ROLLED_BACK |
//   AI_REPAIR_FAILED. Every stage is persisted; nothing is random.
//
// Flow by risk tier:
//   LOW / MEDIUM  → auto-apply with live validation (rollback on failure)
//   HIGH          → human approval first (same approval state machine), then
//                   the SAME apply/validate/rollback path

import { prisma } from '@/lib/server/db'
import { collectEvidence } from './evidence'
import {
  createRepairAttempt,
  updateAttemptStatus,
  runRepairConversation,
} from './conversation'
import type { RepairOptions } from './conversation'
import { classifyPatchRisk, type PatchRisk } from './risk'
import { verifyCandidate, applyCandidate } from './patch-engine'
import { getFault, deactivateFault } from '@/lib/server/fault-injection'
import { createApproval, consumeApproval } from '@/lib/server/approval'
import { sendTelegram } from '@/lib/server/telegram'
import {
  sendIncidentTerminalSummary,
  sendRepairPlanMessage,
  buildApprovalRequiredMessage,
} from '@/lib/server/notifications/summary'
import { recordRepairMemory, recordRepairExperience } from '@/lib/server/learning/memory'
import { addIncidentEvent } from './events'
import { logger } from '@/lib/server/logger'
import type { Incident, RepairAttempt } from '@prisma/client'
import type { CoderOutput } from '@/lib/server/providers/types'

export interface RepairRunResult {
  ok: boolean
  incidentRef: string | null
  attemptId: string | null
  stage: string
  risk: PatchRisk | null
  requiresApproval: boolean
  approvalId?: string
  candidateFile: string | null
  judgeDecision: string | null
  conversationStop: string
  roundsUsed: number
  rollback: boolean
  telegram: { sent: boolean; reason: string }
}

export async function runSelfHealingRepair(
  incidentId: string,
  options: RepairOptions = {},
): Promise<RepairRunResult> {
  const incident = await prisma.incident.findUnique({ where: { id: incidentId } })
  if (!incident) {
    return {
      ok: false,
      incidentRef: null,
      attemptId: null,
      stage: 'NOT_FOUND',
      risk: null,
      requiresApproval: false,
      candidateFile: null,
      judgeDecision: null,
      conversationStop: 'incident not found',
      roundsUsed: 0,
      rollback: false,
      telegram: { sent: false, reason: 'incident not found' },
    }
  }

  const metadata = (incident.metadata ?? null) as { faultId?: string } | null
  const faultId = metadata?.faultId ?? null
  const fault = faultId ? getFault(faultId) : null

  const attempt: RepairAttempt = await createRepairAttempt(incident)
  await addIncidentEvent(incident.id, 'INVESTIGATING', 'Self-healing repair started', `attempt ${attempt.attemptId}`)
  await logger.info({
    service: 'self-healing',
    message: `Repair started for ${incident.ref}`,
    route: incident.endpoint,
    method: incident.method,
    status: 200,
    incidentId: incident.id,
  })

  const evidence = await collectEvidence(incident)
  await updateAttemptStatus(attempt.id, 'EVIDENCE_READY')

  const conversationOptions: RepairOptions = {
    maxRounds: options.maxRounds,
    scenario: options.scenario,
    fault: fault
      ? {
          id: fault.id,
          file: fault.target.file,
          line: fault.target.line,
          function: fault.target.function,
          originalCode: fault.originalCode,
          faultCode: fault.faultCode,
        }
      : null,
  }

  const conversation = await runRepairConversation(incident, attempt, evidence, conversationOptions)
  const candidate = conversation.candidate

  await updateAttemptStatus(attempt.id, 'RISK_CLASSIFIED', {
    summary: conversation.humanBrief,
  })

  if (!candidate) {
    const failure = await finalizeFailure(incident, attempt, conversation, evidence)
    return {
      ok: false,
      incidentRef: incident.ref,
      attemptId: attempt.attemptId,
      stage: 'AI_REPAIR_FAILED',
      risk: null,
      requiresApproval: false,
      candidateFile: null,
      judgeDecision: conversation.judge?.decision ?? null,
      conversationStop: conversation.stopReason,
      roundsUsed: conversation.roundsUsed,
      rollback: false,
      telegram: failure.telegram,
    }
  }

  const risk: PatchRisk = classifyPatchRisk(incident, candidate.file).risk
  await updateAttemptStatus(attempt.id, 'RISK_CLASSIFIED', { risk })

  // Candidate structural verification before any apply/approval.
  const verified = verifyCandidate(candidate)
  if (!verified.ok) {
    const failure = await finalizeFailure(incident, attempt, conversation, evidence, undefined, `unsafe candidate: ${verified.error}`)
    return {
      ok: false,
      incidentRef: incident.ref,
      attemptId: attempt.attemptId,
      stage: 'AI_REPAIR_FAILED',
      risk,
      requiresApproval: false,
      candidateFile: candidate.file,
      judgeDecision: conversation.judge?.decision ?? null,
      conversationStop: conversation.stopReason,
      roundsUsed: conversation.roundsUsed,
      rollback: false,
      telegram: failure.telegram,
    }
  }

  if (risk === 'HIGH') {
    const approval = await createApproval({
      incidentId: incident.id,
      patchId: `PATCH-${candidate.file.replace(/\//g, '-')}`,
      operator: 'system',
      repairAttemptId: attempt.id,
    })
    await updateAttemptStatus(attempt.id, 'WAITING_APPROVAL', { risk, riskReason: `HIGH risk: human approval required (${approval.approvalId})` })
    await prisma.incident.update({
      where: { id: incident.id },
      data: { status: 'WAITING_APPROVAL', summary: `Awaiting human approval ${approval.approvalId} for HIGH-risk patch.` },
    })
    await addIncidentEvent(incident.id, 'AWAITING_REVIEW', 'HIGH-risk patch awaiting approval', approval.approvalId)
    const telegram = await notifyApproval(incident)

    return {
      ok: true,
      incidentRef: incident.ref,
      attemptId: attempt.attemptId,
      stage: 'WAITING_APPROVAL',
      risk,
      requiresApproval: true,
      approvalId: approval.approvalId,
      candidateFile: candidate.file,
      judgeDecision: conversation.judge?.decision ?? null,
      conversationStop: conversation.stopReason,
      roundsUsed: conversation.roundsUsed,
      rollback: false,
      telegram,
    }
  }

  // LOW / MEDIUM: announce the auto-repair plan (risk policy) then apply +
  // real validation + rollback. One ESCALATION per incident.
  await sendRepairPlanMessage(incident)
  const decision = await applyCandidate(attempt, {
    incident,
    faultId,
    file: candidate.file,
    line: candidate.line,
    function: candidate.function,
    currentCode: candidate.currentCode,
    proposedCode: candidate.proposedCode,
  })

  if (decision.ok) {
    await prisma.incident.update({
      where: { id: incident.id },
      data: { status: 'RESOLVED', resolvedAt: new Date(), summary: `Auto-repaired (${risk}): ${candidate.diagnosis}` },
    })
    await updateAttemptStatus(attempt.id, 'RESOLVED', {
      risk,
      summary: `RESOLVED: ${candidate.diagnosis}`,
      completedAt: new Date(),
      patchState: { patchId: decision.record.patchId, validation: decision.validation.probes.map((p) => p.name) },
    })
    await addIncidentEvent(incident.id, 'RESOLVED', 'Patch validated — incident resolved', `${decision.record.patchId} (${risk} risk)`)

    await persistLearning(incident, attempt, candidate, risk, 'RESOLVED', evidence, decision.validation.probes.every((p) => p.ok) ? 'validation passed' : null)

    const faultId = (incident.metadata as { faultId?: string } | null)?.faultId ?? null
    if (faultId) deactivateFault(faultId)

    const telegram = await notifyTerminal(incident)

    return {
      ok: true,
      incidentRef: incident.ref,
      attemptId: attempt.attemptId,
      stage: 'RESOLVED',
      risk,
      requiresApproval: false,
      candidateFile: candidate.file,
      judgeDecision: conversation.judge?.decision ?? null,
      conversationStop: conversation.stopReason,
      roundsUsed: conversation.roundsUsed,
      rollback: false,
      telegram,
    }
  }

  // Validation failed → rollback happened.
  await prisma.incident.update({
    where: { id: incident.id },
    data: { status: 'ROLLED_BACK', summary: `Patch rolled back: ${decision.reason}` },
  })
  await updateAttemptStatus(attempt.id, 'ROLLED_BACK', {
    risk,
    summary: `ROLLED_BACK: ${decision.reason}`,
    completedAt: new Date(),
    patchState: { patchId: decision.record.patchId, reason: decision.reason },
  })
  await addIncidentEvent(incident.id, 'VALIDATING', 'Patch failed validation — rolled back', decision.reason)

  await persistLearning(incident, attempt, candidate, risk, 'ROLLED_BACK', evidence, decision.reason)

  const telegram = await notifyTerminal(incident)

  return {
    ok: false,
    incidentRef: incident.ref,
    attemptId: attempt.attemptId,
    stage: 'ROLLED_BACK',
    risk,
    requiresApproval: false,
    candidateFile: candidate.file,
    judgeDecision: conversation.judge?.decision ?? null,
    conversationStop: conversation.stopReason,
    roundsUsed: conversation.roundsUsed,
    rollback: true,
    telegram,
  }
}

async function finalizeFailure(
  incident: Incident,
  attempt: RepairAttempt,
  conversation: Awaited<ReturnType<typeof runRepairConversation>>,
  evidence: Awaited<ReturnType<typeof collectEvidence>>,
  risk?: PatchRisk,
  detail?: string,
): Promise<{ telegram: { sent: boolean; reason: string } }> {
  const stage = conversation.stopReason === 'CODER_REJECTED' ? 'REJECTED' : 'AI_REPAIR_FAILED'
  await prisma.incident.update({
    where: { id: incident.id },
    data: {
      status: stage === 'REJECTED' ? 'AI_REPAIR_FAILED' : 'AI_REPAIR_FAILED',
      summary: `${stage}: ${detail ?? conversation.humanBrief}`,
    },
  })
  await updateAttemptStatus(attempt.id, stage, {
    risk: risk ?? null,
    summary: detail ?? conversation.humanBrief,
    error: detail ?? conversation.stopReason,
    completedAt: new Date(),
  })
  await addIncidentEvent(incident.id, 'INVESTIGATING', stage, (detail ?? conversation.humanBrief).slice(0, 400))
  await persistLearning(incident, attempt, null, risk ?? 'LOW', stage as 'AI_REPAIR_FAILED', evidence, detail ?? conversation.humanBrief)

  const telegram = await notifyTerminal(incident)
  return { telegram }
}

async function persistLearning(
  incident: Incident,
  attempt: RepairAttempt,
  candidate: CoderOutput | null,
  risk: PatchRisk,
  outcome: 'RESOLVED' | 'ROLLED_BACK' | 'AI_REPAIR_FAILED',
  evidence: Awaited<ReturnType<typeof collectEvidence>>,
  detail: string | null,
): Promise<void> {
  try {
    const rootCause = candidate?.rootCause ?? detail ?? 'no candidate produced'
    await recordRepairMemory({
      incident,
      rootCause,
      file: candidate?.file ?? evidence.suspectSource,
      feature: incident.endpoint.split('/').filter(Boolean).slice(0, 2).join('/') || null,
      endpoint: incident.endpoint,
      patchSummary: candidate
        ? `risk=${risk} · ${candidate.diagnosis}`
        : `no patch (${detail ?? 'failed'})`,
      risk,
      outcome,
    })
    const memory = await prisma.repairMemory.findUnique({ where: { incidentId: incident.id } })
    await recordRepairExperience({
      incident,
      memoryId: memory?.id ?? null,
      attemptId: attempt.id,
      state: {
        incidentRef: incident.ref,
        severity: incident.severity,
        endpoint: incident.endpoint,
        errorCode: incident.errorCode,
        evidenceCount: evidence.evidenceCount,
        risk,
      },
      action: candidate
        ? {
            file: candidate.file,
            line: candidate.line,
            function: candidate.function,
            currentCode: candidate.currentCode,
            proposedCode: candidate.proposedCode,
            risk,
          }
        : { decision: 'no-candidate', stopReason: outcome },
      nextState: { incidentStatus: incident.status, resolvedAt: incident.resolvedAt?.toISOString() ?? null },
      terminal: true,
      outcome,
    })
  } catch (err) {
    await logger.warn({
      service: 'learning',
      message: `Learning record failed: ${err instanceof Error ? err.message : 'unknown'}`,
      route: incident.endpoint,
      method: incident.method,
      status: 500,
      incidentId: incident.id,
    })
  }
}

async function notifyTerminal(incident: Incident): Promise<{ sent: boolean; reason: string }> {
  const result = await sendIncidentTerminalSummary(incident)
  if (result.ok) return { sent: true, reason: 'sent (FINAL_SUMMARY)' }
  if (!result.configured) return { sent: false, reason: 'Telegram not configured' }
  return { sent: false, reason: `send failed: ${result.error}` }
}

async function notifyApproval(
  incident: Incident,
): Promise<{ sent: boolean; reason: string }> {
  const message = await buildApprovalRequiredMessage(incident)
  const result = await sendTelegram({
    type: 'HIGH_RISK_APPROVAL_REQUIRED',
    message,
    incidentId: incident.id,
    severity: incident.severity,
  })
  if (result.ok) return { sent: true, reason: `sent (HIGH_RISK_APPROVAL_REQUIRED)` }
  if (!result.configured) return { sent: false, reason: 'Telegram not configured' }
  return { sent: false, reason: `send failed: ${result.error}` }
}

/**
 * Continuation after a human approves a HIGH-risk patch: applies the SAME
 * candidate (checkpoint → validate → rollback) and resolves/rolls back.
 */
export async function continueApprovedRepair(
  approvalId: string,
  approvalOperator: string,
): Promise<RepairRunResult> {
  const approval = await prisma.approval.findUnique({
    where: { approvalId },
    include: { incident: true, repairAttempt: true },
  })
  if (!approval || approval.status !== 'APPROVED') {
    return {
      ok: false,
      incidentRef: null,
      attemptId: null,
      stage: approval ? approval.status : 'NOT_FOUND',
      risk: null,
      requiresApproval: false,
      candidateFile: null,
      judgeDecision: null,
      conversationStop: 'approval not APPROVED',
      roundsUsed: 0,
      rollback: false,
      telegram: { sent: false, reason: 'no approved patch to apply' },
    }
  }
  const incident = approval.incident
  const attempt = approval.repairAttempt
  if (!attempt) {
    return {
      ok: false,
      incidentRef: incident.ref,
      attemptId: null,
      stage: 'NO_ATTEMPT',
      risk: null,
      requiresApproval: false,
      candidateFile: null,
      judgeDecision: null,
      conversationStop: 'attempt missing for approval',
      roundsUsed: 0,
      rollback: false,
      telegram: { sent: false, reason: 'attempt missing' },
    }
  }

  const candidate = await loadFinalCandidate(incident)
  if (!candidate) {
    return {
      ok: false,
      incidentRef: incident.ref,
      attemptId: attempt.attemptId,
      stage: 'NO_CANDIDATE',
      risk: null,
      requiresApproval: false,
      candidateFile: null,
      judgeDecision: null,
      conversationStop: 'no stored candidate',
      roundsUsed: 0,
      rollback: false,
      telegram: { sent: false, reason: 'no candidate stored' },
    }
  }

  const fault = incident.metadata
    ? (() => { const m = incident.metadata as { faultId?: string } | null; return m?.faultId ? getFault(m.faultId) : null })()
    : null
  const faultId = incident.metadata ? ((incident.metadata as { faultId?: string }).faultId ?? null) : null
  const risk = (attempt.risk ?? classifyPatchRisk(incident, candidate.file).risk) as PatchRisk

  await prisma.incident.update({ where: { id: incident.id }, data: { status: 'VALIDATING' } })
  await updateAttemptStatus(attempt.id, 'APPLYING', { summary: `approved by ${approvalOperator}` })

  void fault
  const decision = await applyCandidate(attempt, {
    incident,
    faultId,
    file: candidate.file,
    line: candidate.line,
    function: candidate.function,
    currentCode: candidate.currentCode,
    proposedCode: candidate.proposedCode,
  })

  if (decision.ok) {
    await prisma.incident.update({
      where: { id: incident.id },
      data: { status: 'RESOLVED', resolvedAt: new Date(), summary: `Approved & validated: ${candidate.diagnosis}` },
    })
    await updateAttemptStatus(attempt.id, 'RESOLVED', { risk, summary: `RESOLVED: ${candidate.diagnosis}`, completedAt: new Date(), patchState: { patchId: decision.record.patchId } })
    const faultId = (incident.metadata as { faultId?: string } | null)?.faultId ?? null
    if (faultId) deactivateFault(faultId)
    await consumeApproval(approval.approvalId)
    const telegramAdjusted = await notifyTerminal(incident)
    return {
      ok: true,
      incidentRef: incident.ref,
      attemptId: attempt.attemptId,
      stage: 'RESOLVED',
      risk,
      requiresApproval: false,
      candidateFile: candidate.file,
      judgeDecision: null,
      conversationStop: 'approved-apply',
      roundsUsed: 0,
      rollback: false,
      telegram: { sent: telegramAdjusted.sent, reason: telegramAdjusted.reason },
    }
  }

  await prisma.incident.update({
    where: { id: incident.id },
    data: { status: 'ROLLED_BACK', summary: `Approved patch rolled back: ${decision.reason}` },
  })
  await updateAttemptStatus(attempt.id, 'ROLLED_BACK', { risk, summary: `ROLLED_BACK: ${decision.reason}`, completedAt: new Date(), patchState: { patchId: decision.record.patchId, reason: decision.reason } })
  await consumeApproval(approval.approvalId)
  const telegramAdjusted = await notifyTerminal(incident)
  return {
    ok: false,
    incidentRef: incident.ref,
    attemptId: attempt.attemptId,
    stage: 'ROLLED_BACK',
    risk,
    requiresApproval: false,
    candidateFile: candidate.file,
    judgeDecision: null,
    conversationStop: 'approved-apply-rollback',
    roundsUsed: 0,
    rollback: true,
    telegram: telegramAdjusted,
  }
}

/** Pulls the accepted candidate back out of the attempt's last CODER AgentRun. */
async function loadFinalCandidate(incident: Incident): Promise<CoderOutput | null> {
  const lastCoder = await prisma.agentRun.findFirst({
    where: { incidentId: incident.id, kind: 'CODER', status: 'COMPLETE' },
    orderBy: { round: 'desc' },
  })
  if (!lastCoder?.output) return null
  const parsed = lastCoder.output as Partial<CoderOutput> | null
  if (!parsed || typeof parsed.file !== 'string' || typeof parsed.currentCode !== 'string' || typeof parsed.proposedCode !== 'string') return null
  return {
    diagnosis: parsed.diagnosis ?? 'approved candidate',
    rootCause: parsed.rootCause ?? '',
    file: parsed.file,
    line: typeof parsed.line === 'number' ? parsed.line : null,
    function: parsed.function ?? '',
    affectedBehavior: parsed.affectedBehavior ?? '',
    currentCode: parsed.currentCode,
    proposedCode: parsed.proposedCode,
    validationPlan: parsed.validationPlan ?? '',
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 50,
  }
}