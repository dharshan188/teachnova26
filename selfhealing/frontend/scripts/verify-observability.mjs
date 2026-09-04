#!/usr/bin/env node
/**
 * Deterministic verification of the clean Phase 8 observability baseline.
 *
 * Requires a running BuildHub server (default http://localhost:3000, override
 * with BASE_URL). Assumes the database has been wiped to its pristine state —
 * run scripts/reset-observability.mjs first (it no longer re-seeds demo
 * incidents/logs).
 *
 * Asserted clean baseline (pure function of an empty runtime DB state):
 *   riskScore        0    (no active incidents, no warning/error/security pressure)
 *   cyberSafetyScore 100  (no active incident cyber impact)
 *   systemHealth     100  (all 5 components healthy)
 *   activeIncidents   0
 *
 * Run: node scripts/verify-observability.mjs
 */

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

let passed = 0
let failed = 0
const failures = []

function check(name, condition, extra) {
  if (condition) {
    passed += 1
    console.log(`  ok  ${name}`)
  } else {
    failed += 1
    console.error(`FAIL  ${name}${extra ? ` — ${extra}` : ''}`)
    failures.push(name)
  }
}

function tokenFromSetCookie(setCookie) {
  const match = setCookie && setCookie.match(/buildhub_session=[^;]+/)
  return match ? match[0] : null
}

class Client {
  constructor() {
    this.cookie = ''
  }

  async request(method, path, body) {
    const headers = this.cookie ? { Cookie: this.cookie } : {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    })
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) {
      const token = tokenFromSetCookie(setCookie)
      if (token) this.cookie = token
    }
    let json = null
    const text = await res.text()
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    return { status: res.status, json, text, headers: Object.fromEntries(res.headers) }
  }

  get(path) {
    return this.request('GET', path)
  }
  post(path, body) {
    return this.request('POST', path, typeof body === 'string' ? body : body ?? undefined)
  }
}

async function run() {
  const anon = new Client()
  const user = new Client()
  console.log('# Clean Phase 8 observability verification')

  console.log('\nHealth (public)')
  const health = await anon.get('/api/health')
  check('GET /api/health → 200 anonymous', health.status === 200, `status=${health.status}`)
  check(
    'Health reports ok + 100 (clean state)',
    health.json?.status === 'ok' && health.json?.systemHealth === 100,
    JSON.stringify(health.json),
  )

  console.log('\nAuth gating')
  const anonSummary = await anon.get('/api/observability/summary')
  check('Summary requires auth → 401', anonSummary.status === 401, `status=${anonSummary.status}`)
  const anonIncidents = await anon.get('/api/incidents')
  check('Incidents require auth → 401', anonIncidents.status === 401, `status=${anonIncidents.status}`)
  const anonLogs = await anon.get('/api/logs')
  check('Logs require auth → 401', anonLogs.status === 401, `status=${anonLogs.status}`)
  const anonReport = await anon.post('/api/incidents/nope/report')
  check('Report requires auth → 401', anonReport.status === 401, `status=${anonReport.status}`)

  console.log('\nAuthentication')
  const login = await user.post('/api/auth/login', { identifier: 'arjun', password: 'buildhub-demo1' })
  check('Demo login arjun → 200', login.status === 200, `status=${login.status}`)
  check('Login returns safe user (no secret fields)', login.json?.user && !('passwordHash' in login.json.user), JSON.stringify(login.json))

  console.log('\nClean baseline')
  const summary = await user.get('/api/observability/summary')
  check('GET summary → 200', summary.status === 200, `status=${summary.status}`)
  const ov = summary.json?.overview
  check(
    'riskScore = 0',
    ov?.riskScore === 0,
    `got ${ov?.riskScore} (state must be wiped; run reset-observability.mjs)`,
  )
  check('cyberSafetyScore = 100', ov?.cyberSafetyScore === 100, `got ${ov?.cyberSafetyScore}`)
  check('systemHealth = 100', ov?.systemHealth === 100, `got ${ov?.systemHealth}`)
  check('activeIncidents = 0', ov?.activeIncidents === 0, `got ${ov?.activeIncidents}`)

  const components = Object.fromEntries(
    (summary.json?.components ?? []).map((c) => [c.name, c.status]),
  )
  check('frontend healthy', components.frontend === 'healthy', JSON.stringify(components))
  check('api healthy', components.api === 'healthy', JSON.stringify(components))
  check('database healthy', components.database === 'healthy', JSON.stringify(components))
  check('authentication healthy', components.authentication === 'healthy', JSON.stringify(components))
  check('monitoring healthy', components.monitoring === 'healthy', JSON.stringify(components))

  const events = summary.json?.securityEvents ?? []
  check('Zero derived security findings (clean state)', events.length === 0, `got ${events.length}`)

  console.log('\nIncidents API')
  const active = await user.get('/api/incidents?status=DETECTED,INVESTIGATING&pageSize=10')
  check('status=DETECTED,INVESTIGATING → 0 incidents', active.json?.incidents?.length === 0, `got ${active.json?.incidents?.length}`)
  const resolved = await user.get('/api/incidents?status=RESOLVED,ROLLED_BACK&pageSize=10')
  check('History list is empty', resolved.json?.incidents?.length === 0, `got ${resolved.json?.incidents?.length}`)
  const filtered = await user.get('/api/incidents?severity=HIGH')
  check('severity=HIGH → 0 incidents', filtered.json?.incidents?.length === 0, `got ${filtered.json?.incidents?.length}`)

  const missing = await user.get('/api/incidents/does-not-exist')
  check('Unknown incident → 404', missing.status === 404, `status=${missing.status}`)

  console.log('\nLogs API')
  const errors = await user.get('/api/logs?level=ERROR&pageSize=20')
  check('level=ERROR returns 0 rows', errors.json?.logs?.length === 0, `got ${errors.json?.logs?.length}`)
  const warnings = await user.get('/api/logs?level=WARN&pageSize=20')
  check('level=WARN returns 0 rows', warnings.json?.logs?.length === 0, `got ${warnings.json?.logs?.length}`)
  const securities = await user.get('/api/logs?level=SECURITY&pageSize=20')
  check('level=SECURITY returns 0 rows', securities.json?.logs?.length === 0, `got ${securities.json?.logs?.length}`)

  console.log('\nReport API')
  const reportMissing = await user.post('/api/incidents/does-not-exist/report')
  check('Report for unknown incident → 404', reportMissing.status === 404, `status=${reportMissing.status}`)

  console.log('\nCross-check: scores are pure state functions')
  const again = await user.get('/api/observability/summary')
  check('Second read yields identical risk/health', again.json?.overview?.riskScore === 0 && again.json?.overview?.systemHealth === 100, JSON.stringify(again.json?.overview))

  // ---------------------------------------------------------------------------
  console.log('\n' + '='.repeat(52))
  console.log(`Clean observability verification: ${passed} passed, ${failed} failed`)
  if (failures.length) {
    console.log('Failures:')
    for (const f of failures) console.log(`  - ${f}`)
  }
  process.exitCode = failed > 0 ? 1 : 0
}

run().catch((err) => {
  console.error('Verification crashed:', err)
  process.exitCode = 1
})