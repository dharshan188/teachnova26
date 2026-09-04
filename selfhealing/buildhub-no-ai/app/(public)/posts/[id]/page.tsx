'use client'

import { use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getPost } from '@/lib/api/posts'
import { useAsync } from '@/lib/hooks'
import { timeAgo } from '@/lib/format'
import type { Post } from '@/lib/types'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { PostMenu } from '@/components/posts/post-actions'
import { LikeButton } from '@/components/posts/like-button'
import { CommentList } from '@/components/posts/comment-list'
import { ErrorState } from '@/components/feedback/error-state'
import { PostCardSkeleton } from '@/components/feedback/skeleton'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function PostDetailsPage({ params }: PageProps) {
  const { id } = use(params)
  // Keying by id remounts the view per post so its data refetches on
  // client-side navigation between post details pages.
  return <PostDetailsView key={id} postId={id} />
}

function PostDetailsView({ postId }: { postId: string }) {
  const router = useRouter()
  const post = useAsync<Post | null>(() => getPost(postId))

  if (post.loading && post.data === null) {
    return (
      <div className="space-y-5">
        <PostCardSkeleton />
      </div>
    )
  }

  if (post.error || !post.data) {
    return (
      <ErrorState
        title="Post not found"
        description={post.error ?? 'This post may have been removed.'}
        onRetry={() => {
          if (post.error) post.refetch()
          else router.push('/feed')
        }}
      />
    )
  }

  const p = post.data

  const handleDeleted = () => {
    router.push('/feed')
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-bh-muted hover:text-bh-ink"
      >
        <Icon name="arrowLeft" size={16} />
        Back
      </button>

      <Card className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Link href={`/profile/${p.author.username}`}>
              <Avatar name={p.author.name} username={p.author.username} size={44} />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2">
                <Link
                  href={`/profile/${p.author.username}`}
                  className="text-sm font-semibold text-bh-ink hover:text-bh-accent"
                >
                  {p.author.name}
                </Link>
                <span className="text-sm text-bh-faint">@{p.author.username}</span>
                <span className="text-bh-faint">·</span>
                <time className="text-xs text-bh-faint">{timeAgo(p.createdAt)}</time>
              </div>
              {p.project && (
                <Link
                  href={`/projects/${p.project.id}`}
                  className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-bh-accent hover:underline"
                >
                  <Icon name="launch" size={13} />
                  {p.project.name}
                </Link>
              )}
            </div>
          </div>
          <PostMenu post={p} onUpdated={post.refetch} onDeleted={handleDeleted} />
        </div>

        <p className="mt-4 whitespace-pre-wrap text-[16px] leading-relaxed text-bh-ink">
          {p.content}
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

        <div className="mt-4 flex items-center gap-1 border-t border-bh-line pt-3">
          <LikeButton
            postId={p.id}
            liked={p.likedByMe}
            count={p.likeCount}
            onChange={post.refetch}
          />
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm tabular-nums text-bh-faint">
            <Icon name="comment" size={16} />
            {p.commentCount}
          </span>
        </div>
      </Card>

      <Card className="p-6">
        <CommentList postId={p.id} onChanged={post.refetch} />
      </Card>
    </div>
  )
}