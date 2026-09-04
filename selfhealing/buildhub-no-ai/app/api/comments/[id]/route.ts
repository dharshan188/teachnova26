import { NextResponse } from 'next/server'
import { prisma } from '@/lib/server/db'
import { getSessionUser } from '@/lib/server/auth'
import { updateCommentSchema } from '@/lib/validation'
import {
  errorResponse,
  firstZodIssue,
  handleApiError,
} from '@/lib/server/response'
import { serializeComment } from '@/lib/server/serializers'

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return errorResponse('Not authenticated.', 401)
  }

  const { id } = await ctx.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('Invalid request body.', 400)
  }

  const parsed = updateCommentSchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse(firstZodIssue(parsed.error), 400)
  }

  try {
    const existing = await prisma.comment.findUnique({ where: { id } })
    if (!existing) {
      return errorResponse('Comment not found.', 404)
    }
    if (existing.authorId !== user.id) {
      return errorResponse('You can only edit your own comments.', 403)
    }

    const comment = await prisma.comment.update({
      where: { id },
      data: { content: parsed.data.content },
      include: { author: true },
    })

    return NextResponse.json({ comment: serializeComment(comment, user.id) })
  } catch (err) {
    console.error(
      `[api] PATCH /api/comments/${id} failed:`,
      err instanceof Error ? err.message : 'unknown error',
    )
    return handleApiError(err)
  }
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return errorResponse('Not authenticated.', 401)
  }

  const { id } = await ctx.params

  try {
    const existing = await prisma.comment.findUnique({ where: { id } })
    if (!existing) {
      return errorResponse('Comment not found.', 404)
    }
    if (existing.authorId !== user.id) {
      return errorResponse('You can only delete your own comments.', 403)
    }

    await prisma.comment.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(
      `[api] DELETE /api/comments/${id} failed:`,
      err instanceof Error ? err.message : 'unknown error',
    )
    return handleApiError(err)
  }
}