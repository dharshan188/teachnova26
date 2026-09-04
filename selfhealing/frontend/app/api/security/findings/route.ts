import { NextResponse } from 'next/server'

import {
  ANALYZER_CONTRACT_VERSION,
  ingestAnalyzerFindings,
  requireSecurityOperator,
} from '@/lib/server/security'
import { errorResponse, firstZodIssue, handleApiError } from '@/lib/server/response'
import { logger, resolveRequestId } from '@/lib/server/logger'
import { postFindingsSchema } from '@/lib/validation'

// Phase 8 — ingestion point for the (pure, stdlib-only) Python security log
// analyzer. Operator gated (SECURITY_OPERATOR_USERNAMES). Next.js owns
// fingerprint deduplication and correlation — the analyzer never touches the DB.
export async function POST(request: Request) {
  const requestId = resolveRequestId(request)

  const guard = await requireSecurityOperator()
  if (!guard.ok) return guard.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('Invalid request body.', 400)
  }

  const parsed = postFindingsSchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse(firstZodIssue(parsed.error), 400)
  }

  try {
    const summary = await ingestAnalyzerFindings(parsed.data.findings)

    await logger.info({
      service: 'security',
      message: 'Security findings ingested from analyzer',
      route: '/api/security/findings',
      method: 'POST',
      status: 200,
      requestId,
    })

    return NextResponse.json({ contractVersion: ANALYZER_CONTRACT_VERSION, ...summary })
  } catch (err) {
    return handleApiError(err)
  }
}