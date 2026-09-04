import 'server-only'

// Phase 9 — deterministic "canonical fix" oracle.
//
// Faults are runtime guards: the real source files are healthy, so an applied
// file edit alone cannot neutralize them in this sandbox. When the Coder's
// proposed patch matches the documented healthy baseline (the fault catalog's
// `originalCode`/`aiExpectedFix` semantics), the environment reflects the fix
// by disarming the guard, and real HTTP validation probes then observe whether
// the underlying behavior was actually restored.
//
// The oracle is score-only: it decides whether a candidate is a legitimate
// attempt to restore healthy behavior. The candidate is never shown the
// catalog — it must reach the healthy code from the faulted source view.
// Rules are explicit, deterministic and documented against the 9-fault catalog.

import type { Incident } from '@prisma/client'
import { getFault } from '@/lib/server/fault-injection'

function norm(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

interface OracleResult {
  canonical: boolean
  reason: string
}

function oracleFor(faultId: string, currentCode: string, proposedCode: string): OracleResult {
  const fault = getFault(faultId)
  if (!fault) {
    return { canonical: false, reason: `unknown fault reference ${faultId}` }
  }

  const cur = norm(currentCode)
  const prop = norm(proposedCode)
  const orig = norm(fault.originalCode)

  // Exact restoration (whitespace-insensitive) — always accepted.
  if (prop.length > 0 && prop === orig) {
    return { canonical: true, reason: 'exact healthy baseline restored' }
  }

  // The injected symptom must actually be removed/neutralized.
  const injectedSymptom = norm(fault.faultCode)

  switch (faultId) {
    case 'LOW-01':
      if (cur.includes('undefinedProperty') && /session\.user\.id/.test(prop)) {
        return { canonical: true, reason: 'author reference restored (session.user.id)' }
      }
      break
    case 'LOW-02':
      if (cur.includes('poost') && /return NextResponse\.json\(\{ post:/.test(prop)) {
        return { canonical: true, reason: 'response contract restored (post key)' }
      }
      break
    case 'LOW-03':
      if (cur.includes('.min(1001') && /\.min\(1/.test(prop)) {
        return { canonical: true, reason: 'minimum length restored (min(1))' }
      }
      break
    case 'MEDIUM-01':
    case 'MEDIUM-02':
      if (/(Injected DB (failure|query failure))/.test(cur) && !/(Injected DB (failure|query failure))/.test(prop)) {
        return { canonical: true, reason: `injected ${faultId} failure removed` }
      }
      break
    case 'MEDIUM-03':
      if (/ownerId\s*===\s*user\.id/.test(cur) && /ownerId\s*!==\s*user\.id/.test(prop)) {
        return { canonical: true, reason: 'ownership check polarity restored (!==)' }
      }
      break
    case 'HIGH-01':
      if (injectedSymptom.indexOf('!user') > -1 && /verifyPassword|passwordValid|applyHigh01AuthBypass/.test(prop)) {
        return { canonical: true, reason: 'password verification enforced in login' }
      }
      break
    case 'HIGH-02':
      if (cur.startsWith('//') && /ownerId\s*!==\s*user\.id/.test(prop)) {
        return { canonical: true, reason: 'ownership check un-commented in DELETE' }
      }
      break
    case 'HIGH-03':
      if (/localhost:5432\/invalid/.test(cur) && /process\.env\.DATABASE_URL/.test(prop)) {
        return { canonical: true, reason: 'database connection restored from DATABASE_URL' }
      }
      break
    default:
      return { canonical: prop.length > 0 && prop === orig, reason: 'exact match check' }
  }
  return { canonical: false, reason: `proposed fix does not restore the documented healthy baseline for ${faultId}` }
}

export function canonicalFixDecision(
  incident: Incident,
  currentCode: string,
  proposedCode: string,
): OracleResult {
  const metadata = (incident.metadata ?? null) as { faultId?: string } | null
  if (!metadata?.faultId) {
    // Non-fault incidents apply to real files and are validated by live probes.
    return { canonical: true, reason: 'real-source patch (no sandbox oracle)' }
  }
  return oracleFor(metadata.faultId, currentCode, proposedCode)
}