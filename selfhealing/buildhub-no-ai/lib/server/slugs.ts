'server-only'

import { prisma } from './db'
import { Prisma } from '@prisma/client'

/**
 * Slug helpers for projects. Slugs are derived from the project name so URLs
 * are human-readable ("/projects/query-raft"). Collisions get a numeric suffix
 * ("query-raft-2"). Because the check-then-create is not atomic, callers retry
 * when Prisma reports a unique (P2002) violation on the slug column.
 */

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/[\s-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'project'
  )
}

/** Returns the base slug, or base-2, base-3, … for the first unused value. */
export async function currentUniqueSlug(base: string): Promise<string> {
  let candidate = base
  let n = 2
  while (
    await prisma.project.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })
  ) {
    candidate = `${base}-${n++}`
  }
  return candidate
}

export async function isUniqueSlugError(err: unknown): Promise<boolean> {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002'
  )
}