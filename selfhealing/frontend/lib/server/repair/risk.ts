import 'server-only'

// Phase 9 — deterministic patch-risk classification (no AI involvement, no
// randomness). Risk is decided from the incident type and structural evidence:
//
//   LOW    — isolated, non-security, single-surface (UI/typo/validation)
//   MEDIUM — endpoint / business-logic / data-path failure
//   HIGH   — authentication, authorization, infrastructure/cascading, or
//            destructive verbs
//
// For fault-catalog incidents the declared catalog risk is authoritative and
// documented in PHASE9_FAULT_TEST_PLAN.md; the rules below must align with it.

import type { Incident } from '@prisma/client'
import { getFault } from '@/lib/server/fault-injection'

export type PatchRisk = 'LOW' | 'MEDIUM' | 'HIGH'

export interface RiskDecision {
  risk: PatchRisk
  reason: string
}

const LIVE_ENDPOINTS = ['/api/health']

function securitySensitivePath(file: string, endpoint: string): boolean {
  const fileLower = file.toLowerCase()
  const secretDomains =
    /(auth|permission|ownership|login|session|password|middleware|authorization)/.test(fileLower) ||
    /(auth|login|account)/.test(endpoint.toLowerCase())
  return secretDomains
}

function cascadingEndpoint(endpoint: string): boolean {
  return (
    endpoint === '/*' ||
    endpoint === '/api/health' ||
    /\/api\/health|db|database|\/api\/(posts|projects|comments)\b/.test(endpoint) ||
    !/^\/api\//.test(endpoint)
  )
}

function destructiveVerb(method: string): boolean {
  return /^DELETE$/.test(method)
}

export function classifyPatchRisk(
  incident: Incident,
  proposedFile: string,
): RiskDecision {
  const metadata = (incident.metadata ?? null) as { faultId?: string } | null
  const faultId = metadata?.faultId ?? null

  // Fault-catalog anchor is authoritative and documented.
  if (faultId) {
    const fault = getFault(faultId)
    if (fault) {
      return { risk: fault.riskLevel, reason: `catalog ${faultId} declares ${fault.riskLevel} risk: ${fault.riskReason}` }
    }
  }

  // Structural evidence for non-fault incidents.
  if (LIVE_ENDPOINTS.some((e) => incident.endpoint === e)) {
    return { risk: 'LOW', reason: 'live-ish endpoint health surface' }
  }

  if (
    securitySensitivePath(proposedFile, incident.endpoint) ||
    cascadingEndpoint(incident.endpoint) ||
    destructiveVerb(incident.method)
  ) {
    return { risk: 'HIGH', reason: `security-sensitive/cascading/destructive surface: ${proposedFile} / ${incident.method} ${incident.endpoint}` }
  }

  if (incident.severity === 'HIGH' || incident.severity === 'CRITICAL') {
    return { risk: 'MEDIUM', reason: `severity ${incident.severity} but no security component` }
  }

  return { risk: 'LOW', reason: `isolated non-security surface ${proposedFile}` }
}