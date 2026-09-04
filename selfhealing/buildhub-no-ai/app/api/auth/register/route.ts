import { NextResponse } from 'next/server'
import { registerSchema } from '@/lib/validation'
import {
  createSession,
  hashPassword,
  safeUser,
} from '@/lib/server/auth'
import { prisma } from '@/lib/server/db'
import {
  errorResponse,
  firstZodIssue,
  handleApiError,
} from '@/lib/server/response'
import { logger, resolveRequestId } from '@/lib/server/logger'

export async function POST(request: Request) {
  const requestId = resolveRequestId(request)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('Invalid request body.', 400)
  }

  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse(firstZodIssue(parsed.error), 400)
  }

  const { name, username, email, password } = parsed.data
  const normalizedEmail = email.trim().toLowerCase()
  const normalizedUsername = username.toLowerCase()

  try {
    const passwordHash = await hashPassword(password)

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        username: normalizedUsername,
        email: normalizedEmail,
        passwordHash,
      },
    })

    await createSession(user.id)

    await logger.info({
      service: 'auth',
      message: 'User registered',
      route: '/api/auth/register',
      method: 'POST',
      status: 201,
      requestId,
    })

    return NextResponse.json({ user: safeUser(user) }, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}
