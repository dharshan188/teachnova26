import 'server-only'

// BuildHub — No-AI Demo
//
// Minimal controlled fault injection layer.
//
// This layer deliberately contains ONLY the LOW-01 fault shared with the
// AI-enabled BuildHub demo so both projects fail the same way from the same
// user action. There is NO self-healing, NO AI, NO auto-patch, NO rollback:
// once the fault is active it stays active until demo:reset (or server
// restart) deactivates it.
//
// The fault definition mirrors PHASE9_FAULT_TEST_PLAN.md exactly.

export interface FaultConfig {
  id: string
  name: string
  difficulty: 'EASY' | 'MEDIUM' | 'DIFFICULT'
  target: {
    file: string
    line: number
    function: string
  }
  originalCode: string
  faultCode: string
  trigger: {
    method: string
    endpoint: string
  }
  expectedError: string
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  active: boolean
}

// Fault registry — only LOW-01 (the shared comparison fault).
export const FAULT_REGISTRY: Record<string, FaultConfig> = {
  'LOW-01': {
    id: 'LOW-01',
    name: 'Undefined Variable in Post Creation',
    difficulty: 'EASY',
    target: {
      file: 'frontend/app/api/posts/route.ts',
      line: 45,
      function: 'POST handler'
    },
    originalCode: 'const authorId = session.user.id;',
    faultCode: 'const authorId = session.user.undefinedProperty;',
    trigger: { method: 'POST', endpoint: '/api/posts' },
    expectedError: 'TypeError: Cannot read property',
    riskLevel: 'LOW',
    active: false
  }
}

const activeFaults: Set<string> = new Set()

export function isFaultInjectionEnabled(): boolean {
  return process.env.FAULT_INJECTION_ENABLED === 'true'
}

/** True only while the guard is actively firing. */
export function isFaultGaurded(faultId: string): boolean {
  return isFaultInjectionEnabled() && activeFaults.has(faultId)
}

export function getFault(faultId: string): FaultConfig | null {
  return FAULT_REGISTRY[faultId] ?? null
}

export function isFaultActive(faultId: string): boolean {
  return activeFaults.has(faultId)
}

export function activateFault(faultId: string): { ok: boolean; error?: string } {
  if (!isFaultInjectionEnabled()) {
    return { ok: false, error: 'Fault injection not enabled (FAULT_INJECTION_ENABLED=true required)' }
  }
  const fault = FAULT_REGISTRY[faultId]
  if (!fault) {
    return { ok: false, error: `Fault ${faultId} not found` }
  }
  fault.active = true
  activeFaults.add(faultId)
  return { ok: true }
}

export function deactivateFault(faultId: string): { ok: boolean; error?: string } {
  const fault = FAULT_REGISTRY[faultId]
  if (!fault) {
    return { ok: false, error: `Fault ${faultId} not found` }
  }
  fault.active = false
  activeFaults.delete(faultId)
  return { ok: true }
}

export function deactivateAllFaults(): void {
  for (const fault of Object.values(FAULT_REGISTRY)) {
    fault.active = false
  }
  activeFaults.clear()
}

export function getActiveFaults(): FaultConfig[] {
  return Array.from(activeFaults).map(id => FAULT_REGISTRY[id]).filter(Boolean)
}