export interface AuthUser {
  id: string
  name: string
  username: string
  email: string
  avatar: string | null
  bio: string | null
  createdAt: string
}

export interface SignUpInput {
  name: string
  username: string
  email: string
  password: string
  confirmPassword: string
}

export interface SignInInput {
  identifier: string
  password: string
}

async function parseError(res: Response): Promise<string> {
  let message = 'Something went wrong. Please try again.'
  try {
    const body = await res.json()
    if (body?.error && typeof body.error === 'string') message = body.error
  } catch {
    // fall back to generic message when the body is not JSON
  }
  return message
}

export async function signUp(input: SignUpInput): Promise<{ user: AuthUser }> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function signIn(input: SignInInput): Promise<{ user: AuthUser }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' })
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const res = await fetch('/api/auth/me')
  if (res.status === 401) return null
  if (!res.ok) throw new Error(await parseError(res))
  const body = await res.json()
  return body?.user ?? null
}
