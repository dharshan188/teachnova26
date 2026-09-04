import { NextResponse } from 'next/server'

import { requireSecurityOperator } from '@/lib/server/security'
import { prisma } from '@/lib/server/db'
import { computeLearningMetrics, computeEvaluationStats, getRewardPolicy } from '@/lib/server/learning/memory'
import { handleApiError } from '@/lib/server/response'

// GET /api/ai/visualization — node/edge + trend data for the 3D dashboard and
// the Learning tab. All numbers are computed from the persisted audit trail.
export async function GET() {
  const guard = await requireSecurityOperator()
  if (!guard.ok) return guard.response

  try {
    const [metrics, stats, policy, incidents, experiences] = await Promise.all([
      computeLearningMetrics(),
      computeEvaluationStats(),
      getRewardPolicy(),
      prisma.incident.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.repairExperience.findMany({ orderBy: { createdAt: 'asc' }, select: { reward: true, outcome: true, createdAt: true } }),
    ])

    const severityBreakdown: Record<string, number> = {}
    const statusBreakdown: Record<string, number> = {}
    for (const inc of incidents) {
      severityBreakdown[inc.severity] = (severityBreakdown[inc.severity] ?? 0) + 1
      statusBreakdown[inc.status] = (statusBreakdown[inc.status] ?? 0) + 1
    }

    return NextResponse.json({
      ok: true,
      neurons: incidents.map((inc) => ({
        id: inc.id,
        ref: inc.ref,
        status: inc.status,
        severity: inc.severity,
        endpoint: inc.endpoint,
        createdAt: inc.createdAt.toISOString(),
        resolvedAt: inc.resolvedAt?.toISOString() ?? null,
      })),
      edges: experiences.map((e, i) => ({
        id: `exp-${i}`,
        reward: e.reward,
        outcome: e.outcome,
        createdAt: e.createdAt.toISOString(),
      })),
      metrics,
      stats,
      policy,
      breakdown: { severity: severityBreakdown, status: statusBreakdown },
    })
  } catch (err) {
    return handleApiError(err)
  }
}