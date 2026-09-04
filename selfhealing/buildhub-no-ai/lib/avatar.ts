import type { AvatarUser } from './types'

const PALETTE = [
  '#c2410c', // flame
  '#2563eb', // blue
  '#16a34a', // green
  '#7c3aed', // violet
  '#db2777', // pink
  '#0d9488', // teal
  '#ca8a04', // amber
  '#dc2626', // red
  '#4f46e5', // indigo
  '#059669', // emerald
]

export function initials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function avatarColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i)
    hash |= 0
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

export function toAvatarUser(u: {
  id: string
  name: string
  username: string
}): AvatarUser {
  return { id: u.id, name: u.name, username: u.username, avatarUrl: u.username }
}
