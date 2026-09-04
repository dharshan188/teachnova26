import { NextResponse } from 'next/server'
import { prisma } from '@/lib/server/db'
import { signInSchema } from '@/lib/validation'
import {
  createSession,
  safeUser,
  verifyPassword,
} from '@/lib/server/auth'
import { errorResponse, firstZodIssue } from '@/lib/server/response'
import { logger, resolveRequestId } from '@/lib/server/logger'
import { withFaultInjection, applyHigh01AuthBypass } from '@/lib/server/fault-injection-handlers'
import {
  sourceIpFor,
  isSourceBlocked,
  registerAuthFailure,
  recordBlockedRequest,
  isAuthGuardEnabled,
} from '@/lib/server/auth-guard'

const GENERIC_ERROR = 'Unable to sign in. Please check your credentials and try again.'
const BLOCKED_MESSAGE = 'Too many failed sign-in attempts. This source is temporarily blocked.'

export async function POST(request: Request) {
  return withFaultInjection('HIGH-01', async () => {
    const requestId = resolveRequestId(request)
    const sourceIp = sourceIpFor(request)

    if (isAuthGuardEnabled() && isSourceBlocked(sourceIp)) {
      recordBlockedRequest(sourceIp)
      await logger.warn({
        service: 'security',
        message: `Blocked source ${sourceIp} rejected at sign-in (temporary source-IP mitigation active)`,
        route: '/api/auth/login',
        method: 'POST',
        status: 429,
        requestId,
        errorCode: 'IP_BLOCKED',
      })
      return errorResponse(BLOCKED_MESSAGE, 429)
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return errorResponse('Invalid request body.', 400)
    }

    const parsed = signInSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse(firstZodIssue(parsed.error), 400)
    }

    const { identifier, password } = parsed.data
    const identifierLower = identifier.trim().toLowerCase()

    // A single, safe failure path for both "unknown account" and "wrong
    // password" so the response never reveals whether the identifier existed.
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: identifierLower }, { username: identifierLower }],
      },
    })

    // HIGH-01: Auth bypass - skip password verification
    const passwordValid = user ? await verifyPassword(user.passwordHash, password) : false
    if (!user || !passwordValid) {
      await logger.warn({
        service: 'auth',
        message: 'Authentication failed',
        route: '/api/auth/login',
        method: 'POST',
        status: 401,
        requestId,
        errorCode: 'AUTH_FAILED',
      })
      // Source-IP abuse guard: count the failure; escalation (finding +
      // incident + agent pipeline) is handled inside the guard on threshold.
      await registerAuthFailure(sourceIp, requestId)
      return errorResponse(GENERIC_ERROR, 401)
    }

    await createSession(user.id)

    await logger.info({
      service: 'auth',
      message: 'User authenticated',
      route: '/api/auth/login',
      method: 'POST',
      status: 200,
      requestId,
    })

    return NextResponse.json({ user: safeUser(user) })
  })
}
