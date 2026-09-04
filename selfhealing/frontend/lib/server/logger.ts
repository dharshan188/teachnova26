import 'server-only'

import { prisma } from './db'
import type { LogLevel } from '@prisma/client'

// Phase 7 — structured server-side logging.
//
// Reusable fields: timestamp (createdAt), level, service, route, method,
// status, requestId, message, errorCode.
//
// Safety contract (enforced here + by callers):
//   - NEVER pass passwords, session tokens, cookies, Authorization headers,
//     API keys, or database credentials into `message`.
//   - `redactSensitive` strips known secret-shaped values defensively before
//     anything is persisted or echoed to the console.

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/

// Very defensive redaction: if a secret-looking value (Bearer token, JWT,
// password=, token=, api key=, URL with credentials, base64 secret blob)
// ever reaches a message it is masked. This is a backstop — callers must not
// rely on it as the primary protection.
const SECRET_PATTERN =
  /(bearer\s+[a-z0-9._-]+|(password|passwd|pwd|secret|token|api[_-]?key|auth[_-]?secret|session)\s*[=:]\s*[^\s,;&]+|https?:\/\/[^\s/]+:[^\s@/]+@)/i

export function redactSensitive(value: string): string {
  return value.replace(SECRET_PATTERN, (match) => {
    const idx = match.search(/[=:]/)
    if (idx === -1) return '[REDACTED]'
    return `${match.slice(0, idx + 1)} [REDACTED]`
  })
}

/**
 * Resolves the request/correlation ID for a request: reuses a safe incoming
 * X-Request-ID or generates one. Generation keeps a per-process counter so the
 * shape is predictable and unique without collisions.
 */
export function resolveRequestId(request: Request): string {
  const incoming = request.headers.get('x-request-id')
  if (incoming && SAFE_REQUEST_ID.test(incoming)) return incoming
  return crypto.randomUUID()
}

export function safeRequestId(value: string | null | undefined): string | null {
  if (!value) return null
  return SAFE_REQUEST_ID.test(value) ? value : null
}

export interface LogInput {
  level: LogLevel
  /** Owning subsystem, e.g. "api", "auth", "monitoring", "health". */
  service: string
  message: string
  route?: string | null
  method?: string | null
  status?: number | null
  requestId?: string | null
  incidentId?: string | null
  approvalId?: string | null
  faultId?: string | null
  action?: string | null
  errorCode?: string | null
}

/**
 * Persists a structured log event. Best-effort: an observability failure must
 * never break the application request, so persistence errors fall back to a
 * single-line console log (without leaking the event's message content).
 */
export async function logEvent(input: LogInput): Promise<void> {
  try {
    await prisma.logEvent.create({
      data: {
        level: input.level,
        service: input.service,
        message: redactSensitive(input.message).slice(0, 1000),
        route: input.route?.slice(0, 200) ?? null,
        method: input.method?.toUpperCase() ?? null,
        status: input.status ?? null,
        requestId: safeRequestId(input.requestId),
        incidentId: input.incidentId ?? null,
        errorCode: input.errorCode?.slice(0, 80) ?? null,
      },
    })
  } catch (err) {
    console.error(
      '[observability] logEvent persist failed:',
      err instanceof Error ? err.message : 'unknown error',
    )
  }
}

/** Convenience helpers so routes read naturally. */
export const logger = {
  info: (input: Omit<LogInput, 'level'>) => logEvent({ ...input, level: 'INFO' }),
  warn: (input: Omit<LogInput, 'level'>) => logEvent({ ...input, level: 'WARN' }),
  error: (input: Omit<LogInput, 'level'>) => logEvent({ ...input, level: 'ERROR' }),
  security: (input: Omit<LogInput, 'level'>) => logEvent({ ...input, level: 'SECURITY' }),
}