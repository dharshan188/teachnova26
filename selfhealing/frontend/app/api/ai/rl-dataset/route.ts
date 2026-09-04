import { NextResponse } from 'next/server'

import { requireSecurityOperator } from '@/lib/server/security'
import { exportRlDataset } from '@/lib/server/learning/memory'
import { handleApiError } from '@/lib/server/response'

// GET /api/ai/rl-dataset — the normalized state/action/reward/nextState dataset
// that a future trainer would consume. Read-only export.
export async function GET() {
  const guard = await requireSecurityOperator()
  if (!guard.ok) return guard.response

  try {
    const rows = await exportRlDataset()
    return NextResponse.json({ ok: true, count: rows.length, rows })
  } catch (err) {
    return handleApiError(err)
  }
}