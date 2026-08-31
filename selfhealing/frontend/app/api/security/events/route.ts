import { NextResponse } from 'next/server'

import { getSessionUser } from '@/lib/server/auth'
import { errorResponse } from '@/lib/server/response'
import { prisma } from '@/lib/server/db'
import type { NotificationType, DeliveryStatus, IncidentSeverity } from '@prisma/client'

// GET /api/security/events — Server-Sent Events stream for realtime incident,
// agent-run, approval, repair and telegram delivery updates. Used by the
// command center overview.
//
// Protocol:
//   event: snapshot   -> { rows, lastIncident } initial delivery state
//   event: delivery   -> { rows } -> new Telegram delivery records
//   event: lifecycle  -> { incidents, events, agentRuns, approvals, repairs }
//                       -> new lifecycle rows since the last poll (initial
//                          lifecycle snapshot is also sent on connect)
//   : keepalive comment every 15s
//
// Implementation note: dev-scale event bus. We poll the persisted tables on an
// interval and push diffs; there is no Redis/pub-sub dependency.

export const dynamic = 'force-dynamic'

interface DeliveryRow {
  id: string
  type: NotificationType
  severity: IncidentSeverity | null
  deliveryStatus: DeliveryStatus
  telegramMessageId: string | null
  error: string | null
  incidentId: string | null
  createdAt: Date
}

const HEARTBEAT_MS = 15000
const POLL_MS = 4000

function encode(payload: string): Uint8Array {
  return new TextEncoder().encode(payload)
}

