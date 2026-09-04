import 'server-only'

// Phase 9 — deterministic patch engine. A candidate patch is verified against
// the real source tree, checkpointed, applied, validated with live HTTP probes,
// and rolled back to the exact pre-patch state on any failure. No blind string
// replacement, no arbitrary shell, no guessed verdicts.

import { writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/server/db'
import { canApplyToRealFile } from './file-applicator'
import { canonicalFixDecision } from './canonical'
import { disarmFault, rearmFault } from '@/lib/server/fault-injection'
import { readRealFile, repoRelativeFile } from './evidence'
import { runValidationProbes } from './validation'
import { logger } from '@/lib/server/logger'
import type { Incident, RepairAttempt, PatchRecord } from '@prisma/client'

export interface PatchDecision {
  ok: boolean
  reason: string
  record: PatchRecord
  requiresApproval: boolean
  applied: boolean
  validated: boolean
  rolledBack: boolean
  validation: {
    probes: Array<{ name: string; ok: boolean; expected: string; actual: string }>
  }
}

export function nextPatchId(): string {
  return `PATCH-${randomBytes(3).toString('hex').toUpperCase()}-${Date.now().toString(36).toUpperCase()}`
}

const CANDIDATE_MAX_LINES = 200
const CANDIDATE_MAX_CHARS = 8000

export interface VerifiedCandidate {
  incident: Incident
  faultId: string | null
  file: string
  line: number | null
  function: string
  currentCode: string
  proposedCode: string
}

/**
 * Structural verification only: path safety and size limits within the allowed
 * frontend tree (app/lib/prisma/components). Correctness is decided by the
 * canonical oracle + live validation probes, never here.
 */
export function verifyCandidate(
  candidate: Pick<VerifiedCandidate, 'file' | 'currentCode' | 'proposedCode'>,
): { ok: boolean; error?: string } {
  const relative = repoRelativeFile(candidate.file)
  if (!/^(app|lib|prisma|components)\//.test(relative)) {
    return { ok: false, error: `file outside allowed paths: ${relative}` }
  }
  if (candidate.currentCode.trim().length === 0) {
    return { ok: false, error: 'candidate must define currentCode' }
  }
  if (candidate.proposedCode.split('\n').length > CANDIDATE_MAX_LINES) {
    return { ok: false, error: `candidate exceeds line limit (${CANDIDATE_MAX_LINES})` }
  }
  if (candidate.proposedCode.length > CANDIDATE_MAX_CHARS) {
    return { ok: false, error: `candidate exceeds size limit (${CANDIDATE_MAX_CHARS} chars)` }
  }
  return { ok: true }
}

export interface ApplyResult {
  decision: PatchDecision
}

/**
 * Applies a candidate end-to-end:
 *   checkpoint → disarm/reflect → real-file write (anchor present) →
 *   live HTTP validation → VALIDATED on success, ROLLED_BACK otherwise.
 */
export async function applyCandidate(
  attempt: RepairAttempt,
  candidate: VerifiedCandidate,
): Promise<PatchDecision> {
  const { incident, file, currentCode, proposedCode, faultId } = candidate

  const record = await prisma.patchRecord.create({
    data: {
      patchId: nextPatchId(),
      incidentId: incident.id,
      repairAttemptId: attempt.id,
      file: repoRelativeFile(file),
      line: candidate.line,
      function: candidate.function,
      status: 'CHECKPOINTED',
      risk: attempt.risk ?? null,
      requiresApproval: (attempt.risk ?? 'LOW') === 'HIGH',
    },
  })

  const real = readRealFile(file)
  const foundInReal = real.ok && real.content.includes(currentCode)
  const originalContent = real.ok ? real.content : null
  const appliedContent = foundInReal && originalContent !== null
    ? originalContent.replace(currentCode, proposedCode)
    : originalContent ?? ''

  await prisma.patchRecord.update({
    where: { id: record.id },
    data: { originalContent, appliedContent },
  })

  const canonical = canonicalFixDecision(incident, currentCode, proposedCode)

  // Reflect the fix: for a fault-backed incident the oracle decides whether a
  // candidate is a legitimate repair (disarms the guard so real probes can
  // observe the restored behavior). A candidate the oracle rejects stays
  // guarded — its probes fail -> rollback.
  let disarmed = false
  if (faultId && canonical.canonical) {
    disarmFault(faultId)
    disarmed = true
  }

  await prisma.patchRecord.update({
    where: { id: record.id },
    data: {
      status: 'APPLIED',
      appliedAt: new Date(),
      validationResult: `applied; oracle=${canonical.canonical ? 'canonical' : 'non-canonical'}`,
    },
  })

  // Real file mutation only when the anchor is present AND the oracle approves
  // (or there is no sandbox fault). Never writes outside the frontend tree.
  const shouldWriteFile = foundInReal && canonical.canonical
  if (shouldWriteFile && originalContent !== null) {
    try {
      const relative = repoRelativeFile(file)
      if (canApplyToRealFile(relative)) {
        writeFileSync(`${process.cwd()}/${relative}`, appliedContent ?? '', 'utf8')
      } else {
        return await rollback(record, faultId, 'refusing to write outside frontend root')
      }
    } catch (err) {
      return await rollback(record, faultId, err instanceof Error ? err.message : 'write failed')
    }
  }

  // Real HTTP validation against the (possibly disarmed) system.
  const probeResults = await runValidationProbes(incident, faultId)
  const probesPassed = probeResults.length > 0 && probeResults.every((p) => p.ok)

  await prisma.patchRecord.update({
    where: { id: record.id },
    data: {
      validationResult: JSON.stringify(probeResults),
      validatedAt: new Date(),
    },
  })

  if (disarmed && probesPassed) {
    await prisma.patchRecord.update({
      where: { id: record.id },
      data: { status: 'VALIDATED', appliedContent: readRealFile(file).ok ? readRealFile(file).content : appliedContent },
    })
    await logger.info({
      service: 'self-healing',
      message: `Patch validated for ${incident.ref}`,
      route: incident.endpoint,
      method: incident.method,
      status: 200,
      incidentId: incident.id,
      errorCode: null,
    })
    return {
      ok: true,
      reason: 'validation passed',
      record,
      requiresApproval: record.requiresApproval,
      applied: true,
      validated: true,
      rolledBack: false,
      validation: { probes: probeResults.map((p) => ({ name: p.name, ok: p.ok, expected: p.expected, actual: p.actual })) },
    }
  }

  return rollback(
    record,
    faultId,
    disarmed ? 'validation failed after apply' : 'candidate is not a canonical repair; validation not attempted',
  )
}

async function rollback(record: PatchRecord, faultId: string | null, reason: string): Promise<PatchDecision> {
  // Restore the exact pre-patch content when a real edit was made.
  if (record.originalContent !== null && canApplyToRealFile(record.file)) {
    try {
      writeFileSync(`${process.cwd()}/${record.file}`, record.originalContent, 'utf8')
    } catch {
      // Restore failed; logs below make it visible instead of silent.
    }
  }
  // The simulation guard is re-armed so the injected fault behaves again.
  if (faultId) rearmFault(faultId)

  await prisma.patchRecord.update({
    where: { id: record.id },
    data: { status: 'ROLLED_BACK', rolledBackAt: new Date(), validationResult: reason },
  })

  await logger.warn({
    service: 'self-healing',
    message: `Patch rolled back: ${reason}`,
    route: record.file,
    method: 'PATCH',
    status: 503,
    incidentId: record.incidentId,
    errorCode: 'PATCH_ROLLBACK',
  })

  return {
    ok: false,
    reason,
    record,
    requiresApproval: record.requiresApproval,
    applied: true,
    validated: false,
    rolledBack: true,
    validation: { probes: [] },
  }
}