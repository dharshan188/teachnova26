import { cn } from '@/lib/cn'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-bh-surface-2', className)}
      aria-hidden="true"
    />
  )
}

export function PostCardSkeleton() {
  const lines = ['w-full', 'w-4/5', 'w-3/5']
  return (
    <div className="rounded-xl border border-bh-line bg-bh-surface p-5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-1/4" />
          <Skeleton className="h-3 w-1/6" />
        </div>
      </div>
      <div className="mt-4 space-y-2.5">
        {lines.map((w, i) => (
          <Skeleton key={i} className={`h-3.5 ${w}`} />
        ))}
      </div>
      <div className="mt-5 flex gap-6">
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
      </div>
    </div>
  )
}

export function ProjectCardSkeleton() {
  return (
    <div className="rounded-xl border border-bh-line bg-bh-surface p-5">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="mt-2 h-3.5 w-full" />
      <Skeleton className="mt-1.5 h-3.5 w-5/6" />
      <div className="mt-4 flex items-center justify-between">
        <div className="flex -space-x-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
    </div>
  )
}

export function FeedSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading feed">
      <PostCardSkeleton />
      <PostCardSkeleton />
      <PostCardSkeleton />
    </div>
  )
}

export function ProjectGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading projects">
      <ProjectCardSkeleton />
      <ProjectCardSkeleton />
      <ProjectCardSkeleton />
      <ProjectCardSkeleton />
      <ProjectCardSkeleton />
      <ProjectCardSkeleton />
    </div>
  )
}

export function ProjectDetailSkeleton() {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-bh-line bg-bh-surface p-6">
        <Skeleton className="h-7 w-1/3" />
        <Skeleton className="mt-3 h-4 w-2/3" />
      </div>
      <div className="rounded-xl border border-bh-line bg-bh-surface p-6">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
    </div>
  )
}

export function ProfileSkeleton() {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-bh-line bg-bh-surface p-8">
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <Skeleton className="h-20 w-20 rounded-full" />
          <div className="flex-1 space-y-2 text-center sm:text-left">
            <Skeleton className="mx-auto h-5 w-40 sm:mx-0" />
            <Skeleton className="mx-auto h-3.5 w-24 sm:mx-0" />
          </div>
        </div>
        <div className="mt-6 flex justify-center gap-8 sm:justify-start">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>
      <PostCardSkeleton />
    </div>
  )
}
