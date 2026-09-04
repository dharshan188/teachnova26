// Diagnostic: drive HIGH-01 and dump why the pipeline failed to reach approval.
import 'dotenv/config'
const { PrismaClient } = await import('@prisma/client')
const { PrismaPg } = await import('@prisma/adapter-pg')
const _adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const _db = new PrismaClient({ adapter: _adapter })

const BASE = 'http://localhost:3000'
class Client {
  cookie = ''
  async request(method, path, body) {
    const headers = this.cookie ? { Cookie: this.cookie } : {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const res = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual', signal: AbortSignal.timeout(300000) })
    const sc = res.headers.get('set-cookie'); const m = sc && sc.match(/buildhub_session=[^;]+/); if (m) this.cookie = m[0]
    const text = await res.text(); let json = null; try { json = JSON.parse(text) } catch {}
    return { status: res.status, json }
  }
  get(p){ return this.request('GET', p) }
  post(p,b){ return this.request('POST', p, b ?? undefined) }
}
const op = new Client()
await op.post('/api/auth/login', { identifier: 'arjun', password: 'buildhub-demo1' })
await op.post('/api/faults', { action: 'deactivate-all' })
await _db.incident.updateMany({ where: { status: { in: ['DETECTED','INVESTIGATING','AWAITING_REVIEW','WAITING_APPROVAL'] } }, data: { status: 'AI_REPAIR_FAILED' } })
await _db.repairAttempt.updateMany({ where: { status: { in: ['WAITING_APPROVAL','APPLYING','EVIDENCE_READY','RISK_CLASSIFIED','IN_PROGRESS'] } }, data: { status: 'FAILED' } })

const act = await op.post('/api/faults', { faultId: 'HIGH-01', action: 'activate' })
const inc = act.json?.incident
console.log('incident:', JSON.stringify(inc))
const run = await op.post('/api/security/run', { incidentId: inc.id })
console.log('run status:', run.status)
console.log('run result:', JSON.stringify(run.json, null, 2).slice(0, 2000))

const incRow = await _db.incident.findUnique({ where: { id: inc.id }, include: { events: { orderBy: { at: 'asc' } }, attempts: { orderBy: { createdAt: 'desc' } } } })
console.log('\n=== INCIDENT ===')
console.log('status:', incRow.status, '| summary:', incRow.summary)
console.log('\n=== EVENTS ===')
for (const e of incRow.events) console.log(`  [${e.stage}] ${e.label} — ${e.detail ?? ''}`)
console.log('\n=== ATTEMPTS ===')
for (const a of incRow.attempts) console.log(`  ${a.status} risk=${a.risk} summary=${a.summary ?? ''}`)
const runs = await _db.agentRun.findMany({ where: { incidentId: inc.id }, orderBy: { round: 'asc' } })
console.log('\n=== AGENT RUNS ===')
for (const r of runs) console.log(`  round=${r.round} kind=${r.kind} role=${r.role} status=${r.status} confidence=${r.confidence} error=${r.error ?? ''} | in=${(r.inputSummary ?? '').slice(0,120)} | out=${(r.outputSummary ?? '').slice(0,200)}`)
await _db.$disconnect()
