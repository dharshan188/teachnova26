import 'server-only'

import { createHash, randomBytes } from 'node:crypto'
import argon2 from 'argon2'
import { cookies } from 'next/headers'
import { prisma } from './db'
import type { User } from '@prisma/client'

export const SESSION_COOKIE = 'buildhub_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 days

export interface SafeUser {
  id: string
  name: string
  username: string
  email: string
  avatar: string | null
  bio: string | null
  createdAt: string
}

/**
 * Serializes a User record for API responses. Never exposes passwordHash or
 * any secret/session data.
 */
export function safeUser(user: User): SafeUser {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    bio: user.bio,
    createdAt: user.createdAt.toISOString(),
  }
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  })
}

export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password)
  } catch {
    return false
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

async function setSession(token: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  })
}

/** Creates a session row + sets the HttpOnly cookie. */
export async function createSession(
  userId: string,
): Promise<void> {
  const token = generateSessionToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
    },
  })

  await setSession(token)
}

/**
 * Resolves the current user from the session cookie, or null when there is no
 * valid, unexpired session. The stored token is compared against the hashed
 * value persisted in the sessions table.
 */
export async function getSessionUser(): Promise<User | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  })

  if (!session) return null
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } })
    return null
  }

  return session.user
}

/** Deletes the active session row and clears the cookie. */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value

  if (token) {
    await prisma.session.deleteMany({
      where: { tokenHash: hashToken(token) },
    })
  }

  cookieStore.set(SESSION_COOKIE, '', { maxAge: 0, path: '/' })
}
