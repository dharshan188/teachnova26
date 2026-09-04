import { NextResponse } from 'next/server'

import { requireSecurityOperator } from '@/lib/server/security'
import { computeLearningMetrics, getRewardPolicy } from '@/lib/server/learning/memory'
import { handleApiError } from '@/lib/server/response'

// GET /api/ai/learning — learning metrics + the explicit reward policy.
export async function GET() {
  const guard = await requireSecurityOperator()
  if (!guard.ok) return guard.response

  try {
    const [metrics, policy] = await Promise.all([computeLearningMetrics(), getRewardPolicy()])
    return NextResponse.json({ ok: true, metrics, policy })
  } catch (err) {
    return handleApiError(err)
  }
}