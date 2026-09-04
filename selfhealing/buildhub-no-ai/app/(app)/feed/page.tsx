'use client'

import { getPosts } from '@/lib/api/posts'
import { useAsync } from '@/lib/hooks'
import { useAuth } from '@/components/auth/auth-provider'
import { PostCard } from '@/components/posts/post-card'
import { PostComposer } from '@/components/posts/post-composer'
import { FeedSkeleton } from '@/components/feedback/skeleton'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorState } from '@/components/feedback/error-state'
import { Avatar } from '@/components/ui/avatar'

export default function FeedPage() {
  const { user } = useAuth()
  const feed = useAsync(() => getPosts())

  return (
    <div className="mx-auto max-w-2xl">
      {user && (
        <div className="mb-5 flex items-center gap-3">
          <Avatar name={user.name} username={user.username} size={44} />
          <div>
            <h1 className="text-xl font-semibold text-bh-ink">
              Welcome back, {user.name.split(' ')[0]}
            </h1>
            <p className="text-sm text-bh-muted">
              Here’s what’s happening in your developer community.
            </p>
          </div>
        </div>
      )}

      <PostComposer onCreated={feed.refetch} />

      <div className="mt-6 space-y-4" aria-live="polite">
        {feed.loading && feed.data === null && <FeedSkeleton />}
        {feed.error && (
          <ErrorState
            title="Couldn’t load the feed"
            description={feed.error}
            onRetry={feed.refetch}
          />
        )}
        {!feed.loading &&
          !feed.error &&
          feed.data &&
          feed.data.posts.length === 0 && (
            <EmptyState
              icon="home"
              title="No posts yet"
              description="Be the first to share something with your community. Write a post above."
            />
          )}
        {feed.data?.posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onUpdated={feed.refetch}
            onDeleted={feed.refetch}
          />
        ))}
      </div>
    </div>
  )
}