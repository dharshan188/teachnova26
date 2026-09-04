// Manual demo driver: HIGH approval flow (first, critical) + MEDIUM auto-repair flow.
// Verifies the deterministic dashboard policy (risk/health/cyber/active) reflects
// the LIVE ACTIVE state concurrently while the pipeline runs, and that HIGH does
// NOT apply the patch until PROCEED. Source-unchanged checks are byte-based.
import { readFileSync } from 'node:fs'
// @ts-ignore
import 'dotenv/config'
const { PrismaClient } = await import('@prisma/client')
const { PrismaPg } = await import('@prisma/adapter-pg')
const _adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const _prisma = new PrismaClient({ adapter: _adapter })

async function resetActiveData() {
  const ACTIVE = ['DETECTED', 'INVESTIGATING', 'AWAITING_REVIEW', 'WAITING_APPROVAL']
  await _prisma.incident.updateMany({ where: { status: { in: ACTIVE } }, data: { status: 'AI_REPAIR_FAILED', summary: 'Auto reset before manual demo.' } })
  await _prisma.repairAttempt.updateMany({ where: { status: { in: ['WAITING_APPROVAL', 'APPLYING', 'EVIDENCE_READY', 'RISK_CLASSIFIED', 'IN_PROGRESS'] } }, data: { status: 'FAILED', completedAt: new Date(), summary: 'Auto reset before manual demo.' } })
}

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const HIGH_FILE = new URL('./app/api/auth/login/route.ts', import.meta.url)

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const op = new Client()
let pass = 0, fail = 0
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok  ${name}`) }
  else { fail++; console.error(`FAIL  ${name}${extra ? ` — ${extra}` : ''}`) }
}

const login = await op.post('/api/auth/login', { identifier: 'arjun', password: 'buildhub-demo1' })
check('operator login 200', login.status === 200, `status=${login.status}`)
await op.post('/api/faults', { action: 'deactivate-all' })
await resetActiveData()
await sleep(500)
async function overview() { const r = await op.get('/api/observability/summary'); return r.json?.overview ?? null }
async function incident(iid) { return (await op.get(`/api/incidents/${iid}`)).json?.incident }

// sample overview + incident every `interval` ms while a promise is in flight
async function sampleDuring(promise, iid, interval, onSample) {
  const result = { active: 0, maxRisk: -1, minHealth: 101, lowHealth: new Set(), sawActive: false, targetSeen: {} }
  let done = false
  const p = promise.then((r) => { result.run = r; done = true; return r }).catch((e) => { result.runErr = String(e); done = true })
  while (!done) {
    const ov = await overview()
    const inc = await incident(iid)
    result.active = Math.max(result.active, ov?.activeIncidents ?? 0)
    result.maxRisk = Math.max(result.maxRisk, ov?.riskScore ?? 0)
    result.minHealth = Math.min(result.minHealth, ov?.systemHealth ?? 101)
    if ((ov?.activeIncidents ?? 0) >= 1) result.sawActive = true
    if (ov?.systemHealth === 30) result.lowHealth.add(30)
    if (ov?.systemHealth === 55) result.lowHealth.add(55)
    if (inc) result.status = inc.status
    if (onSample) onSample(ov, inc)
    await sleep(interval)
  }
  await p
  return result
}

// ===========================================================================
// HIGH FLOW  (run first: most critical, fresh Groq quota)
// ===========================================================================
console.log('\n========== HIGH FLOW (human approval) ==========')
let ov = await overview()
check('baseline NORMAL risk 0', ov?.riskScore === 0, JSON.stringify(ov))
check('baseline NORMAL health 100', ov?.systemHealth === 100, JSON.stringify(ov))
check('baseline NORMAL active 0', ov?.activeIncidents === 0, JSON.stringify(ov))

const preActivate = readFileSync(HIGH_FILE, 'utf8')
const hiAct = await op.post('/api/faults', { faultId: 'HIGH-01', action: 'activate' })
const hiInc = hiAct.json?.incident
check('activate HIGH-01 creates HIGH incident', !!hiInc && hiInc?.severity === 'HIGH', JSON.stringify(hiInc))
const faultedBytes = readFileSync(HIGH_FILE, 'utf8')

console.log('  HIGH pipeline running (real Groq) — sampling dashboard live...')
const runPromise = op.post('/api/security/run', { incidentId: hiInc.id })
let hiStatus = null, hiApprovalId = null
const hiSampled = await sampleDuring(runPromise, hiInc.id, 2500, (o, inc) => {
  hiStatus = inc?.status ?? hiStatus
})
const hiRun = hiSampled.run
check('HIGH pipeline run accepted', hiRun?.status === 200, `status=${hiRun?.status}`)
check('HIGH reached WAITING_APPROVAL (no auto-apply)', hiRun?.json?.stage === 'WAITING_APPROVAL', `stage=${hiRun?.json?.stage}`)
check('HIGH requiresApproval true', hiRun?.json?.requiresApproval === true)
check('HIGH showed RISK 50 / HEALTH 55 while active', hiSampled.minHealth === 55 && hiSampled.maxRisk >= 50, JSON.stringify({ minHealth: hiSampled.minHealth, maxRisk: hiSampled.maxRisk, active: hiSampled.active }))
check('HIGH showed >=1 active incident while active', hiSampled.sawActive, `active=${hiSampled.active}`)
hiApprovalId = hiRun?.json?.approvalId
check('HIGH approval id found', !!hiApprovalId, `id=${hiApprovalId}`)

const waitingBytes = readFileSync(HIGH_FILE, 'utf8')
check('source UNCHANGED before PROCEED (repair NOT applied)', waitingBytes === faultedBytes, waitingBytes === faultedBytes ? '' : 'file changed before approval')

ov = await overview()
console.log(`    dashboard at WAITING_APPROVAL: risk=${ov?.riskScore} health=${ov?.systemHealth}% cyber=${ov?.cyberSafetyScore} active=${ov?.activeIncidents}`)

// ---- PROCEED (human reply) ----
const pr = await op.post('/api/approvals/proceed', { approvalId: hiApprovalId, action: 'proceed' })
check('PROCEED → 200', pr.status === 200, `status=${pr.status}`)

let hiFinal = null
await sleep(2500)
const hp = Date.now()
while (Date.now() - hp < 240000) {
  const inc = await incident(hiInc.id)
  if (inc && ['RESOLVED', 'ROLLED_BACK', 'AI_REPAIR_FAILED'].includes(inc.status)) { hiFinal = inc.status; break }
  await sleep(4000)
}
check('after PROCEED incident resolved', hiFinal === 'RESOLVED', `status=${hiFinal}`)
// HIGH-01 is an in-memory guarded fault (enforced by the runtime guard, not a
// physical file edit). After PROCEED the repair disarms + deactivates it, so
// the guard is off and auth is restored. We verify that deactivation directly.
const faultsAfter = (await op.get('/api/faults')).json?.faults ?? []
const high01After = faultsAfter.find((f) => f.id === 'HIGH-01')
check('after PROCEED HIGH-01 fault deactivated (guard off)', high01After?.active === false, `active=${high01After?.active}`)
ov = await overview()
check('after HIGH resolve risk 0 / health 100 / active 0', ov?.riskScore === 0 && ov?.systemHealth === 100 && ov?.activeIncidents === 0, JSON.stringify(ov))

await op.post('/api/faults', { action: 'deactivate-all' })
await sleep(2000)

// ===========================================================================
// MEDIUM FLOW  (auto-repair)
// ===========================================================================
console.log('\n========== MEDIUM FLOW (auto-repair) ==========')
ov = await overview()
check('MEDIUM baseline risk 0 / health 100 / active 0', ov?.riskScore === 0 && ov?.systemHealth === 100 && ov?.activeIncidents === 0, JSON.stringify(ov))

const medAct = await op.post('/api/faults', { faultId: 'MEDIUM-01' })
const medInc = medAct.json?.incident
check('activate MEDIUM-01 creates MEDIUM incident', !!medInc && medInc?.severity === 'MEDIUM', JSON.stringify(medInc))

console.log('  MEDIUM pipeline running (real Groq) — sampling dashboard live...')
const medRunPromise = op.post('/api/security/run', { incidentId: medInc.id })
const medSampled = await sampleDuring(medRunPromise, medInc.id, 2500)
const medRun = medSampled.run
check('MEDIUM pipeline run accepted', medRun?.status === 200, `status=${medRun?.status}`)
check('MEDIUM showed HEALTH 30 / RISK 30 while active', medSampled.minHealth === 30 && medSampled.maxRisk >= 30, JSON.stringify({ minHealth: medSampled.minHealth, maxRisk: medSampled.maxRisk, active: medSampled.active }))
check('MEDIUM showed >=1 active incident while active', medSampled.sawActive, `active=${medSampled.active}`)
check('MEDIUM auto-resolved', medRun?.json?.stage === 'RESOLVED', `stage=${medRun?.json?.stage}`)
ov = await overview()
check('after MEDIUM resolve risk 0 / health 100 / active 0', ov?.riskScore === 0 && ov?.systemHealth === 100 && ov?.activeIncidents === 0, JSON.stringify(ov))

await op.post('/api/faults', { action: 'deactivate-all' })
console.log(`\n===== MANUAL DEMO RESULT: ${pass} passed, ${fail} failed =====`)
process.exit(fail === 0 ? 0 : 1)