function event(name: string, data: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`
}

async function readRecentRows(limit = 12): Promise<DeliveryRow[]> {
  const rows = await prisma.telegramNotification.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return rows
}

function serializeRows(rows: DeliveryRow[]) {
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    severity: row.severity,
    deliveryStatus: row.deliveryStatus,
    telegramMessageId: row.telegramMessageId,
    error: row.error,
    incidentId: row.incidentId,
    createdAt: row.createdAt.toISOString(),
  }))
}

async function readLastIncident() {
  const incident = await prisma.incident.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { ref: true, status: true, severity: true, createdAt: true },
  })
  return incident
    ? {
        ref: incident.ref,
        status: incident.status,
        severity: incident.severity,
        createdAt: incident.createdAt.toISOString(),
      }
    : null
}

// ---------------------------------------------------------------------------
// Lifecycle polling (incidents, events, agent runs, approvals, repairs)
// ---------------------------------------------------------------------------

interface LifecyclePayload {
  incidents: Array<{
    id: string
    ref: string
    status: string
    severity: IncidentSeverity
    title: string
    updatedAt: string
  }>
  events: Array<{
    id: string
    incidentId: string
    ref: string | null
    stage: string
    label: string
    detail: string | null
    at: string
  }>
  agentRuns: Array<{
    id: string
    incidentId: string
    ref: string | null
    agent: string
    kind: string | null
    role: string
    status: string
    round: number
    mode: string
    model: string | null
    updatedAt: string
  }>
  approvals: Array<{
    id: string
    incidentId: string
    ref: string | null
    approvalId: string
    status: string
    operator: string
    createdAt: string
    expiresAt: string
  }>
  repairs: Array<{
    attemptId: string
    incidentId: string
    ref: string | null
    status: string
    risk: string | null
    startedAt: string
  }>
}

async function readLifecycle(limit = 10): Promise<LifecyclePayload> {
  const [incidents, events, agentRuns, approvals, repairs] = await Promise.all([
    prisma.incident.findMany({
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        ref: true,
        status: true,
        severity: true,
        title: true,
        updatedAt: true,
      },
    }),
    prisma.incidentEvent.findMany({
      orderBy: { at: 'desc' },
      take: limit,
      include: { incident: { select: { ref: true } } },
    }),
    prisma.agentRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { incident: { select: { ref: true } } },
    }),
    prisma.approval.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { incident: { select: { ref: true } } },
    }),
    prisma.repairAttempt.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: { incident: { select: { ref: true } } },
    }),
  ])

  return {
    incidents: incidents.map((row) => ({
      id: row.id,
      ref: row.ref,
      status: row.status,
      severity: row.severity,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
    })),
    events: events.map((row) => ({
      id: row.id,
      incidentId: row.incidentId,
      ref: row.incident?.ref ?? null,
      stage: row.stage,
      label: row.label,
      detail: row.detail,
      at: row.at.toISOString(),
    })),
    agentRuns: agentRuns.map((row) => ({
      id: row.id,
      incidentId: row.incidentId,
      ref: row.incident?.ref ?? null,
      agent: row.agent,
      kind: row.kind,
      role: row.role,
      status: row.status,
      round: row.round,
      mode: row.mode,
      model: row.model,
      updatedAt: row.completedAt?.toISOString() ?? row.createdAt.toISOString(),
    })),
    approvals: approvals.map((row) => ({
      id: row.id,
      incidentId: row.incidentId,
      ref: row.incident?.ref ?? null,
      approvalId: row.approvalId,
      status: row.status,
      operator: row.operator,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    })),
    repairs: repairs.map((row) => ({
      attemptId: row.attemptId,
      incidentId: row.incidentId,
      ref: row.incident?.ref ?? null,
      status: row.status,
      risk: row.risk,
      startedAt: row.startedAt.toISOString(),
    })),
  }
}

/** Rolling per-category de-duplicators (dev-scale; capped and reset). */
type LifecycleCategory = keyof LifecyclePayload

function makeSeenSets(): {
  add: (category: LifecycleCategory, key: string) => void
  fresh: <T>(category: LifecycleCategory, items: T[], key: (item: T) => string) => T[]
} {
  const sets: Record<string, Set<string>> = {}
  const add = (category: LifecycleCategory, key: string) => {
    sets[category] ??= new Set()
    sets[category].add(key)
    if (sets[category].size > 240) sets[category].clear()
  }
  const fresh = <T>(category: LifecycleCategory, items: T[], key: (item: T) => string) => {
    sets[category] ??= new Set()
    const out = items.filter((item) => !sets[category].has(key(item)))
    for (const item of out) sets[category].add(key(item))
    return out
  }
  return { add, fresh }
}

export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) return errorResponse('Not authenticated.', 401)

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      let lastSeenId: string | null = null
      const seen = makeSeenSets()

      const close = () => {
        if (closed) return
        closed = true
        try {
          controller.close()
        } catch {
          // already closed
        }
      }

      const emit = (row: { incidents: unknown[]; events: unknown[]; agentRuns: unknown[]; approvals: unknown[]; repairs: unknown[] }) => {
        {
          const hasAny =
            row.incidents.length > 0 ||
            row.events.length > 0 ||
            row.agentRuns.length > 0 ||
            row.approvals.length > 0 ||
            row.repairs.length > 0
          if (hasAny) controller.enqueue(encode(event('lifecycle', row)))
        }
      }

      // Fire async initialization detached so the Next.js handler returns
      // the response immediately (prevents 79s+ buffering).
      void (async () => {
        try {
          const [initial, lastIncident, lifecycle] = await Promise.all([readRecentRows(), readLastIncident(), readLifecycle()])
          const initialRows = serializeRows(initial)
          if (initialRows.length > 0) lastSeenId = initialRows[0].id
          if (!closed) {
            controller.enqueue(
              encode(event('snapshot', { rows: initialRows, lastIncident, checkedAt: new Date().toISOString() })),
            )
          }
          // Seed the seen-sets with the initial lifecycle snapshot so the first
          // low-latency poll only emits genuinely new rows, then push the
          // initial lifecycle snapshot so the overview can render current state.
          for (const category of ['incidents', 'events', 'agentRuns', 'approvals', 'repairs'] as const) {
            for (const item of lifecycle[category]) seen.add(category, 'id' in item ? item.id : String(item))
          }
          if (!closed) {
            controller.enqueue(encode(event('lifecycle', lifecycle)))
          }
        } catch (err) {
          if (!closed) {
            controller.enqueue(
              encode(
                event('error', {
                  message: err instanceof Error ? err.message : 'Failed to load security snapshot',
                }),
              ),
            )
          }
        }
      })()

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'))
        } catch {
          close()
        }
      }, HEARTBEAT_MS)

      const poll = setInterval(async () => {
        if (closed) return
        try {
          const rows = await readRecentRows()
          const serialized = serializeRows(rows)
          const latestId = serialized.length > 0 ? serialized[0].id : null
          if (latestId && latestId !== lastSeenId) {
            // Push rows that arrived after the last delivered row id. If the
            // last delivered id has scrolled out of the recent window, push
            // the whole window rather than slicing to index -1.
            const seenIdx = serialized.findIndex((r) => r.id === lastSeenId)
            const newRows = seenIdx === -1 ? rows : rows.slice(0, seenIdx)
            lastSeenId = latestId
            if (newRows.length > 0) {
              controller.enqueue(encode(event('delivery', { rows: serializeRows(newRows) })))
            }
          }
        } catch {
          // transient DB errors do not kill the stream
        }
      }, POLL_MS)

      const pollLifecycle = setInterval(async () => {
        if (closed) return
        try {
          const lifecycle = await readLifecycle()
          const fresh = {
            incidents: seen.fresh('incidents', lifecycle.incidents, (r) => r.id),
            events: seen.fresh('events', lifecycle.events, (r) => r.id),
            agentRuns: seen.fresh('agentRuns', lifecycle.agentRuns, (r) => r.id),
            approvals: seen.fresh('approvals', lifecycle.approvals, (r) => r.id),
            repairs: seen.fresh('repairs', lifecycle.repairs, (r) => `${r.attemptId}:${r.status}`),
          }
          emit(fresh as LifecyclePayload)
        } catch {
          // transient DB errors do not kill the stream
        }
      }, POLL_MS)

      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        clearInterval(poll)
        clearInterval(pollLifecycle)
        close()
      })
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}