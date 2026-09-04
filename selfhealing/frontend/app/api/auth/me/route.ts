import { NextResponse } from 'next/server'
import { getSessionUser, safeUser } from '@/lib/server/auth'
import { errorResponse } from '@/lib/server/response'

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return errorResponse('Not authenticated.', 401)
  }
  return NextResponse.json({ user: safeUser(user) })
}
