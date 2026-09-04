'use client'

import { useState } from 'react'
import type { Project, ProjectStatus } from '@/lib/types'
import { updateProject, deleteProject } from '@/lib/api/projects'
import { MAX_PROJECT_TAGS } from '@/lib/validation'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Field } from '@/components/ui/field'
import { Select, Textarea } from '@/components/ui/fields'
import { Icon } from '@/components/ui/icon'
import { Dropdown } from '@/components/ui/dropdown'
import { TagEditor } from '@/components/posts/tag-editor'
import { useToast } from '@/components/ui/toast'
import { projectStatusMeta } from '@/components/projects/project-card'

export function EditProjectModal({
  project,
  open,
  onClose,
  onUpdated,
}: {
  project: Project
  open: boolean
  onClose: () => void
  onUpdated: (name: string, description: string | null, status: ProjectStatus, tags: string[]) => void
}) {
  const { toast } = useToast()
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description ?? '')
  const [status, setStatus] = useState<ProjectStatus>(project.status)
  const [tags, setTags] = useState<string[]>(project.tags ?? [])
  const [tagError, setTagError] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (tagError) {
      setError(tagError)
      return
    }
    if (!name.trim()) {
      setError('Give your project a name.')
      return
    }
    setLoading(true)
    try {
      await updateProject(project.id, {
        name: name.trim(),
        description: description.trim() || null,
        status,
        tags,
      })
      toast('success', 'Project updated', 'Your changes are saved.')
      onUpdated(name.trim(), description.trim() || null, status, tags)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your project.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit project"
      description="Update your project details."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="edit-project-form" loading={loading}>
            Save changes
          </Button>
        </>
      }
    >
      <form id="edit-project-form" onSubmit={submit} className="space-y-4">
        <Field
          id="edit-proj-name"
          label="Project name"
          placeholder="e.g. QueryRaft"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error}
          autoFocus
        />
        <div>
          <label htmlFor="edit-proj-desc" className="mb-1.5 block text-sm font-medium text-bh-ink">
            Description
          </label>
          <Textarea
            id="edit-proj-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What’s this project about?"
          />
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-bh-ink">Status</span>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as ProjectStatus)}
            aria-label="Project status"
          >
            {Object.entries(projectStatusMeta).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-bh-ink">
            Tags <span className="font-normal text-bh-faint">(up to {MAX_PROJECT_TAGS})</span>
          </span>
          <TagEditor value={tags} onChange={setTags} onError={setTagError} max={MAX_PROJECT_TAGS} />
        </div>
      </form>
    </Modal>
  )
}

export function DeleteProjectModal({
  project,
  open,
  onClose,
  onDeleted,
}: {
  project: Project
  open: boolean
  onClose: () => void
  onDeleted: () => void
}) {
  const { toast } = useToast()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const confirm = async () => {
    setError('')
    setLoading(true)
    try {
      await deleteProject(project.id)
      toast('success', 'Project deleted', 'The project was removed.')
      onDeleted()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete your project.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delete this project?"
      description="This will permanently remove the project and its detail page. Posts linked to it stay live but become unlinked."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={loading} onClick={confirm}>
            Delete project
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

export function ProjectMenu({
  project,
  onUpdated,
  onDeleted,
}: {
  project: Project
  onUpdated: (name: string, description: string | null, status: ProjectStatus, tags: string[]) => void
  onDeleted: () => void
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (!project.isMine) return null

  return (
    <>
      <Dropdown
        menuLabel="Project actions"
        trigger={
          <button
            type="button"
            aria-label="Project options"
            className="flex h-8 w-8 items-center justify-center rounded-md text-bh-faint transition-colors hover:bg-bh-surface-2 hover:text-bh-ink"
          >
            <Icon name="more" size={18} />
          </button>
        }
        items={[
          { id: 'edit', label: 'Edit project', icon: 'edit' },
          { id: 'delete', label: 'Delete project', icon: 'trash', danger: true },
        ]}
        onSelect={(id) => (id === 'edit' ? setEditOpen(true) : setDeleteOpen(true))}
      />
      {editOpen && (
        <EditProjectModal
          project={project}
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onUpdated={onUpdated}
        />
      )}
      {deleteOpen && (
        <DeleteProjectModal
          project={project}
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          onDeleted={onDeleted}
        />
      )}
    </>
  )
}