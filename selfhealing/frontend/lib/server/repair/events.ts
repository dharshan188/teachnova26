import 'server-only'

import { prisma } from '@/lib/server/db'

/** Records a timeline entry for an incident (observability fact, not AI). */
export async function addIncidentEvent(
  incidentId: string,
  stage: string,
  label: string,
  detail?: string,
): Promise<void> {
  try {
    await prisma.incidentEvent.create({
      data: { incidentId, stage, label, detail: detail ?? null },
    })
  } catch {
    // timeline persistence must never crash the repair pipeline
  }
}