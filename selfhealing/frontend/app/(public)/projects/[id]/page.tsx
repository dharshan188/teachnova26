'use client'

import { use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getProject } from '@/lib/api/projects'
import { useAsync } from '@/lib/hooks'
import { timeAgo, relativeDays } from '@/lib/format'
import type { Project } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { PostCard } from '@/components/posts/post-card'
import { ProjectMenu } from '@/components/projects/project-actions'
import { projectStatusMeta } from '@/components/projects/project-card'
import { ProjectDetailSkeleton } from '@/components/feedback/skeleton'
import { ErrorState } from '@/components/feedback/error-state'
import { EmptyState } from '@/components/feedback/empty-state'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function ProjectDetailsPage({ params }: PageProps) {
  const { id } = use(params)
  // Keying by id remounts the view per project so its data refetches on
  // client-side navigation between project detail pages.
  return <ProjectDetailsView key={id} projectId={id} />
}

function ProjectDetailsView({ projectId }: { projectId: string }) {
  const router = useRouter()
  const project = useAsync<Project | null>(() => getProject(projectId))

  if (project.loading && project.data === null) return <ProjectDetailSkeleton />

  if (project.error || !project.data) {
    return (
      <ErrorState
        title="Project not found"
        description={project.error ?? 'This project is unavailable.'}
        onRetry={() => (project.error ? project.refetch() : router.push('/projects'))}
      />
    )
  }

  const p = project.data
  const status = projectStatusMeta[p.status]

  const handleUpdated = () => project.refetch()

  const handleDeleted = () => {
    router.push('/projects')
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <button
        onClick={() => router.push('/projects')}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-bh-muted hover:text-bh-ink"
      >
        <Icon name="arrowLeft" size={16} />
        All projects
      </button>

      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-bh-accent-soft text-bh-accent">
              <Icon name="folder" size={28} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold text-bh-ink">{p.name}</h1>
                <Badge tone={status.tone} dot>
                  {status.label}
                </Badge>
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-bh-faint">
                <Link
                  href={`/profile/${p.owner.username}`}
                  className="inline-flex items-center gap-1.5 hover:text-bh-accent"
                >
                  <Icon name="user" size={14} /> Owner @{p.owner.username}
                </Link>
                <span>Created {relativeDays(p.createdAt)}</span>
                <span>Updated {timeAgo(p.updatedAt)}</span>
                <span>
                  {p.postCount} {p.postCount === 1 ? 'post' : 'posts'}
                </span>
              </p>
            </div>
          </div>
          <ProjectMenu
            project={p}
            onUpdated={handleUpdated}
            onDeleted={handleDeleted}
          />
        </div>

        <div className="mt-5 border-t border-bh-line pt-4">
          <h2 className="mb-2 text-sm font-semibold text-bh-ink">About</h2>
          <p className="text-sm leading-relaxed text-bh-muted">
            {p.description || 'No description yet.'}
          </p>
          {p.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {p.tags.map((tag) => (
                <Badge key={tag} tone="accent" className="font-mono">
                  #{tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-bh-ink">Posts</h2>
          <Button size="sm" variant="secondary" icon="plus" onClick={() => router.push('/feed')}>
            Write a post
          </Button>
        </div>
        {p.posts.length > 0 ? (
          <div className="space-y-4">
            {p.posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onUpdated={() => project.refetch()}
                onDeleted={() => project.refetch()}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="folder"
            title="No posts yet"
            description="Share a post linked to this project to keep the conversation alive."
            actionLabel="Write a post"
            onAction={() => router.push('/feed')}
          />
        )}
      </div>
    </div>
  )
}