'use client'

import { useState } from 'react'
import { cn } from '@/lib/cn'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Card } from '@/components/ui/card'
import { Icon, type IconName } from '@/components/ui/icon'
import { useAuth } from '@/components/auth/auth-provider'
import { updateMyProfile } from '@/lib/api/users'
import { useToast } from '@/components/ui/toast'

type SectionId = 'profile' | 'account'

const sections: { id: SectionId; label: string; icon: IconName }[] = [
  { id: 'profile', label: 'Profile', icon: 'user' },
  { id: 'account', label: 'Account', icon: 'settings' },
]

function ProfileSection() {
  const { user, setUser, refresh } = useAuth()
  const { toast } = useToast()
  const [name, setName] = useState(user?.name ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [avatar, setAvatar] = useState(user?.avatar ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const updated = await updateMyProfile({ name, bio, avatar: avatar })
      setUser(updated)
      await refresh()
      toast('success', 'Settings saved', 'Your profile was updated.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold text-bh-ink">Profile</h2>
      <p className="mt-1 text-sm text-bh-muted">This information appears on your public profile.</p>
      {error && (
        <p role="alert" className="mt-4 flex items-start gap-1.5 rounded-lg bg-bh-danger/5 p-3 text-sm text-bh-danger">
          <Icon name="warning" size={16} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
      <div className="mt-6 flex items-center gap-4">
        <Avatar name={name || 'Build'} username={user?.username} src={avatar} size={64} />
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAvatar('')}
          >
            Reset avatar
          </Button>
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field id="set-name" label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Field id="set-username" label="Username" value={user?.username ?? ''} disabled />
        <div className="sm:col-span-2">
          <Field id="set-bio" label="Bio" value={bio} onChange={(e) => setBio(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Field
            id="set-avatar"
            label="Avatar URL (optional)"
            placeholder="https://…"
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-6 flex justify-end border-t border-bh-line pt-4">
        <Button onClick={handleSave} loading={saving}>
          Save changes
        </Button>
      </div>
    </Card>
  )
}

function AccountSection() {
  const { user } = useAuth()
  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold text-bh-ink">Account</h2>
      <p className="mt-1 text-sm text-bh-muted">The email you use to sign in to BuildHub.</p>
      <div className="mt-6 grid gap-4">
        <Field id="set-email" label="Email" type="email" value={user?.email ?? ''} disabled />
        <Field
          id="set-username-login"
          label="Username (login)"
          value={user?.username ?? ''}
          disabled
        />
      </div>
      <p className="mt-4 text-xs text-bh-faint">
        Demo tip: all demo accounts share the password{' '}
        <code className="font-mono">buildhub-demo1</code>.
      </p>
    </Card>
  )
}

export default function SettingsPage() {
  const { status } = useAuth()
  const [active, setActive] = useState<SectionId>('profile')

  if (status === 'loading') {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-semibold text-bh-ink">Settings</h1>
        <p className="mt-1 text-sm text-bh-muted">Loading your settings…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold text-bh-ink">Settings</h1>
      <p className="mt-1 text-sm text-bh-muted">Manage your account and profile.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Settings sections" className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={cn(
                'inline-flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active === s.id
                  ? 'bg-bh-accent-soft text-bh-accent-strong'
                  : 'text-bh-muted hover:bg-bh-surface-2 hover:text-bh-ink',
              )}
            >
              <Icon name={s.icon} size={16} />
              {s.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0">
          {active === 'profile' && <ProfileSection />}
          {active === 'account' && <AccountSection />}
        </div>
      </div>
    </div>
  )
}