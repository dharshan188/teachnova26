import { NextResponse } from 'next/server'
import { prisma } from '@/lib/server/db'
import { getSessionUser } from '@/lib/server/auth'
import {
  errorResponse,
  firstZodIssue,
  handleApiError,
} from '@/lib/server/response'
import { postInclude, serializePost } from '@/lib/server/serializers'
import { createPostSchema as createPostSchemaServer } from '@/lib/server/validation'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50

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

  const parsed = createPostSchemaServer.safeParse(body)

  if (!parsed.success) {
    return errorResponse(firstZodIssue(parsed.error), 400)
  }

  try {
    /*
     * ================================================================
     * NO-AI DEMO — INTENTIONAL RUNTIME FAILURE
     * ================================================================
     *
     * Every valid authenticated POST reaches this point and fails.
     *
     * This is intentionally a runtime error rather than a TypeScript
     * error, so VS Code / tsc / lint remain clean.
     *
     * Expected:
     *
     * POST /api/posts
     *        ↓
     * HTTP 500
     *        ↓
     * Post is NOT created
     *
     * The WITH-AI build is NOT changed by this demo fault.
     */

    throw new Error(
      'DEMO_FAULT: POST /api/posts failed — simulated server failure',
    )
  } catch (err) {
    console.error(
      '[api] POST /api/posts failed:',
      err instanceof Error ? err.message : 'unknown error',
    )

    return handleApiError(err)
  }
}

export async function GET(request: Request) {
  const currentUser = await getSessionUser()

  const url = new URL(request.url)

  const author =
    url.searchParams.get('author')?.trim().toLowerCase() || null

  const page = Math.max(
    1,
    parseInt(
      url.searchParams.get('page') ?? '1',
      10,
    ) || 1,
  )

  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(
      1,
      parseInt(
        url.searchParams.get('pageSize') ??
          String(DEFAULT_PAGE_SIZE),
        10,
      ) || DEFAULT_PAGE_SIZE,
    ),
  )

  try {
    const where = author
      ? { author: { username: author } }
      : {}

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include: postInclude(currentUser?.id),
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),

      prisma.post.count({ where }),
    ])

    return NextResponse.json({
      posts: posts.map((post) =>
        serializePost(
          post,
          currentUser?.id,
        ),
      ),

      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(
          1,
          Math.ceil(total / pageSize),
        ),
      },
    })
  } catch (err) {
    console.error(
      '[api] GET /api/posts failed:',
      err instanceof Error ? err.message : 'unknown error',
    )

    return handleApiError(err)
  }
}