import { NextResponse } from 'next/server'
import { prisma } from '@/lib/server/db'
import { getSessionUser } from '@/lib/server/auth'
import { errorResponse } from '@/lib/server/response'

interface PublicProfile {
  id: string
  name: string
  username: string
  avatar: string | null
  bio: string | null
  createdAt: string
  projectsCount: number
  postsCount: number
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ username: string }> },
) {
  const { username } = await ctx.params
  const currentUser = await getSessionUser()

  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    include: {
      _count: { select: { projects: true, posts: true } },
    },
  })

  if (!user) {
    return errorResponse('Profile not found.', 404)
  }

  const profile: PublicProfile = {
    id: user.id,
    name: user.name,
    username: user.username,
    avatar: user.avatar,
    bio: user.bio,
    createdAt: user.createdAt.toISOString(),
    projectsCount: user._count.projects,
    postsCount: user._count.posts,
  }

  // Only expose the email to the profile owner (or other authenticated logic
  // in later phases). Never expose passwordHash or session data.
  const isOwner = currentUser?.id === user.id
  const body: PublicProfile & { email?: string } = { ...profile }
  if (isOwner) body.email = user.email

  return NextResponse.json({ user: body })
}
