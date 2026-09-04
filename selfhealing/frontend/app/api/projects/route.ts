import { NextResponse } from 'next/server'
import { prisma } from '@/lib/server/db'
import { getSessionUser } from '@/lib/server/auth'
import { createProjectSchema } from '@/lib/validation'
import {
  errorResponse,
  firstZodIssue,
  handleApiError,
} from '@/lib/server/response'
import {
  serializeProjectSummary,
} from '@/lib/server/serializers'
import {
  currentUniqueSlug,
  isUniqueSlugError,
  slugify,
} from '@/lib/server/slugs'

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100
const MAX_SLUG_ATTEMPTS = 5

async function createProjectForUser(
  ownerId: string,
  data: {
    name: string
    description?: string
    status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED'
    tags?: string[]
  },
) {
  const base = slugify(data.name)
  // The unique-slug check is not atomic, so retry when a concurrent create
  // wins the race and we hit a P2002 violation on the slug column.
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = await currentUniqueSlug(base)
    try {
      return await prisma.project.create({
        data: {
          name: data.name,
          slug,
          ...(data.description !== undefined
            ? { description: data.description || null }
            : {}),
          ...(data.tags !== undefined ? { tags: data.tags } : {}),
          status: data.status,
          ownerId,
        },
        include: { owner: true, _count: { select: { posts: true } } },
      })
    } catch (err) {
      if (await isUniqueSlugError(err)) continue
      throw err
    }
  }
  throw new Error('Could not allocate a unique project slug.')
}

export async function POST(request: Request) {
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

  const parsed = createProjectSchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse(firstZodIssue(parsed.error), 400)
  }

  try {
    const project = await createProjectForUser(user.id, parsed.data)
    return NextResponse.json(
      { project: serializeProjectSummary(project, user.id) },
      { status: 201 },
    )
  } catch (err) {
    console.error(
      '[api] POST /api/projects failed:',
      err instanceof Error ? err.message : 'unknown error',
    )
    return handleApiError(err)
  }
}

export async function GET(request: Request) {
  const currentUser = await getSessionUser()
  const url = new URL(request.url)
  const mineOnly = url.searchParams.get('mine') === '1'
  const owner = url.searchParams.get('owner')?.trim().toLowerCase() || null
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(url.searchParams.get('pageSize') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE),
  )

  try {
    // "mine" requires a session; guests simply have no projects of their own.
    if (mineOnly && !currentUser) {
      return NextResponse.json({
        projects: [],
        pagination: { page: 1, pageSize, total: 0, totalPages: 0 },
      })
    }

    const where = mineOnly && currentUser
      ? { ownerId: currentUser.id }
      : owner
        ? { owner: { username: owner } }
        : {}

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        include: { owner: true, _count: { select: { posts: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.project.count({ where }),
    ])

    return NextResponse.json({
      projects: projects.map((p) =>
        serializeProjectSummary(p, currentUser?.id),
      ),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    })
  } catch (err) {
    console.error(
      '[api] GET /api/projects failed:',
      err instanceof Error ? err.message : 'unknown error',
    )
    return handleApiError(err)
  }
}