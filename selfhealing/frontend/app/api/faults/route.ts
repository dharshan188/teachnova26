import { NextResponse } from 'next/server'

import { requireSecurityOperator } from '@/lib/server/security'
import { logger, resolveRequestId } from '@/lib/server/logger'
import { errorResponse, handleApiError, firstZodIssue } from '@/lib/server/response'
import { createFaultIncident } from '@/lib/server/repair/ingest'
import { 
  isFaultInjectionEnabled, 
  getFaultRegistry, 
  getFault, 
  activateFault, 
  deactivateFault, 
  deactivateAllFaults,
  getActiveFaults,
  applyFaultPatch
} from '@/lib/server/fault-injection'
import { z } from 'zod'

export async function GET() {
  if (!isFaultInjectionEnabled()) {
    return NextResponse.json({ 
      enabled: false, 
      message: 'Fault injection not enabled. Set FAULT_INJECTION_ENABLED=true to use.' 
    })
  }

  const faults = getFaultRegistry()
  const active = getActiveFaults()
  
  return NextResponse.json({
    enabled: true,
    total: faults.length,
    active: active.length,
    faults: faults.map(f => ({
      severity: f.riskLevel,
      difficulty: f.difficulty,
      trigger: `${f.trigger.method} ${f.trigger.endpoint}`,
      symptom: f.expectedError,
      active: f.active,
      id: f.id,
    }))
  })
}

const activateSchema = z.object({
  faultId: z.string().min(1).max(32)
})

const actionSchema = z.object({
  faultId: z.string().min(1).max(32).optional(),
  action: z.enum(['activate', 'deactivate', 'deactivate-all']).optional()
}).refine(data => {
  if (data.action === 'deactivate-all') return true
  return !!data.faultId
}, { message: 'faultId is required for activate/deactivate', path: ['faultId'] })

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

  const parsed = actionSchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse(firstZodIssue(parsed.error), 400)
  }

  try {
    const { faultId, action = 'activate' } = parsed.data
    
    let result: { ok: boolean; error?: string }
    
    if (action === 'deactivate') {
      if (!faultId) return errorResponse('faultId required for deactivate', 400)
      result = deactivateFault(faultId)
    } else if (action === 'deactivate-all') {
      deactivateAllFaults()
      result = { ok: true }
    } else {
      if (!faultId) return errorResponse('faultId required for activate', 400)
      result = activateFault(faultId)
      if (result.ok) {
        applyFaultPatch(faultId)
        const incident = await createFaultIncident(faultId)
        return NextResponse.json({
          success: true,
          faultId,
          action,
          incident: incident
            ? { id: incident.id, ref: incident.ref, status: incident.status, severity: incident.severity }
            : null,
        })
      }
    }

    await logger.info({
      service: 'fault-injection',
      message: `Fault ${action}d: ${faultId ?? 'all'}`,
      route: '/api/faults',
      method: 'POST',
      status: result.ok ? 200 : 400,
      requestId,
      faultId,
      action,
    })

    if (!result.ok) {
      return errorResponse(result.error ?? 'Operation failed', 400)
    }

    return NextResponse.json({ success: true, faultId, action })
  } catch (err) {
    return handleApiError(err)
  }
}