'use client'

import type { Comment } from '@/lib/types'
import { getComments } from '@/lib/api/comments'
import { useAsync } from '@/lib/hooks'
import { CommentItem } from '@/components/posts/comment-item'
import { CommentForm } from '@/components/posts/comment-form'
import { Skeleton } from '@/components/feedback/skeleton'
import { ErrorState } from '@/components/feedback/error-state'

interface CommentListProps {
  postId: string
  onChanged?: () => void
}

export function CommentList({ postId, onChanged }: CommentListProps) {
  const comments = useAsync<Comment[]>(() => getComments(postId))

  const handleChanged = () => {
    comments.refetch()
    onChanged?.()
  }

  return (
    <section aria-label="Comments">
      <h2 className="mb-3 text-sm font-semibold text-bh-ink">
        Comments
        {!comments.loading && (
          <span className="ml-1.5 rounded-full bg-bh-surface-2 px-2 py-0.5 text-xs font-medium text-bh-muted tabular-nums">
            {(comments.data ?? []).length}
          </span>
        )}
      </h2>

      <div className="mb-5">
        <CommentForm postId={postId} onCreated={handleChanged} />
      </div>

      {comments.loading && comments.data === null && (
        <div className="space-y-3" aria-busy="true">
          <div className="flex items-start gap-3">
            <Skeleton className="h-8.5 w-8.5 rounded-full" />
            <Skeleton className="h-14 flex-1 rounded-lg" />
          </div>
          <div className="flex items-start gap-3">
            <Skeleton className="h-8.5 w-8.5 rounded-full" />
            <Skeleton className="h-14 flex-1 rounded-lg" />
          </div>
        </div>
      )}

      {comments.error && (
        <ErrorState
          title="Couldn't load comments"
          description={comments.error}
          onRetry={comments.refetch}
        />
      )}

      {!comments.error && (comments.data ?? []).length === 0 && !comments.loading && (
        <p className="rounded-lg border border-dashed border-bh-line-strong bg-bh-surface px-4 py-6 text-center text-sm text-bh-muted">
          No comments yet. Be the first to start the discussion.
        </p>
      )}

      {!comments.error && (comments.data ?? []).length > 0 && (
        <ul className="space-y-3">
          {(comments.data ?? []).map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              onUpdated={() => {
                comments.refetch()
              }}
              onDeleted={() => {
                comments.refetch()
                onChanged?.()
              }}
            />
          ))}
        </ul>
      )}
    </section>
  )
}