import { NextResponse } from 'next/server'
import { prisma } from '@/lib/server/db'
import { getSessionUser } from '@/lib/server/auth'
import { updateProjectSchema } from '@/lib/validation'
import {
  errorResponse,
  firstZodIssue,
  handleApiError,
} from '@/lib/server/response'
import {
  postInclude,
  serializeProjectDetail,
  serializeProjectSummary,
} from '@/lib/server/serializers'
import {
  currentUniqueSlug,
  isUniqueSlugError,
  slugify,
} from '@/lib/server/slugs'
import { withFaultInjection, applyMedium03InvertedAuthz, applyHigh02AuthzBypass } from '@/lib/server/fault-injection-handlers'

const MAX_SLUG_ATTEMPTS = 5

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const currentUser = await getSessionUser()

  try {
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        owner: true,
        _count: { select: { posts: true } },
        posts: {
          include: postInclude(currentUser?.id),
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    })
    if (!project) {
      return errorResponse('Project not found.', 404)
    }
    return NextResponse.json({
      project: serializeProjectDetail(project, currentUser?.id),
    })
  } catch (err) {
    console.error(
      `[api] GET /api/projects/${id} failed:`,
      err instanceof Error ? err.message : 'unknown error',
    )
    return handleApiError(err)
  }
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return withFaultInjection('MEDIUM-03', async () => {
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

    const parsed = updateProjectSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse(firstZodIssue(parsed.error), 400)
    }

    const data = parsed.data

    try {
      const existing = await prisma.project.findUnique({ where: { id } })
      if (!existing) {
        return errorResponse('Project not found.', 404)
      }
      // MEDIUM-03: Inverted authz check
      if (applyMedium03InvertedAuthz(existing.ownerId, user.id)) {
        return errorResponse('You can only edit your own projects.', 403)
      }

      const rename = data.name !== undefined && data.name !== existing.name
      const base = rename && data.name ? slugify(data.name) : existing.slug

      // The unique-slug check is not atomic, so retry when a concurrent update
      // wins the race and we hit a P2002 violation on the slug column.
      let project
      for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
        const slug = rename ? await currentUniqueSlug(base) : undefined
        try {
          project = await prisma.project.update({
            where: { id },
            data: {
              ...(data.name !== undefined ? { name: data.name } : {}),
              ...(data.description !== undefined
                ? { description: data.description || null }
                : {}),
              ...(data.status !== undefined ? { status: data.status } : {}),
              ...(data.tags !== undefined ? { tags: data.tags } : {}),
              ...(slug !== undefined ? { slug } : {}),
            },
            include: { owner: true, _count: { select: { posts: true } } },
          })
          break
        } catch (err) {
          if (await isUniqueSlugError(err)) continue
          throw err
        }
      }

      if (!project) {
        throw new Error('Could not allocate a unique project slug.')
      }

      return NextResponse.json({ project: serializeProjectSummary(project, user.id) })
    } catch (err) {
      console.error(
        `[api] PATCH /api/projects/${id} failed:`,
        err instanceof Error ? err.message : 'unknown error',
      )
      return handleApiError(err)
    }
  })
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return withFaultInjection('HIGH-02', async () => {
    const user = await getSessionUser()
    if (!user) {
      return errorResponse('Not authenticated.', 401)
    }

    const { id } = await ctx.params

    try {
      const existing = await prisma.project.findUnique({ where: { id } })
      if (!existing) {
        return errorResponse('Project not found.', 404)
      }
      // HIGH-02: Authz bypass
      if (applyHigh02AuthzBypass(existing.ownerId, user.id)) {
        return errorResponse('You can only delete your own projects.', 403)
      }

      await prisma.project.delete({ where: { id } })
      return NextResponse.json({ ok: true })
    } catch (err) {
      console.error(
        `[api] DELETE /api/projects/${id} failed:`,
        err instanceof Error ? err.message : 'unknown error',
      )
      return handleApiError(err)
    }
  })
}