#!/usr/bin/env node
/**
 * Deterministic verification of the Phase 8 security surface.
 *
 * Requires a running BuildHub server (default http://localhost:3000, override
 * with BASE_URL) and a CLEAN database (run scripts/reset-observability.mjs
 * first). Clean state assertions: risk 0, tier "dashboard", zero findings,
 * zero incidents, zero Telegram notifications.
 *
 * Gate matrix verified:
 *   anonymous           401 on findings / ingest / run / status / telegram-test
 *   operator (arjun)    canOperate true, full WRITE surface
 *   non-operator (meera) canOperate false, WRITE surface → 403
 *   zod validation      400 on malformed findings / run payloads
 *
 * Groq + Telegram connectivity come from the status endpoint's model/telegram
 * blocks (never printed here).
 *
 * Run: node scripts/verify-security.mjs
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
    return { status: res.status, json, text }
  }

  get(path) {
    return this.request('GET', path)
  }
  post(path, body) {
    return this.request('POST', path, body ?? undefined)
  }
}

function validFinding(overrides = {}) {
  return {
    ruleId: 'auth-failure-burst',
    severity: 'HIGH',
    title: 'Repeated authentication failures (verification)',
    description: 'verification finding',
    detail: 'verification',
    method: 'POST',
    endpoint: '/api/auth/login',
    hitCount: 4,
    windowStartMs: Date.now() - 60000,
    windowEndMs: Date.now(),
    signals: { count: 4, route: '/api/auth/login' },
    ...overrides,
  }
}

async function run() {
  const anon = new Client()
  const operator = new Client()
  const meera = new Client()
  console.log('# Phase 8 security verification (clean state)')

  console.log('\nAnonymous gating')
  const endpoints = [
    ['/api/security/status', 'GET', null],
    ['/api/security/findings', 'POST', validFinding()],
    ['/api/security/findings', 'GET', null],
    ['/api/security/ingest', 'POST', { findingIds: [] }],
    ['/api/security/run', 'POST', { incidentId: 'x' }],
    ['/api/telegram/test', 'POST', {}],
  ]
  for (const [path, method, body] of endpoints) {
    const res = method === 'GET' ? await anon.get(path) : await anon.post(path, body)
    // entries with a body carry sensitive data / mutate: anonymous must never
    // reach them (401). GETs on POST-only routes must not succeed (405/401).
    const allowed = body !== null ? res.status === 401 : [401, 405].includes(res.status)
    check(`${method} ${path} anonymous blocked → ${allowed ? '401/405' : 'unexpected'}`, allowed, `status=${res.status}`)
  }

  console.log('\nOperator authentication')
  const login = await operator.post('/api/auth/login', { identifier: 'arjun', password: 'buildhub-demo1' })
  check('Operator login arjun → 200', login.status === 200, `status=${login.status}`)
  const meeraLogin = await meera.post('/api/auth/login', { identifier: 'meera', password: 'buildhub-demo1' })
  check('Non-operator login meera → 200', meeraLogin.status === 200, `status=${meeraLogin.status}`)

  console.log('\nStatus endpoint contract')
  const status = await operator.get('/api/security/status')
  check('GET /api/security/status → 200', status.status === 200, `status=${status.status}`)
  const s = status.json
  check('canOperate true for operator', s?.canOperate === true, JSON.stringify(s?.canOperate))
  check('operators includes arjun', Array.isArray(s?.operators) && s.operators.includes('arjun'), JSON.stringify(s?.operators))
  check('tiers table has 4 tiers', JSON.stringify(s?.tiers?.table) === JSON.stringify(['dashboard', 'incident', 'heightened', 'critical']), JSON.stringify(s?.tiers?.table))
  check('overview present', s?.overview && typeof s.overview.riskScore === 'number')

  console.log('\nClean baseline')
  check('riskScore = 0', s?.overview?.riskScore === 0, `got ${s?.overview?.riskScore} (state must be wiped)`)
  check('tier = dashboard', s?.tier === 'dashboard', `got ${s?.tier}`)
  check('zero findings', (s?.findings ?? []).length === 0, `got ${s?.findings?.length}`)
  check('zero incidents', (s?.incidents ?? []).length === 0, `got ${s?.incidents?.length}`)
  check('zero telegram history', (s?.telegram?.recent ?? []).length === 0, `got ${s?.telegram?.recent?.length}`)

  console.log('\nGroq + Telegram configuration')
  check('model provider = groq', s?.model?.provider === 'groq', JSON.stringify(s?.model?.provider))
  check('model configured (non-empty)', Boolean(s?.model?.configured), JSON.stringify(s?.model?.configured))
  check(
    'model valid (true, or null when Groq unreachable)',
    s?.model?.valid === true || s?.model?.valid === null,
    JSON.stringify(s?.model?.valid),
  )
  check('telegram configured', s?.telegram?.configured === true, JSON.stringify(s?.telegram?.configured))

  console.log('\nNon-operator authorization')
  const meeraStatus = await meera.get('/api/security/status')
  check('Status readable by non-operator → 200', meeraStatus.status === 200, `status=${meeraStatus.status}`)
  check('canOperate false for meera', meeraStatus.json?.canOperate === false, JSON.stringify(meeraStatus.json?.canOperate))
  const forbidMod = [
    ['/api/security/findings', 'POST', validFinding()],
    ['/api/security/ingest', 'POST', { findingIds: ['x'] }],
    ['/api/security/run', 'POST', { incidentId: 'does-not-exist' }],
    ['/api/telegram/test', 'POST', {}],
  ]
  for (const [path, method, body] of forbidMod) {
    const res = await meera.post(path, body)
    check(`meera ${method} ${path} → 403`, res.status === 403, `status=${res.status}`)
  }

  console.log('\nValidation (operator)')
  const badSeverity = await operator.post('/api/security/findings', validFinding({ severity: 'EXTREME' }))
  check('findings with bad severity → 400', badSeverity.status === 400, `status=${badSeverity.status}`)
  const noRule = await operator.post('/api/security/findings', validFinding({ ruleId: '' }))
  check('findings with empty ruleId → 400', noRule.status === 400, `status=${noRule.status}`)
  const runMissing = await operator.get('/api/security/run')
  check('GET /api/security/run → 405/400 (not 200)', runMissing.status === 405 || runMissing.status === 400, `status=${runMissing.status}`)
  const runInvalid = await operator.post('/api/security/run', {})
  check('run with empty body → 400', runInvalid.status === 400, `status=${runInvalid.status}`)

  // ---------------------------------------------------------------------------
  console.log('\n' + '='.repeat(52))
  console.log(`Security verification: ${passed} passed, ${failed} failed`)
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