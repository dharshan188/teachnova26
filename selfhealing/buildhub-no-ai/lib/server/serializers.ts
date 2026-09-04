'server-only'

import { Prisma } from '@prisma/client'
import type { Comment, Post, Project, User } from '@prisma/client'

/**
 * Safe serializers for posts, projects, and comments. These map database rows
 * to the exact shapes the API + frontend consume, strip any sensitive fields,
 * add session-derived `isMine`, and convert dates to ISO strings so
 * serialization is deterministic. Never expose passwordHash or session data.
 */

export interface AuthorDTO {
  id: string
  name: string
  username: string
}

export interface PostDTO {
  id: string
  content: string
  tags: string[]
  createdAt: string
  updatedAt: string
  isMine: boolean
  likeCount: number
  commentCount: number
  likedByMe: boolean
  author: AuthorDTO
  project: { id: string; name: string; slug: string } | null
}

export interface CommentDTO {
  id: string
  content: string
  createdAt: string
  updatedAt: string
  isMine: boolean
  author: AuthorDTO
}

export interface ProjectDTO {
  id: string
  name: string
  slug: string
  description: string | null
  tags: string[]
  status: Project['status']
  createdAt: string
  updatedAt: string
  isMine: boolean
  postCount: number
  owner: AuthorDTO
}

export type PostWithAuthor = Post & {
  author: User
  project: Project | null
  _count?: { likes: number; comments: number }
  likes?: { userId: string }[]
}

export type ProjectWithOwner = Project & {
  owner: User
  _count?: { posts: number }
  posts?: PostWithAuthor[]
}

export type CommentWithAuthor = Comment & { author: User }

/**
 * Shared include for post queries so every read returns like/comment metadata
 * (and, for authenticated requesters, whether the current user liked it).
 */
export function postInclude(currentUserId?: string | null) {
  return {
    author: true,
    project: true,
    _count: { select: { likes: true, comments: true } },
    ...(currentUserId
      ? { likes: { where: { userId: currentUserId }, select: { userId: true } } }
      : {}),
  } satisfies Prisma.PostInclude
}

function toAuthor(user: Pick<User, 'id' | 'name' | 'username'>): AuthorDTO {
  return { id: user.id, name: user.name, username: user.username }
}

export function serializePost(
  post: PostWithAuthor,
  currentUserId?: string | null,
): PostDTO {
  return {
    id: post.id,
    content: post.content,
    tags: post.tags ?? [],
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    isMine: currentUserId != null && post.authorId === currentUserId,
    likeCount: post._count?.likes ?? 0,
    commentCount: post._count?.comments ?? 0,
    likedByMe: post.likes ? post.likes.length > 0 : false,
    author: toAuthor(post.author),
    project: post.project
      ? { id: post.project.id, name: post.project.name, slug: post.project.slug }
      : null,
  }
}

export function serializeComment(
  comment: CommentWithAuthor,
  currentUserId?: string | null,
): CommentDTO {
  return {
    id: comment.id,
    content: comment.content,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    isMine: currentUserId != null && comment.authorId === currentUserId,
    author: toAuthor(comment.author),
  }
}

export function serializeProjectSummary(
  project: ProjectWithOwner,
  currentUserId?: string | null,
): ProjectDTO {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    description: project.description,
    tags: project.tags ?? [],
    status: project.status,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    isMine: currentUserId != null && project.ownerId === currentUserId,
    postCount: project._count?.posts ?? 0,
    owner: toAuthor(project.owner),
  }
}

export function serializeProjectDetail(
  project: ProjectWithOwner,
  currentUserId?: string | null,
): ProjectDTO & { posts: PostDTO[] } {
  return {
    ...serializeProjectSummary(project, currentUserId),
    posts: (project.posts ?? []).map((p) => serializePost(p, currentUserId)),
  }
}