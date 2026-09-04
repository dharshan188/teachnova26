import { NextResponse } from 'next/server'
import { prisma } from '@/lib/server/db'
import { getSessionUser, safeUser } from '@/lib/server/auth'
import { updateProfileSchema } from '@/lib/validation'
import {
  errorResponse,
  firstZodIssue,
  handleApiError,
} from '@/lib/server/response'

export async function PATCH(request: Request) {
  const user = await getSessionUser()
  if (!user) {
    return errorResponse('Not authenticated.', 401)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('Invalid request body.', 400)
  }

  const parsed = updateProfileSchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse(firstZodIssue(parsed.error), 400)
  }

  // The session user determines who is updated — a userId sent by the client
  // is never trusted as proof of ownership.
  const data = parsed.data

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.bio !== undefined ? { bio: data.bio.trim() } : {}),
        ...(data.avatar !== undefined ? { avatar: data.avatar || null } : {}),
      },
    })

    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    return NextResponse.json({ user: safeUser(fresh) })
  } catch (err) {
    return handleApiError(err)
  }
}
