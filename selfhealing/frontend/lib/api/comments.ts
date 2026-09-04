import type { Comment } from '../types'
import { parseError } from './http'

export async function getComments(postId: string): Promise<Comment[]> {
  const res = await fetch(`/api/posts/${encodeURIComponent(postId)}/comments`)
  if (!res.ok) throw new Error(await parseError(res))
  const body = await res.json()
  return (body?.comments as Comment[]) ?? []
}

export async function createComment(
  postId: string,
  content: string,
): Promise<Comment> {
  const res = await fetch(`/api/posts/${encodeURIComponent(postId)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  const body = await res.json()
  return body?.comment as Comment
}

export async function updateComment(
  id: string,
  content: string,
): Promise<Comment> {
  const res = await fetch(`/api/comments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  const body = await res.json()
  return body?.comment as Comment
}

export async function deleteComment(id: string): Promise<void> {
  const res = await fetch(`/api/comments/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(await parseError(res))
}