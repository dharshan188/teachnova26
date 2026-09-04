import { NextResponse } from 'next/server'

import { requireSecurityOperator } from '@/lib/server/security'
import { computeEvaluationStats } from '@/lib/server/learning/memory'
import { handleApiError } from '@/lib/server/response'

// GET /api/ai/evaluate — the evaluation harness over completed attempts and
// patch records. Scores derive from the persisted audit trail only.
export async function GET() {
  const guard = await requireSecurityOperator()
  if (!guard.ok) return guard.response

  try {
    const stats = await computeEvaluationStats()
    return NextResponse.json({ ok: true, stats })
  } catch (err) {
    return handleApiError(err)
  }
}