import type { Project, ProjectSummary, ProjectStatus } from '../types'
import { parseError } from './http'
import type { PaginationResult } from './posts'

export interface ProjectCreateInput {
  name: string
  description?: string
  status?: ProjectStatus
  tags?: string[]
}

export interface ProjectUpdateInput {
  name?: string
  description?: string | null
  status?: ProjectStatus
  tags?: string[]
}

export interface ProjectsResult {
  projects: ProjectSummary[]
  pagination: PaginationResult
}

export async function getProjects(params?: {
  mine?: boolean
  owner?: string
  page?: number
  pageSize?: number
}): Promise<ProjectsResult> {
  const qs = new URLSearchParams()
  if (params?.mine) qs.set('mine', '1')
  if (params?.owner) qs.set('owner', params.owner)
  if (params?.page != null) qs.set('page', String(params.page))
  if (params?.pageSize != null) qs.set('pageSize', String(params.pageSize))
  const query = qs.size ? `?${qs.toString()}` : ''
  const res = await fetch(`/api/projects${query}`)
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function getProject(id: string): Promise<Project | null> {
  const res = await fetch(`/api/projects/${encodeURIComponent(id)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(await parseError(res))
  const body = await res.json()
  return body?.project ?? null
}

export async function createProject(input: ProjectCreateInput): Promise<ProjectSummary> {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(await parseError(res))
  const body = await res.json()
  return body?.project as ProjectSummary
}

export async function updateProject(
  id: string,
  input: ProjectUpdateInput,
): Promise<ProjectSummary> {
  const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(await parseError(res))
  const body = await res.json()
  return body?.project as ProjectSummary
}

export async function deleteProject(id: string): Promise<void> {
  const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(await parseError(res))
}