'use client'

import Link from 'next/link'
import type { Post } from '@/lib/types'
import { timeAgo } from '@/lib/format'
import { Avatar } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'
import { PostMenu } from '@/components/posts/post-actions'
import { LikeButton } from '@/components/posts/like-button'

interface PostCardProps {
  post: Post
  onUpdated?: (post: Post) => void
  onDeleted?: (id: string) => void
}

export function PostCard({ post, onUpdated, onDeleted }: PostCardProps) {
  return (
    <Card className="p-5 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-bh-line-strong hover:shadow-md">
      <div className="flex items-start gap-3">
        <Link href={`/profile/${post.author.username}`}>
          <Avatar name={post.author.name} username={post.author.username} size={40} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <Link
                href={`/profile/${post.author.username}`}
                className="text-sm font-semibold text-bh-ink hover:text-bh-accent"
              >
                {post.author.name}
              </Link>
              <span className="text-sm text-bh-faint">@{post.author.username}</span>
              <span className="text-bh-faint">·</span>
              <time className="text-xs text-bh-faint">{timeAgo(post.createdAt)}</time>
            </div>
            <PostMenu post={post} onUpdated={onUpdated} onDeleted={onDeleted} />
          </div>

          {post.project && (
            <Link
              href={`/projects/${post.project.id}`}
              className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-bh-accent hover:underline"
            >
              <Icon name="launch" size={13} />
              {post.project.name}
            </Link>
          )}

          <p className="mt-2.5 whitespace-pre-wrap text-[15px] leading-relaxed text-bh-ink">
            {post.content}
          </p>

          {post.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {post.tags.map((tag) => (
                <Badge key={tag} tone="accent" className="font-mono">
                  #{tag}
                </Badge>
              ))}
            </div>
          )}

          <footer className="mt-4 flex items-center gap-1 border-t border-bh-line pt-3">
            <LikeButton postId={post.id} liked={post.likedByMe} count={post.likeCount} />
            <Link
              href={`/posts/${post.id}`}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm tabular-nums text-bh-faint transition-colors hover:bg-bh-surface-2 hover:text-bh-ink"
            >
              <Icon name="comment" size={16} />
              {post.commentCount}
            </Link>
            <Link
              href={`/posts/${post.id}`}
              className="ml-auto inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm text-bh-faint transition-colors hover:bg-bh-surface-2 hover:text-bh-ink"
            >
              View post
            </Link>
          </footer>
        </div>
      </div>
    </Card>
  )
}