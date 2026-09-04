import 'server-only'

import { NextResponse } from 'next/server'
import { isFaultInjectionEnabled, isFaultGaurded, FAULT_REGISTRY, type FaultConfig } from './fault-injection'
import { logger } from './logger'

/**
 * Fault injection wrapper — No-AI demo.
 *
 * LOW-01 fires exactly like the AI-enabled BuildHub:
 *
 *   POST /api/posts  →  500  {"error": "Cannot read property 'id' of undefined"}
 *
 * The failure is a real backend 500 (no fake text), a real log event is
 * persisted, and NO automatic repair is ever attempted. Fault stays active
 * until deactivated via the demo API / demo:reset.
 */
export async function withFaultInjection(
  faultId: string,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  // If fault injection not enabled, run normally
  if (!isFaultInjectionEnabled()) {
    return handler()
  }

  // If fault not active, run normally
  if (!isFaultGaurded(faultId)) {
    return handler()
  }

  const fault = FAULT_REGISTRY[faultId]
  if (!fault) {
    return handler()
  }

  return applyFaultBehavior(fault, handler)
}

async function applyFaultBehavior(fault: FaultConfig, handler: () => Promise<NextResponse>): Promise<NextResponse> {
  const { id } = fault

  // LOW-01: Undefined variable in post creation — real HTTP 500.
  if (id === 'LOW-01') {
    console.error(
      `[fault-injection] LOW-01 active — POST /api/posts returning 500: ${fault.expectedError}`,
    )
    await logger.error({
      service: 'fault-injection',
      message: `POST /api/posts failed: Cannot read property 'id' of undefined (LOW-01 active, no AI configured)`,
      route: '/api/posts',
      method: 'POST',
      status: 500,
      errorCode: 'LOW-01',
    })
    return NextResponse.json({ error: "Cannot read property 'id' of undefined" }, { status: 500 })
  }

  // Default: run normally
  return handler()
}