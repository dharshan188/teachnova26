'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from '@/lib/api/auth'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { Icon } from '@/components/ui/icon'

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <Card className="p-8">
          <div className="h-6 w-32 animate-pulse rounded bg-bh-surface-2" />
          <div className="mt-6 h-9 w-full animate-pulse rounded bg-bh-surface-2" />
          <div className="mt-3 h-9 w-full animate-pulse rounded bg-bh-surface-2" />
        </Card>
      }
    >
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({})
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [serverError, setServerError] = useState('')

  const next = searchParams.get('next') ?? ''

  const validate = (): boolean => {
    const nextErr: typeof errors = {}
    if (!identifier.trim()) nextErr.identifier = 'Enter your email or username.'
    if (!password) nextErr.password = 'Enter your password.'
    setErrors(nextErr)
    return Object.keys(nextErr).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerError('')
    if (!validate()) return
    setStatus('loading')
    try {
      await signIn({ identifier, password })
      toast('success', 'Welcome back!', 'You’re now signed in.')
      router.push(next && next.startsWith('/') ? next : '/feed')
    } catch (err) {
      setStatus('error')
      setServerError(err instanceof Error ? err.message : 'Unable to sign in. Please check your credentials and try again.')
    }
  }

  return (
    <Card className="p-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-bh-ink">Welcome back</h1>
        <p className="mt-1.5 text-sm text-bh-muted">Log in to continue building with your team.</p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        <Field
          id="identifier"
          label="Email or username"
          icon="user"
          placeholder="you@example.com"
          value={identifier}
          onChange={(e) => {
            setIdentifier(e.target.value)
            if (errors.identifier) setErrors((prev) => ({ ...prev, identifier: undefined }))
          }}
          error={errors.identifier}
          autoComplete="username"
        />
        <Field
          id="password"
          label="Password"
          icon="lock"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }))
          }}
          error={errors.password}
          autoComplete="current-password"
        />

        <div className="flex items-center justify-between">
          <label className="inline-flex items-center gap-2 text-sm text-bh-muted">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-bh-line-strong accent-bh-accent"
            />
            Remember me
          </label>
          <span className="text-sm text-bh-faint">Demo logins: username <code className="font-mono text-bh-muted">arjun</code> / <code className="font-mono text-bh-muted">buildhub-demo1</code></span>
        </div>

        {serverError && (
          <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-bh-danger/5 p-3 text-sm text-bh-danger">
            <Icon name="warning" size={16} className="mt-0.5 shrink-0" />
            {serverError}
          </p>
        )}

        <Button type="submit" className="w-full" size="lg" loading={status === 'loading'}>
          Log in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-bh-muted">
        New to BuildHub?{' '}
        <Link href="/signup" className="font-medium text-bh-accent hover:underline">
          Create an account
        </Link>
      </p>
    </Card>
  )
}
