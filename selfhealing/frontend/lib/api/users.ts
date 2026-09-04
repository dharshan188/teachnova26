import type { AuthUser } from './auth'

export interface ProfileUpdateInput {
  name?: string
  bio?: string
  avatar?: string
}

export interface ProfileResult {
  id: string
  name: string
  username: string
  email?: string
  avatar: string | null
  bio: string | null
  createdAt: string
  projectsCount: number
  postsCount: number
}

export async function getUserProfile(username: string): Promise<ProfileResult | null> {
  const res = await fetch(`/api/users/${encodeURIComponent(username)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Something went wrong.')
  const body = await res.json()
  return body?.user ?? null
}

export async function updateMyProfile(input: ProfileUpdateInput): Promise<AuthUser> {
  const res = await fetch('/api/users/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    let message = 'Something went wrong.'
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {
      // keep generic message
    }
    throw new Error(message)
  }
  const body = await res.json()
  return body?.user ?? ({} as AuthUser)
}
