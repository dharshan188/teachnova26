'use client'

import { useEffect, useState } from 'react'
import type { Post } from '@/lib/types'
import { updatePost, deletePost } from '@/lib/api/posts'
import { getProjects } from '@/lib/api/projects'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/fields'
import { TagEditor } from '@/components/posts/tag-editor'
import { Icon } from '@/components/ui/icon'
import { Dropdown } from '@/components/ui/dropdown'
import { useToast } from '@/components/ui/toast'

const MAX_LENGTH = 1000

function useProjectOptions(open: boolean) {
  const [options, setOptions] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    getProjects({ pageSize: 50 })
      .then((res) => {
        if (!cancelled) setOptions(res.projects)
      })
      .catch(() => {
        if (!cancelled) setOptions([])
      })
    return () => {
      cancelled = true
    }
  }, [open])

  return options
}

function ProjectSelect({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (id: string) => void
  options: { id: string; name: string }[]
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-bh-faint">
        <Icon name="folder" size={15} />
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Link a project"
        className="h-9 w-full appearance-none rounded-md border border-bh-line bg-bh-surface-2 pl-9 pr-8 text-sm text-bh-muted focus:border-bh-accent focus:outline-none"
      >
        <option value="">No project</option>
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-bh-faint">
        <Icon name="chevronDown" size={14} />
      </span>
    </div>
  )
}

export function EditPostModal({
  post,
  open,
  onClose,
  onUpdated,
}: {
  post: Post
  open: boolean
  onClose: () => void
  onUpdated: (post: Post) => void
}) {
  const { toast } = useToast()
  const options = useProjectOptions(open)
  const [content, setContent] = useState(post.content)
  const [projectId, setProjectId] = useState(post.project?.id ?? '')
  const [tags, setTags] = useState<string[]>(post.tags)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const remaining = MAX_LENGTH - content.length

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!content.trim()) {
      setError('Post content is required.')
      return
    }
    if (content.length > MAX_LENGTH) {
      setError(`Keep your post under ${MAX_LENGTH} characters.`)
      return
    }
    setLoading(true)
    try {
      const updated = await updatePost(post.id, {
        content,
        projectId: projectId || null,
        tags,
      })
      toast('success', 'Post updated', 'Your changes are live.')
      onUpdated(updated)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your post.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit post"
      description="Update what you shared with your network."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="edit-post-form" loading={loading}>
            Save changes
          </Button>
        </>
      }
    >
      <form id="edit-post-form" onSubmit={submit} className="space-y-4">
        <div>
          <label
            htmlFor="edit-post-content"
            className="mb-1.5 block text-sm font-medium text-bh-ink"
          >
            Content
          </label>
          <Textarea
            id="edit-post-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            maxLength={MAX_LENGTH}
            invalid={!!error}
            aria-label="Post content"
          />
          <p
            className={cn(
              'mt-1 text-right text-xs tabular-nums',
              remaining < 0 ? 'font-medium text-bh-danger' : 'text-bh-faint',
            )}
          >
            {remaining}
          </p>
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-bh-ink">Link a project</span>
          <ProjectSelect value={projectId} onChange={setProjectId} options={options} />
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-bh-ink">Tags</span>
          <TagEditor
            value={tags}
            onChange={setTags}
            onError={(message) => setError((prev) => message ?? prev)}
          />
        </div>

        {error && (
          <p role="alert" className="flex items-start gap-1 text-xs text-bh-danger">
            <Icon name="warning" size={14} className="mt-px shrink-0" />
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}

export function DeletePostModal({
  post,
  open,
  onClose,
  onDeleted,
}: {
  post: Post
  open: boolean
  onClose: () => void
  onDeleted: (id: string) => void
}) {
  const { toast } = useToast()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const confirm = async () => {
    setError('')
    setLoading(true)
    try {
      await deletePost(post.id)
      toast('success', 'Post deleted', 'The post was removed from your feed.')
      onDeleted(post.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete your post.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delete this post?"
      description="This will permanently remove the post from BuildHub. This action cannot be undone."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={loading} onClick={confirm}>
            Delete post
          </Button>
        </>
      }
    >
      {error && (
        <p role="alert" className="flex items-start gap-1 text-xs text-bh-danger">
          <Icon name="warning" size={14} className="mt-px shrink-0" />
          {error}
        </p>
      )}
    </Modal>
  )
}

export function PostMenu({
  post,
  onUpdated,
  onDeleted,
}: {
  post: Post
  onUpdated?: (post: Post) => void
  onDeleted?: (id: string) => void
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (!post.isMine) return null

  const handleUpdated = (updated: Post) => {
    onUpdated?.(updated)
  }

  const handleDeleted = (id: string) => {
    onDeleted?.(id)
  }

  return (
    <>
      <Dropdown
        menuLabel="Post actions"
        trigger={
          <button
            type="button"
            aria-label="Post options"
            className="flex h-8 w-8 items-center justify-center rounded-md text-bh-faint transition-colors hover:bg-bh-surface-2 hover:text-bh-ink"
          >
            <Icon name="more" size={18} />
          </button>
        }
        items={[
          { id: 'edit', label: 'Edit post', icon: 'edit' },
          { id: 'delete', label: 'Delete post', icon: 'trash', danger: true },
        ]}
        onSelect={(id) => (id === 'edit' ? setEditOpen(true) : setDeleteOpen(true))}
      />
      {editOpen && (
        <EditPostModal
          post={post}
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onUpdated={handleUpdated}
        />
      )}
      {deleteOpen && (
        <DeletePostModal
          post={post}
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          onDeleted={handleDeleted}
        />
      )}
    </>
  )
}