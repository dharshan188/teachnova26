import 'server-only'

// Phase 9 — fault-triggered incident ingestion.
//
// Activating a fault (POST /api/faults { action: activate }) writes the defect
// into the real source AND creates a real Incident row. The incident carries a
// hidden metadata.faultId that ties it to the fault catalog for the engine
// (conversation prompts never see this id — only evidence reads it to build
// the sandbox source view and to know which fault to disarm during apply).

import { prisma } from '@/lib/server/db'
import { getFault } from '@/lib/server/fault-injection'
import { nextIncidentRef } from '@/lib/server/security'
import { addIncidentEvent } from './events'
import { sanitizedErrorCode, faultMetadataFor } from './evidence'
import { sendIncidentAlert } from '@/lib/server/notifications/summary'
import { logger } from '@/lib/server/logger'
import type { Incident, IncidentSeverity } from '@prisma/client'

const FAULT_RISK_WEIGHTS: Record<string, number> = {
  LOW: 10,
  MEDIUM: 25,
  HIGH: 60,
  CRITICAL: 90,
}

export async function createFaultIncident(faultId: string): Promise<Incident | null> {
  const fault = getFault(faultId)
  if (!fault) return null

  const ref = await nextIncidentRef()
  const severity = fault.riskLevel as IncidentSeverity

  const incident = await prisma.incident.create({
    data: {
      ref,
      status: 'DETECTED',
      severity,
      riskScore: FAULT_RISK_WEIGHTS[severity] ?? 0,
      cyberSafetyImpact: severity === 'HIGH' ? 10 : severity === 'MEDIUM' ? 5 : 0,
      title: `${fault.id} — ${fault.name}`,
      description:
        `Controlled fault injected at ${fault.target.file}:${fault.target.line} ` +
        `(${fault.target.function}). Trigger: ${fault.trigger.method} ${fault.trigger.endpoint}. ` +
        `Expected symptom: ${fault.expectedError}.`,
      endpoint: fault.trigger.endpoint,
      method: fault.trigger.method,
      errorCode: sanitizedErrorCode(faultId),
      expectedRootCause: fault.aiExpectedFix,
      detectedBy: 'fault-injection v1 (controlled scenario)',
      metadata: faultMetadataFor(faultId, severity),
    },
  })

  await addIncidentEvent(incident.id, 'DETECTED', 'Fault scenario injected', fault.expectedError)
  // Initial INCIDENT alert — one push at incident creation. Later INCIDENT
  // attempts for the same incident are deduplicated (SKIPPED_DUPLICATE).
  await sendIncidentAlert(incident).catch(() => undefined)
  await logger.info({
    service: 'fault-injection',
    message: `Fault incident ingested: ${faultId} -> ${ref}`,
    route: fault.trigger.endpoint,
    method: fault.trigger.method,
    status: 200,
    incidentId: incident.id,
  })
  return incident
}