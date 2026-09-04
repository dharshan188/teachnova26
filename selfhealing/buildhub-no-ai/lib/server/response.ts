import 'server-only'

import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import type { ZodError } from 'zod'

export function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

const DEFAULT_SERVER_ERROR = 'Something went wrong. Please try again.'

export function handleApiError(err: unknown) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Unique constraint violation (duplicate email/username).
    if (err.code === 'P2002') {
      const target = uniqueTarget(err)
      const field =
        target.includes('email')
          ? 'email'
          : target.includes('username')
            ? 'username'
            : 'field'
      return errorResponse(
        field === 'username'
          ? 'That username is already taken.'
          : field === 'email'
            ? 'An account with that email already exists.'
            : 'That value is already in use.',
        409,
      )
    }
    // Foreign key constraint violation (referenced record does not exist).
    if (err.code === 'P2003') {
      return errorResponse('Referenced resource does not exist.', 400)
    }
    return errorResponse(DEFAULT_SERVER_ERROR, 500)
  }
  return errorResponse(DEFAULT_SERVER_ERROR, 500)
}

function uniqueTarget(err: Prisma.PrismaClientKnownRequestError): string {
  const target = err.meta?.target
  if (Array.isArray(target)) return String(target[0] ?? '')
  if (typeof target === 'string') return target
  // Driver-adapter errors nest the constraint index under driverAdapterError.
  const driver = err.meta?.driverAdapterError
  if (driver && typeof driver === 'object') {
    const cause = (driver as { cause?: { constraint?: { index?: string } } }).cause
    if (cause?.constraint?.index) return cause.constraint.index
  }
  return String(target ?? 'field')
}

export function firstZodIssue(err: ZodError): string {
  return err.issues[0]?.message ?? 'Invalid input.'
}
