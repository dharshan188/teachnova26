import { NextResponse } from 'next/server'
import { prisma } from '@/lib/server/db'
import { getSessionUser } from '@/lib/server/auth'
import { errorResponse, handleApiError } from '@/lib/server/response'

async function requirePost(id: string) {
  const existing = await prisma.post.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!existing) {
    return null
  }
  return existing
}

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return errorResponse('Not authenticated.', 401)
  }

  const { id } = await ctx.params

  try {
    const post = await requirePost(id)
    if (!post) {
      return errorResponse('Post not found.', 404)
    }

    // Upsert keeps duplicate likes idempotent: a second like is a no-op
    // rather than a duplicate row (the DB uniqu constraint is the backstop).
    await prisma.like.upsert({
      where: {
        userId_postId: { userId: user.id, postId: id },
      },
      create: { userId: user.id, postId: id },
      update: {},
    })

    const likeCount = await prisma.like.count({ where: { postId: id } })
    return NextResponse.json({ likeCount, likedByMe: true })
  } catch (err) {
    console.error(
      `[api] POST /api/posts/${id}/like failed:`,
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
    const post = await requirePost(id)
    if (!post) {
      return errorResponse('Post not found.', 404)
    }

    await prisma.like.deleteMany({
      where: { postId: id, userId: user.id },
    })

    const likeCount = await prisma.like.count({ where: { postId: id } })
    return NextResponse.json({ likeCount, likedByMe: false })
  } catch (err) {
    console.error(
      `[api] DELETE /api/posts/${id}/like failed:`,
      err instanceof Error ? err.message : 'unknown error',
    )
    return handleApiError(err)
  }
}