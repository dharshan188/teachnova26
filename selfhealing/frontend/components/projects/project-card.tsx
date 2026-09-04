'use client'

import { useRef } from 'react'
import Link from 'next/link'
import type { ProjectSummary } from '@/lib/types'
import { cn } from '@/lib/cn'
import { timeAgo } from '@/lib/format'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'

export const projectStatusMeta: Record<
  ProjectSummary['status'],
  { label: string; tone: 'success' | 'warning' | 'info' | 'neutral' }
> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  COMPLETED: { label: 'Completed', tone: 'neutral' },
  ARCHIVED: { label: 'Archived', tone: 'warning' },
}

// Subtle 3D tilt driven by pointer position. Disabled on touch and on
// prefers-reduced-motion. Updates the transform imperatively so moving the
// pointer never triggers a React re-render — it stays fast.
export function ProjectCard({ project }: { project: ProjectSummary }) {
  const status = projectStatusMeta[project.status]
  const cardRef = useRef<HTMLDivElement>(null)

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = cardRef.current
    if (!el) return
    if (e.pointerType !== 'mouse') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    // ~1.2deg each way — a hint of depth, not a gimmick.
    el.style.transform = `perspective(900px) rotateX(${-py * 2.4}deg) rotateY(${px * 2.4}deg) translateY(-2px)`
  }

  const onPointerLeave = () => {
    if (cardRef.current) cardRef.current.style.transform = ''
  }

  return (
    <Link href={`/projects/${project.id}`} className="group block h-full">
      <Card
        ref={cardRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        className={cn(
          'flex h-full flex-col p-5 transition-[box-shadow,border-color,transform] duration-200 will-change-transform',
          'group-hover:-translate-y-0.5 group-hover:border-bh-line-strong group-hover:shadow-md',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-bh-accent-soft text-bh-accent">
              <Icon name="folder" size={18} />
            </span>
            <div>
              <h3 className="text-[15px] font-semibold text-bh-ink group-hover:text-bh-accent">
                {project.name}
              </h3>
              <p className="text-xs text-bh-faint">
                by @{project.owner.username} · {timeAgo(project.createdAt)}
              </p>
            </div>
          </div>
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
        </div>

        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-bh-muted">
          {project.description || 'No description yet.'}
        </p>

        {project.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {project.tags.slice(0, 4).map((tag) => (
              <Badge key={tag} tone="accent" className="font-mono">
                #{tag}
              </Badge>
            ))}
            {project.tags.length > 4 && (
              <span className="inline-flex items-center px-1 text-xs text-bh-faint">
                +{project.tags.length - 4}
              </span>
            )}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between pt-4">
          <span className="inline-flex items-center gap-1.5 text-xs text-bh-faint">
            <Icon name="document" size={14} />
            {project.postCount} {project.postCount === 1 ? 'post' : 'posts'}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-bh-accent">
            View project
            <Icon name="arrowRight" size={14} />
          </span>
        </div>
      </Card>
    </Link>
  )
}