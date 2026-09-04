import { Skeleton } from '@/components/feedback/skeleton'

export default function Loading() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 py-6" aria-busy="true">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <Skeleton className="h-px w-full" />
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  )
}
