'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signUp } from '@/lib/api/auth'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { Icon } from '@/components/ui/icon'

interface FormState {
  name: string
  username: string
  email: string
  password: string
  confirm: string
}

const initial: FormState = {
  name: '',
  username: '',
  email: '',
  password: '',
  confirm: '',
}

type Errors = Partial<Record<keyof FormState, string>>

export default function SignUpPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [form, setForm] = useState<FormState>(initial)
  const [errors, setErrors] = useState<Errors>({})
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [serverError, setServerError] = useState('')

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }))
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const validate = (): boolean => {
    const next: Errors = {}
    if (!form.name.trim()) next.name = 'Please enter your name.'
    if (!form.username.trim()) next.username = 'Please choose a username.'
    else if (!/^[a-z0-9_]{3,20}$/.test(form.username))
      next.username = '3–20 characters: lowercase letters, numbers, underscores.'
    if (!form.email.trim()) next.email = 'Please enter your email.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Enter a valid email address.'
    if (!form.password) next.password = 'Please choose a password.'
    else if (form.password.length < 8) next.password = 'Use at least 8 characters.'
    if (form.confirm !== form.password) next.confirm = 'Passwords do not match.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerError('')
    if (!validate()) return
    setStatus('loading')
    try {
      await signUp({
        name: form.name,
        username: form.username,
        email: form.email,
        password: form.password,
        confirmPassword: form.confirm,
      })
      toast('success', 'Account created', 'Welcome to BuildHub!')
      router.push('/feed')
    } catch (err) {
      setStatus('error')
      setServerError(err instanceof Error ? err.message : 'Could not create your account.')
    }
  }

  return (
    <Card className="p-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-bh-ink">Create your account</h1>
        <p className="mt-1.5 text-sm text-bh-muted">Join a community of builders and collaborators.</p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        <Field
          id="name"
          label="Name"
          placeholder="Maya Chen"
          value={form.name}
          onChange={set('name')}
          error={errors.name}
          autoComplete="name"
        />
        <Field
          id="username"
          label="Username"
          icon="user"
          placeholder="mayac"
          value={form.username}
          onChange={set('username')}
          error={errors.username}
          autoComplete="username"
        />
        <Field
          id="email"
          label="Email"
          icon="mail"
          type="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={set('email')}
          error={errors.email}
          autoComplete="email"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="password"
            label="Password"
            type="password"
            value={form.password}
            onChange={set('password')}
            error={errors.password}
            hint="8+ chars"
            autoComplete="new-password"
          />
          <Field
            id="confirm"
            label="Confirm password"
            type="password"
            value={form.confirm}
            onChange={set('confirm')}
            error={errors.confirm}
            autoComplete="new-password"
          />
        </div>

        {serverError && (
          <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-bh-danger/5 p-3 text-sm text-bh-danger">
            <Icon name="warning" size={16} className="mt-0.5 shrink-0" />
            {serverError}
          </p>
        )}

        <Button type="submit" className="w-full" size="lg" loading={status === 'loading'}>
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-bh-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-bh-accent hover:underline">
          Log in
        </Link>
      </p>
    </Card>
  )
}
