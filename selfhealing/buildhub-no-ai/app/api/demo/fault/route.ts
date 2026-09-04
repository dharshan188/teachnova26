import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser } from '@/lib/server/auth'
import { prisma } from '@/lib/server/db'
import { errorResponse } from '@/lib/server/response'
import {
  activateFault,
  deactivateFault,
  getFault,
  isFaultActive,
  isFaultInjectionEnabled,
} from '@/lib/server/fault-injection'
import { logger, resolveRequestId } from '@/lib/server/logger'

// BuildHub — No-AI Demo
//
// Local demo-only fault control. Exposes ONLY the shared LOW-01 controlled
// fault (the same fault the AI-enabled BuildHub repairs). There is no AI, no
// incident pipeline, no auto-remediation: 'activate' turns the runtime guard
// on and it stays on until 'deactivate'/'reset'. 'reset' also clears the demo
// log entries so demo:reset restores the clean starting state.

const FAULT_ID = 'LOW-01'

function faultState() {
  const fault = getFault(FAULT_ID)
  return {
    enabled: isFaultInjectionEnabled(),
    faultId: FAULT_ID,
    active: isFaultActive(FAULT_ID),
    unresolved: isFaultActive(FAULT_ID),
    fault: fault
      ? {
          id: fault.id,
          name: fault.name,
          difficulty: fault.difficulty,
          file: fault.target.file,
          line: fault.target.line,
          function: fault.target.function,
          originalCode: fault.originalCode,
          faultCode: fault.faultCode,
          triggerMethod: fault.trigger.method,
          triggerEndpoint: fault.trigger.endpoint,
          expectedError: fault.expectedError,
          riskLevel: fault.riskLevel,
        }
      : null,
  }
}

const actionSchema = z.object({
  action: z.enum(['activate', 'deactivate', 'reset']),
})

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return errorResponse('Not authenticated.', 401)
  }
  return NextResponse.json(faultState())
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) {
    return errorResponse('Not authenticated.', 401)
  }

  const requestId = resolveRequestId(request)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('Invalid request body.', 400)
  }

  const parsed = actionSchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse('Invalid action. Expected activate, deactivate or reset.', 400)
  }

  const { action } = parsed.data

  if (action === 'activate') {
    const result = activateFault(FAULT_ID)
    if (!result.ok) {
      return errorResponse(result.error ?? 'Could not activate fault.', 409)
    }
    await logger.warn({
      service: 'demo',
      message: `LOW-01 fault activated — the application is now broken and will stay broken (no AI configured)`,
      route: '/api/demo/fault',
      method: 'POST',
      status: 200,
      requestId,
      errorCode: 'LOW-01',
    })
  } else if (action === 'deactivate') {
    deactivateFault(FAULT_ID)
    await logger.info({
      service: 'demo',
      message: 'LOW-01 fault deactivated — application healthy again',
      route: '/api/demo/fault',
      method: 'POST',
      status: 200,
      requestId,
      errorCode: 'LOW-01',
    })
  } else {
    // reset: deactivate + clear the demo log trail (demo-only DB safety)
    deactivateFault(FAULT_ID)
    try {
      const cleared = await prisma.logEvent.deleteMany({
        where: {
          OR: [{ service: 'fault-injection' }, { service: 'demo' }, { route: '/api/posts' }],
        },
      })
      console.log(`[demo] demo:reset cleared ${cleared.count} log events`)
    } catch (err) {
      console.error(
        '[demo] clear log events failed:',
        err instanceof Error ? err.message : 'unknown error',
      )
    }
  }

  return NextResponse.json(faultState())
}