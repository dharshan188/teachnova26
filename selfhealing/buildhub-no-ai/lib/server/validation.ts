import 'server-only'

import { z } from 'zod'

// Server-only validation — mirrors lib/validation but lives server-side so it
// can be imported by API routes without leaking into client bundles.

export const POST_CONTENT_MAX = 1000
export const MAX_TAGS = 5

export const postContentSchema = z
  .string()
  .trim()
  .min(1, 'Post content is required.')
  .max(POST_CONTENT_MAX, `Posts must be ${POST_CONTENT_MAX} characters or fewer.`)

export const tagSchema = z
  .string()
  .trim()
  .min(1, 'Tags must not be empty.')
  .max(24, 'Tags must be 24 characters or fewer.')
  .regex(/^[a-z0-9-]+$/, 'Tags may only contain lowercase letters, numbers, and hyphens.')
  .transform((t) => t.toLowerCase())

export const tagsSchema = z
  .array(tagSchema)
  .max(MAX_TAGS, `You can add up to ${MAX_TAGS} tags.`)

export const createPostSchema = z.object({
  content: postContentSchema,
  projectId: z
    .string()
    .trim()
    .min(1, 'Invalid project reference.')
    .optional()
    .nullable(),
  tags: tagsSchema.optional(),
})

export const updatePostSchema = z
  .object({
    content: postContentSchema.optional(),
    projectId: z
      .string()
      .trim()
      .min(1, 'Invalid project reference.')
      .optional()
      .nullable(),
    tags: tagsSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Nothing to update.',
  })