import 'server-only'

import { readFileSync, existsSync } from 'node:fs'
import { prisma } from '@/lib/server/db'
import { getFault } from '@/lib/server/fault-injection'
import { suspectSourceFor } from '@/lib/server/routes-map'
import type { Incident } from '@prisma/client'
import type { EvidenceLog, RepairEvidence } from '@/lib/server/providers/types'

// Phase 9 — evidence collection for the self-healing engine. Only real data is
// shown to the agents. Fault-based incidents present a sandbox "current source"
// view (the injected defect as source) plus the real HTTP symptom; the fault id
// and registry answers are hidden in incident.metadata and never rendered.

/** Maps a fault to the frontend-relative source path shown to agents.
 * The registry paths include a `frontend/` prefix relative to the repo; the
 * server runs with the frontend directory as cwd. */
export function repoRelativeFile(file: string): string {
  return file.replace(/^frontend\//, '')
}

export function readRealFile(file: string): { ok: boolean; content: string; error?: string } {
  const relative = repoRelativeFile(file)
  const full = `${process.cwd()}/${relative}`
  try {
    if (!existsSync(full)) {
      return { ok: false, content: '', error: `file does not exist: ${relative}` }
    }
    return { ok: true, content: readFileSync(full, 'utf8').replace(/^\uFEFF/, '') }
  } catch (err) {
    return {
      ok: false,
      content: '',
      error: err instanceof Error ? err.message : `cannot read ${relative}`,
    }
  }
}

/**
 * Builds the "faulted current view" the agent inspects: the real source file
 * with the injected defect text rendered where the healthy text used to be.
 * The fault id and the healthy baseline are NEVER included.
 */
export function buildSourceContext(incident: Incident): string | null {
  const metadata = (incident.metadata ?? null) as {
    faultId?: string
  } | null
  const faultId = metadata?.faultId
  if (!faultId) return null
  const fault = getFault(faultId)
  if (!fault) return null

  const real = readRealFile(fault.target.file)
  if (!real.ok) return null

  let faulted = real.content
  const original = fault.originalCode
  const injected = fault.faultCode
  if (original && real.content.includes(original)) {
    faulted = real.content.replace(original, injected)
  } else {
    const lines = real.content.split('\n')
    const at = Math.max(0, Math.min(lines.length - 1, fault.target.line - 1))
    const indent = lines[at]?.match(/^\s*/)?.[0] ?? ''
    const injectedLines = injected.split('\n').map((ln) => (ln ? `${indent}${ln}` : ln))
    lines.splice(at, 0, ...injectedLines)
    faulted = lines.join('\n')
  }

  // Extract a window around the defect that shows the whole function.
  const faultedLines = faulted.split('\n')
  const firstFaultLine = injected.trim().split('\n')[0].slice(0, 60)
  const foundAt = faultedLines.findIndex((line) => line.includes(firstFaultLine))
  const injectedAt = foundAt > -1 ? foundAt : Math.max(0, fault.target.line - 1)
  const start = Math.max(0, injectedAt - 12)
  const end = Math.min(faultedLines.length, injectedAt + 18)
  const window = faultedLines.slice(start, end).map((line, i) => {
    const lineNo = start + i + 1
    return `${String(lineNo).padStart(4, ' ')} | ${line}`
  })
  return `${fault.target.file} (sandbox view, line ${start + 1}-${end}):\n${window.join('\n')}`
}

export function sanitizedErrorCode(faultId: string): string {
  const map: Record<string, string> = {
    'LOW-01': 'RUNTIME_TYPE_ERROR',
    'LOW-02': 'RESPONSE_CONTRACT',
    'LOW-03': 'VALIDATION_REGRESSION',
    'MEDIUM-01': 'ENDPOINT_SERVER_ERROR',
    'MEDIUM-02': 'ENDPOINT_SERVER_ERROR',
    'MEDIUM-03': 'AUTHORIZATION_LOGIC',
    'HIGH-01': 'AUTHENTICATION_REGIME',
    'HIGH-02': 'AUTHORIZATION_ENFORCEMENT',
    'HIGH-03': 'INFRASTRUCTURE_DATABASE',
  }
  return map[faultId] ?? 'INJECTED_FAULT'
}

export async function collectEvidence(incident: Incident): Promise<RepairEvidence> {
  const logs = await prisma.logEvent.findMany({
    where: { incidentId: incident.id },
    orderBy: { createdAt: 'desc' },
    take: 25,
  })
  const evidenceLogs: EvidenceLog[] = logs.map((log) => ({
    level: log.level,
    route: log.route,
    method: log.method,
    status: log.status,
    message: log.message,
    requestId: log.requestId,
    errorCode: log.errorCode,
    createdAt: log.createdAt.toISOString(),
  }))

  const metadata = (incident.metadata ?? null) as {
    faultId?: string
    stackTrace?: string | null
    symptomDetail?: string | null
  } | null
  const faultId = metadata?.faultId ?? null
  const fault = faultId ? getFault(faultId) : null

  const memoryHints: RepairEvidence['memoryHints'] = []
  try {
    const memories = await prisma.repairMemory.findMany({
      where: {
        OR: [
          ...(incident.endpoint ? [{ endpoint: incident.endpoint }] : []),
          ...(faultId ? [{ file: fault?.target.file ?? '' }] : [{}]),
        ],
      },
      take: 3,
      orderBy: { updatedAt: 'desc' },
    })
    for (const memory of memories) {
      memoryHints.push({
        rootCause: memory.rootCause ?? '',
        patchSummary: memory.patchSummary ?? '',
        outcome: memory.outcome,
      })
    }
  } catch {
    // memory table is empty on first runs — hints stay empty
  }

  return {
    incidentRef: incident.ref,
    incidentId: incident.id,
    severity: incident.severity,
    title: incident.title,
    description: incident.description,
    endpoint: incident.endpoint,
    method: incident.method,
    errorCode: incident.errorCode,
    requestId: incident.requestId,
    expectedRootCause: incident.expectedRootCause,
    suspectSource: fault ? fault.target.file : suspectSourceFor(incident.endpoint),
    detectedBy: incident.detectedBy ?? 'BuildHub monitoring',
    evidenceCount: Math.max(1, evidenceLogs.length),
    logs: evidenceLogs,
    stackTrace: metadata?.stackTrace ?? null,
    sourceContext: buildSourceContext(incident),
    memoryHints,
  }
}

/** Creates a one-off incident metadata blob from the catalog (kept hidden). */
export function faultMetadataFor(faultId: string, severity: string): object {
  const fault = getFault(faultId)
  return {
    faultId,
    severity,
    stackTrace: fault?.expectedError ?? null,
    symptomDetail: fault ? `While handling ${fault.trigger.method} ${fault.trigger.endpoint}: ${fault.expectedError}` : null,
    sanitizedCode: sanitizedErrorCode(faultId),
  }
}