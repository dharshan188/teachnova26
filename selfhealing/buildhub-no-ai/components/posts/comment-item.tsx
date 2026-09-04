'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { Comment } from '@/lib/types'
import { updateComment, deleteComment } from '@/lib/api/comments'
import { COMMENT_CONTENT_MAX } from '@/lib/validation'
import { cn } from '@/lib/cn'
import { timeAgo } from '@/lib/format'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dropdown } from '@/components/ui/dropdown'
import { Icon } from '@/components/ui/icon'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/fields'
import { useToast } from '@/components/ui/toast'

interface CommentItemProps {
  comment: Comment
  onUpdated?: (comment: Comment) => void
  onDeleted?: (id: string) => void
}

export function CommentItem({ comment, onUpdated, onDeleted }: CommentItemProps) {
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(comment.content)
  const [editError, setEditError] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const remaining = COMMENT_CONTENT_MAX - editContent.length

  const saveEdit = async () => {
    setEditError('')
    if (!editContent.trim()) {
      setEditError('Comment content is required.')
      return
    }
    setEditLoading(true)
    try {
      const updated = await updateComment(comment.id, editContent)
      toast('success', 'Comment updated', 'Your changes are live.')
      onUpdated?.(updated)
      setEditing(false)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Could not update your comment.')
    } finally {
      setEditLoading(false)
    }
  }

  const confirmDelete = async () => {
    setDeleteError('')
    setDeleteLoading(true)
    try {
      await deleteComment(comment.id)
      toast('success', 'Comment deleted', 'The comment was removed.')
      onDeleted?.(comment.id)
      setDeleteOpen(false)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete your comment.')
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <li className="flex items-start gap-3">
      <Link href={`/profile/${comment.author.username}`}>
        <Avatar name={comment.author.name} username={comment.author.username} size={34} />
      </Link>
      <div className="min-w-0 flex-1 rounded-lg border border-bh-line bg-bh-surface px-3.5 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Link
              href={`/profile/${comment.author.username}`}
              className="text-sm font-semibold text-bh-ink hover:text-bh-accent"
            >
              {comment.author.name}
            </Link>
            <span className="text-xs text-bh-faint">@{comment.author.username}</span>
            <span className="text-bh-faint">·</span>
            <time className="text-xs text-bh-faint">{timeAgo(comment.createdAt)}</time>
            {comment.createdAt !== comment.updatedAt && (
              <Badge tone="neutral" className="px-1.5 text-[10px]">
                edited
              </Badge>
            )}
          </div>
          {comment.isMine && (
            <Dropdown
              menuLabel="Comment actions"
              trigger={
                <button
                  type="button"
                  aria-label="Comment options"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-bh-faint transition-colors hover:bg-bh-surface-2 hover:text-bh-ink"
                >
                  <Icon name="more" size={16} />
                </button>
              }
              items={[
                { id: 'edit', label: 'Edit comment', icon: 'edit' },
                { id: 'delete', label: 'Delete comment', icon: 'trash', danger: true },
              ]}
              onSelect={(id) => (id === 'edit' ? setEditing(true) : setDeleteOpen(true))}
            />
          )}
        </div>

        {editing ? (
          <div className="mt-2">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              maxLength={COMMENT_CONTENT_MAX}
              rows={2}
              invalid={!!editError}
              aria-label="Edit comment content"
              className="min-h-[64px] text-sm"
            />
            {editError && (
              <p role="alert" className="mt-1 flex items-start gap-1 text-xs text-bh-danger">
                <Icon name="warning" size={13} className="mt-px shrink-0" />
                {editError}
              </p>
            )}
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span
                className={cn(
                  'text-xs tabular-nums',
                  remaining < 0 ? 'font-medium text-bh-danger' : 'text-bh-faint',
                )}
              >
                {remaining}
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button size="sm" loading={editLoading} onClick={saveEdit}>
                  Save changes
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-bh-ink">
            {comment.content}
          </p>
        )}
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this comment?"
        description="This will permanently remove the comment. This action cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={deleteLoading} onClick={confirmDelete}>
              Delete comment
            </Button>
          </>
        }
      >
        {deleteError && (
          <p role="alert" className="flex items-start gap-1 text-xs text-bh-danger">
            <Icon name="warning" size={14} className="mt-px shrink-0" />
            {deleteError}
          </p>
        )}
      </Modal>
    </li>
  )
}