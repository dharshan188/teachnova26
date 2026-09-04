'use client'

import { use, useState } from 'react'
import { getUserProfile, updateMyProfile } from '@/lib/api/users'
import { getPosts } from '@/lib/api/posts'
import { getProjects } from '@/lib/api/projects'
import { useAsync } from '@/lib/hooks'
import { fullDate } from '@/lib/format'
import { useAuth } from '@/components/auth/auth-provider'
import { Avatar } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Field } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { Tabs, TabList, Tab, TabPanel } from '@/components/ui/tabs'
import { ProfileSkeleton, FeedSkeleton, ProjectGridSkeleton } from '@/components/feedback/skeleton'
import { ErrorState } from '@/components/feedback/error-state'
import { EmptyState } from '@/components/feedback/empty-state'
import { PostCard } from '@/components/posts/post-card'
import { ProjectCard } from '@/components/projects/project-card'
import { useToast } from '@/components/ui/toast'

interface PageProps {
  params: Promise<{ username: string }>
}

export default function ProfilePage({ params }: PageProps) {
  const { username } = use(params)
  return <ProfileView key={username} username={username} />
}

function ProfileView({ username }: { username: string }) {
  const { toast } = useToast()
  const { user: currentUser, setUser, refresh } = useAuth()
  const [editOpen, setEditOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [avatar, setAvatar] = useState('')

  const profile = useAsync(() => getUserProfile(username))
  const posts = useAsync(() => getPosts({ author: username, pageSize: 30 }))
  const projects = useAsync(() => getProjects({ owner: username, pageSize: 30 }))

  if (profile.loading) return <ProfileSkeleton />

  if (profile.error || !profile.data) {
    return (
      <ErrorState
        title="Profile not found"
        description={profile.error ?? 'This developer profile is unavailable.'}
        onRetry={profile.refetch}
      />
    )
  }

  const u = profile.data
  const isOwner = currentUser?.id === u.id

  const openEdit = () => {
    setName(u.name)
    setBio(u.bio ?? '')
    setAvatar(u.avatar ?? '')
    setFormError('')
    setEditOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setFormError('')
    try {
      const updated = await updateMyProfile({
        ...(name !== undefined ? { name } : {}),
        ...(bio !== undefined ? { bio } : {}),
        ...(avatar !== undefined ? { avatar } : {}),
      })
      setUser(updated)
      await refresh()
      setEditOpen(false)
      profile.refetch()
      toast('success', 'Profile updated', 'Your changes have been saved.')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card className="overflow-hidden">
        <div className="h-24 bg-bh-grid-bg" />
        <div className="p-6">
          <div className="-mt-16 flex flex-col items-start gap-4 sm:flex-row sm:items-end">
            <Avatar
              name={u.name}
              username={u.username}
              src={u.avatar}
              size={88}
              className="ring-4 ring-bh-surface"
            />
            <div className="flex-1">
              <h1 className="text-2xl font-semibold text-bh-ink">{u.name}</h1>
              <p className="text-sm text-bh-muted">@{u.username}</p>
            </div>
            {isOwner && (
              <Button
                variant="outline"
                size="sm"
                icon="user"
                onClick={openEdit}
                className="self-start sm:self-end"
              >
                Edit profile
              </Button>
            )}
          </div>

          <p className="mt-4 text-sm leading-relaxed text-bh-muted">
            {u.bio || 'This developer hasn’t added a bio yet.'}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-bh-muted">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="user" size={15} className="text-bh-faint" />
              Joined {fullDate(u.createdAt)}
            </span>
          </div>

          <div className="mt-6 flex gap-8 border-t border-bh-line pt-4">
            {[
              { label: 'Projects', value: u.projectsCount },
              { label: 'Posts', value: u.postsCount },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-lg font-semibold text-bh-ink">{s.value}</p>
                <p className="text-xs text-bh-faint">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Tabs defaultValue="posts">
        <TabList aria-label="Profile sections">
          <Tab id="posts">Posts</Tab>
          <Tab id="projects">Projects</Tab>
        </TabList>

        <TabPanel id="posts">
          {posts.loading && <FeedSkeleton />}
          {posts.error && (
            <ErrorState title="Couldn’t load posts" description={posts.error} onRetry={posts.refetch} />
          )}
          {posts.data && posts.data.posts.length === 0 && (
            <EmptyState
              icon="document"
              title="No posts yet"
              description="This developer hasn’t shared any posts yet."
            />
          )}
          {posts.data && posts.data.posts.length > 0 && (
            <div className="space-y-4">
              {posts.data.posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </TabPanel>

        <TabPanel id="projects">
          {projects.loading && <ProjectGridSkeleton />}
          {projects.error && (
            <ErrorState title="Couldn’t load projects" description={projects.error} onRetry={projects.refetch} />
          )}
          {projects.data && projects.data.projects.length === 0 && (
            <EmptyState
              icon="folder"
              title="No projects"
              description="This developer hasn’t published any projects yet."
            />
          )}
          {projects.data && projects.data.projects.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {projects.data.projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </TabPanel>
      </Tabs>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit profile"
        description="Update your public profile information."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving}>
              Save changes
            </Button>
          </>
        }
      >
        {formError && (
          <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-bh-danger/5 p-3 text-sm text-bh-danger">
            <Icon name="warning" size={16} className="mt-0.5 shrink-0" />
            {formError}
          </p>
        )}
        <div className="space-y-4">
          <Field id="edit-name" label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Field id="edit-bio" label="Bio" value={bio} onChange={(e) => setBio(e.target.value)} hint={`${bio.length}/160`} />
          <Field
            id="edit-avatar"
            label="Avatar URL (optional)"
            placeholder="https://…"
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  )
}