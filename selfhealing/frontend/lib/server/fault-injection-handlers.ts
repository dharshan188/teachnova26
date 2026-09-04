import 'server-only'

import { NextResponse } from 'next/server'
import { isFaultInjectionEnabled, isFaultGaurded, isFaultDisarmed, FAULT_REGISTRY } from './fault-injection'

/**
 * Fault injection wrapper for API handlers.
 * 
 * Usage:
 * 
 * export async function POST(request: Request) {
 *   return withFaultInjection('LOW-01', async () => {
 *     // original handler code
 *   })
 * }
 * 
 * The fault injection checks if the fault is active and if so, applies the fault behavior.
 */
export async function withFaultInjection(
  faultId: string,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  // If fault injection not enabled, run normally
  if (!isFaultInjectionEnabled()) {
    return handler()
  }

  // If fault not active (or already repaired/disarmed), run normally
  if (!isFaultGaurded(faultId)) {
    return handler()
  }

  const fault = FAULT_REGISTRY[faultId]
  if (!fault) {
    return handler()
  }

  // Apply fault behavior based on fault type
  return applyFaultBehavior(fault, handler)
}

async function applyFaultBehavior(fault: typeof FAULT_REGISTRY[string], handler: () => Promise<NextResponse>): Promise<NextResponse> {
  const { id } = fault

  // LOW-01: Undefined variable - throw TypeError
  if (id === 'LOW-01') {
    return NextResponse.json({ error: "Cannot read property 'id' of undefined" }, { status: 500 })
  }

  // LOW-02: Field typo - handled in specific handler via applyLow02Typo
  if (id === 'LOW-02') {
    return handler()
  }

  // LOW-03: Incorrect validation - this is in validation.ts, not here
  if (id === 'LOW-03') {
    return handler()
  }

  // MEDIUM-01: Throw error before DB create
  if (id === 'MEDIUM-01') {
    return NextResponse.json({ error: 'Injected DB failure' }, { status: 500 })
  }

  // MEDIUM-02: Throw error before DB query
  if (id === 'MEDIUM-02') {
    return NextResponse.json({ error: 'Injected DB query failure' }, { status: 500 })
  }

  // MEDIUM-03: This is in project PATCH handler
  if (id === 'MEDIUM-03') {
    return handler()
  }

  // HIGH-01: Auth bypass - remove password check
  if (id === 'HIGH-01') {
    return handler()
  }

  // HIGH-02: Authz bypass - skip ownership check
  if (id === 'HIGH-02') {
    return handler()
  }

  // HIGH-03: DB connectivity failure - simulate database unavailable
  if (id === 'HIGH-03') {
    return NextResponse.json(
      { error: 'Database connection failed (HIGH-03 simulated outage)' },
      { status: 503 },
    )
  }

  // Default: run normally
  return handler()
}

/**
 * Check if a specific fault is active and should modify behavior
 * (active AND still guarded — i.e. not repaired/disarmed).
 */
export function isFaultActiveFor(faultId: string): boolean {
  return isFaultGaurded(faultId)
}

/**
 * Get the fault config if active
 */
export function getActiveFaultConfig(faultId: string) {
  if (!isFaultInjectionEnabled()) return null
  const fault = FAULT_REGISTRY[faultId]
  if (!fault || !fault.active || isFaultDisarmed(faultId)) return null
  return fault
}

/**
 * Apply LOW-02 typo transformation to response data
 */
export function applyLow02Typo<T extends Record<string, unknown>>(responseData: T): T {
  if (!isFaultActiveFor('LOW-02')) return responseData
  
  // Transform { post: ... } to { poost: ... }
  const result = { ...responseData }
  if ('post' in result) {
    ;(result as Record<string, unknown>).poost = result.post
    delete result.post
  }
  return result as T
}

/**
 * Apply MEDIUM-03 inverted authz check
 */
export function applyMedium03InvertedAuthz(ownerId: string, userId: string): boolean {
  if (!isFaultActiveFor('MEDIUM-03')) {
    return ownerId !== userId // Normal: deny if not owner
  }
  return ownerId === userId // Fault: deny if owner
}

/**
 * Apply HIGH-01 auth bypass (skip password check)
 */
export function applyHigh01AuthBypass(passwordValid: boolean): boolean {
  if (!isFaultActiveFor('HIGH-01')) {
    return passwordValid // Normal: require valid password
  }
  return true // Fault: always allow
}

/**
 * Apply HIGH-02 authz bypass (skip ownership check)
 */
export function applyHigh02AuthzBypass(ownerId: string, userId: string): boolean {
  if (!isFaultActiveFor('HIGH-02')) {
    return ownerId !== userId // Normal: deny if not owner
  }
  return false // Fault: never deny
}