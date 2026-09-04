import { z } from 'zod'

export const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const usernameSchema = z
  .string()
  .min(1, 'Username is required.')
  .regex(USERNAME_REGEX, '3–20 characters: lowercase letters, numbers, underscores.')

export const nameSchema = z
  .string()
  .min(1, 'Name is required.')
  .max(80, 'Name must be 80 characters or fewer.')

export const emailSchema = z.string().email('Enter a valid email address.')

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters.')

export const registerSchema = z
  .object({
    name: nameSchema,
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })

export const signInSchema = z.object({
  identifier: z.string().min(1, 'Enter your email or username.'),
  password: z.string().min(1, 'Enter your password.'),
})

export const updateProfileSchema = z.object({
  name: nameSchema.optional(),
  bio: z.string().max(160, 'Bio must be 160 characters or fewer.').optional(),
  avatar: z
    .string()
    .url('Enter a valid image URL.')
    .or(z.literal(''))
    .optional(),
})

// ---- Posts -------------------------------------------------------------

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

// ---- Projects ----------------------------------------------------------

export const PROJECT_STATUSES = ['ACTIVE', 'COMPLETED', 'ARCHIVED'] as const
export type ProjectStatusValue = (typeof PROJECT_STATUSES)[number]

export const projectStatusSchema = z.enum(PROJECT_STATUSES)

export const projectNameSchema = z
  .string()
  .trim()
  .min(1, 'Project name is required.')
  .max(80, 'Project name must be 80 characters or fewer.')

export const projectDescriptionSchema = z
  .string()
  .trim()
  .max(500, 'Description must be 500 characters or fewer.')

export const MAX_PROJECT_TAGS = 7

export const projectTagsSchema = z
  .array(tagSchema)
  .max(MAX_PROJECT_TAGS, `You can add up to ${MAX_PROJECT_TAGS} tags.`)

export const createProjectSchema = z.object({
  name: projectNameSchema,
  description: projectDescriptionSchema.optional(),
  status: projectStatusSchema.optional().default('ACTIVE'),
  tags: projectTagsSchema.optional(),
})

export const updateProjectSchema = z
  .object({
    name: projectNameSchema.optional(),
    description: projectDescriptionSchema.optional().nullable(),
    status: projectStatusSchema.optional(),
    tags: projectTagsSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Nothing to update.',
  })

// ---- Comments ----------------------------------------------------------

export const COMMENT_CONTENT_MAX = 500

export const commentContentSchema = z
  .string()
  .trim()
  .min(1, 'Comment content is required.')
  .max(COMMENT_CONTENT_MAX, `Comments must be ${COMMENT_CONTENT_MAX} characters or fewer.`)

export const createCommentSchema = z.object({
  content: commentContentSchema,
})

export const updateCommentSchema = z
  .object({
    content: commentContentSchema,
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Nothing to update.',
  })

// ---- Phase 8 security -----------------------------------------------------

export const SECURITY_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
export type SecuritySeverityValue = (typeof SECURITY_SEVERITIES)[number]

export const analyzerFindingSchema = z.object({
  ruleId: z.string().trim().min(1, 'ruleId is required.').max(80),
  title: z.string().trim().min(1, 'title is required.').max(160),
  severity: z.enum(SECURITY_SEVERITIES),
  endpoint: z.string().trim().max(200).nullish(),
  method: z.string().trim().max(10).nullish(),
  detail: z.string().trim().max(1000).nullish(),
  windowStartMs: z
    .number()
    .int()
    .nonnegative('windowStartMs must be a non-negative integer.'),
  bucketKey: z.string().trim().max(80).default('global'),
  count: z.number().int().min(1).max(100000).default(1),
  requestIds: z
    .array(z.string().trim().min(1).max(128))
    .max(24)
    .optional()
    .default([]),
})

export const postFindingsSchema = z.object({
  findings: z
    .array(analyzerFindingSchema)
    .min(1, 'At least one finding is required.')
    .max(50, 'At most 50 findings per request.'),
})

export const runPipelineSchema = z.object({
  incidentId: z.string().trim().min(1, 'incidentId is required.').max(64),
  // Hermetic test scenario for the TEST provider. Never forwarded to real
  // model providers (they ignore it); safe to accept unconditionally.
  scenario: z.string().trim().max(64).optional(),
})
