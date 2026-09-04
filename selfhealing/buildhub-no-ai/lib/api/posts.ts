import type { Post } from '../types'
import { parseError } from './http'

export interface PostCreateInput {
  content: string
  projectId?: string | null
  tags?: string[]
}

export interface PostUpdateInput {
  content?: string
  projectId?: string | null
  tags?: string[]
}

export interface PaginationResult {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface PostsResult {
  posts: Post[]
  pagination: PaginationResult
}

export async function getPosts(params?: {
  page?: number
  pageSize?: number
  author?: string
}): Promise<PostsResult> {
  const qs = new URLSearchParams()
  if (params?.page != null) qs.set('page', String(params.page))
  if (params?.pageSize != null) qs.set('pageSize', String(params.pageSize))
  if (params?.author) qs.set('author', params.author)
  const query = qs.size ? `?${qs.toString()}` : ''
  const res = await fetch(`/api/posts${query}`)
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function getPost(id: string): Promise<Post | null> {
  const res = await fetch(`/api/posts/${encodeURIComponent(id)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(await parseError(res))
  const body = await res.json()
  return body?.post ?? null
}

export async function createPost(input: PostCreateInput): Promise<Post> {
  const res = await fetch('/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(await parseError(res))
  const body = await res.json()
  return body?.post as Post
}

export async function updatePost(id: string, input: PostUpdateInput): Promise<Post> {
  const res = await fetch(`/api/posts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(await parseError(res))
  const body = await res.json()
  return body?.post as Post
}

export async function deletePost(id: string): Promise<void> {
  const res = await fetch(`/api/posts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(await parseError(res))
}

export interface LikeState {
  likeCount: number
  likedByMe: boolean
}

export async function likePost(id: string): Promise<LikeState> {
  const res = await fetch(`/api/posts/${encodeURIComponent(id)}/like`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function unlikePost(id: string): Promise<LikeState> {
  const res = await fetch(`/api/posts/${encodeURIComponent(id)}/like`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}