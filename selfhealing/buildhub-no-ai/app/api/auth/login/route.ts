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
import {
  availabilityPhase,
  registerAuthFailure,
} from '@/lib/server/demo-availability'

const GENERIC_ERROR = 'Unable to sign in. Please check your credentials and try again.'
const UNAVAILABLE_MESSAGE =
  'Service temporarily unavailable (without-AI build: safe degradation threshold reached, no auto-mitigation).'

export async function POST(request: Request) {
  const requestId = resolveRequestId(request)

  // Without-AI degradation latch: past the safe threshold the service refuses
  // to serve (like an app that exhausted its backend with no supervisor).
  if ((await availabilityPhase()) === 'unavailable') {
    return errorResponse(UNAVAILABLE_MESSAGE, 503)
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
    // Availability counter (WITHOUT-AI): failures are counted, never rejected.
    await registerAuthFailure(requestId)
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
}
