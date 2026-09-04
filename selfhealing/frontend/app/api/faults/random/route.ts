import { NextResponse } from 'next/server'
import { randomInt } from 'node:crypto'

import { requireSecurityOperator } from '@/lib/server/security'
import {
  isFaultInjectionEnabled,
  getFaultRegistry,
} from '@/lib/server/fault-injection'
import { errorResponse } from '@/lib/server/response'

// GET /api/faults/random — picks one currently-inactive fault id for the next
// controlled scenario. Uses crypto randomInt (never Math.random). Used by the
// fault runner so a full demo cycle is deterministic in replay but not
// pre-scribed by the harness.
export async function GET() {
  if (!isFaultInjectionEnabled()) {
    return errorResponse('Fault injection not enabled. Set FAULT_INJECTION_ENABLED=true to use.', 400)
  }

  const guard = await requireSecurityOperator()
  if (!guard.ok) return guard.response

  const options = getFaultRegistry().filter((f) => !f.active).map((f) => f.id)
  if (options.length === 0) {
    return errorResponse('All faults are currently active. Deactivate all first.', 409)
  }
  const faultId = options[randomInt(options.length)]
  return NextResponse.json({ ok: true, faultId })
}