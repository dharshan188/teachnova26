export type ID = string

export interface ProjectSummary {
  id: ID
  name: string
  slug: string
  description: string | null
  tags: string[]
  status: ProjectStatus
  createdAt: string
  updatedAt: string
  isMine: boolean
  postCount: number
  owner: AvatarUser
}

export interface Project extends ProjectSummary {
  posts: Post[]
}

export interface AvatarUser {
  id: ID
  name: string
  username: string
  avatarUrl?: string
}

export type ProjectStatus = 'ACTIVE' | 'COMPLETED' | 'ARCHIVED'

export interface Post {
  id: ID
  author: AvatarUser
  content: string
  createdAt: string
  updatedAt: string
  project?: {
    id: ID
    name: string
    slug: string
  } | null
  tags: string[]
  isMine?: boolean
  likeCount: number
  commentCount: number
  likedByMe: boolean
}

export interface Comment {
  id: ID
  author: AvatarUser
  content: string
  createdAt: string
  updatedAt: string
  isMine?: boolean
}