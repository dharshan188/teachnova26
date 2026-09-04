#!/usr/bin/env node
/**
 * End-to-end verification of BuildHub's Telegram alert-delivery surface.
 *
 * Layers checked (all against REAL persisted state — never fabricated):
 *
 *   1. App HTTP surface (requires a running server, default localhost:3000):
 *      - operator login
 *      - GET /api/security/status → telegram.status block reports real
 *        bot connectivity (reachable, botUsername, latencyMs) via getMe
 *      - POST /api/telegram/test → a real TEST message is sent and the
 *        delivery row (SENT + telegramMessageId) is persisted and returned
 *
 *   2. Database schema (requires DATABASE_URL in .env):
 *      - DeliveryStatus enum contains SKIPPED_DUPLICATE
 *      - NotificationType enum contains FINAL_SUMMARY (+ the repair types)
 *      - migration 20260830120000_add_telegram_summary_types is recorded
 *      - no @@unique on [incidentId, type] (append-only delivery model)
 *
 * Run:  node scripts/test-telegram-integration.mjs
 *       node scripts/test-telegram-integration.mjs --skip-send
 *       BASE_URL=http://localhost:3000 node scripts/test-telegram-integration.mjs
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CWD = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const SKIP_SEND = process.argv.includes('--skip-send')
const ENV_PATH = resolve(CWD, '../.env')

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

function loadEnv() {
  const vars = {}
  if (!existsSync(ENV_PATH)) return vars
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const clean = line.trim()
    if (!clean || clean.startsWith('#')) continue
    const eq = clean.indexOf('=')
    if (eq === -1) continue
    const key = clean.slice(0, eq).trim()
    let value = clean.slice(eq + 1).trim()
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    vars[key] = value
  }
  return vars
}

function tokenFromSetCookie(setCookie) {
  const match = setCookie && setCookie.match(/buildhub_session=[^;]+/)
  return match ? match[0] : null
}

let cookie = ''
async function api(method, path, body) {
  const headers = cookie ? { Cookie: cookie } : {}
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
    if (token) cookie = token
  }
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { status: res.status, json, text }
}

async function verifyAppSurface() {
  console.log('\n# 1. App HTTP surface (live server)')

  const login = await api('POST', '/api/auth/login', {
    identifier: 'arjun',
    password: 'buildhub-demo1',
  })
  check('Operator login arjun → 200', login.status === 200, `status=${login.status}`)

  const status = await api('GET', '/api/security/status')
  check('GET /api/security/status → 200', status.status === 200, `status=${status.status}`)
  const telegram = status.json?.telegram
  check('telegram block present', Boolean(telegram), 'missing telegram block')
  check('TELEGRAM_BOT_TOKEN configured', telegram?.configured === true, JSON.stringify(telegram?.configured))

  const reachable = telegram?.status?.reachable === true
  check(
    'Bot reachable via IPv4-forced getMe',
    reachable,
    `reachable=${telegram?.status?.reachable} error=${telegram?.status?.error ?? '—'}`,
  )
  if (telegram?.status?.botUsername) {
    check('Bot username returned', /^\w+$/.test(telegram.status.botUsername), telegram.status.botUsername)
  }
  if (telegram?.status?.latencyMs != null) {
    check('getMe latency measured', telegram.status.latencyMs > 0 && telegram.status.latencyMs < 15000, `${telegram.status.latencyMs}ms`)
  }
  check('lastIncident block present', Boolean(telegram?.lastIncident), 'missing lastIncident')

  if (!reachable && !SKIP_SEND) {
    console.error('\nBot is not reachable — refusing to attempt a test send (would only record FAILED). Re-run with --skip-send for schema-only checks.')
    failed += 1
    failures.push('bot not reachable')
    return
  }

  if (SKIP_SEND) {
    console.log('\n  (--skip-send: no test message sent)')
  } else {
    const start = Date.now()
    const send = await api('POST', '/api/telegram/test', {})
    const elapsed = Date.now() - start
    check('POST /api/telegram/test → 200', send.status === 200, `status=${send.status}`)
    const result = send.json
    check('test send ok:true', result?.ok === true, JSON.stringify(result?.ok))
    check('delivery persisted as SENT', result?.deliveryStatus === 'SENT', result?.deliveryStatus)
    check('telegram message id returned', Boolean(result?.telegramMessageId), String(result?.telegramMessageId))
    check('took under Test-Time API budget', elapsed < 20000, `${elapsed}ms`)
    const hasRecent = (result?.recent ?? []).some(
      (r) => r.type === 'TEST' && r.deliveryStatus === 'SENT',
    )
    check('recent feed includes the SENT TEST row', hasRecent, JSON.stringify(result?.recent?.[0]))
  }

  // Incident detail contract: terminalSummary + telegram.deliveries.
  const incidents = await api('GET', '/api/incidents')
  const rows = incidents.json?.incidents ?? []
  if (rows.length > 0 && !SKIP_SEND) {
    const first = rows[0]
    const detail = await api('GET', `/api/incidents/${first.id}`)
    check('Incident detail → 200', detail.status === 200, `status=${detail.status}`)
    check('detail.telegram.deliveries is an array', Array.isArray(detail.json?.incident?.telegram?.deliveries), 'missing deliveries')
    check(
      'terminalSummary null/object contract',
      detail.json?.incident?.terminalSummary === null || typeof detail.json?.incident?.terminalSummary === 'object',
      'unexpected type',
    )
  } else {
    console.log('\n  (no incidents to contract-check detail/telegram; schematic verified via DB above)')
  }
}

async function verifySchema() {
  const env = loadEnv()
  if (!env.DATABASE_URL) {
    console.log('\n# 2. Database schema — skipped (no DATABASE_URL in frontend/.env)')
    return
  }
  console.log('\n# 2. Database schema (real Postgres via prisma adapter)')
  const { PrismaClient } = await import('@prisma/client')
  const { PrismaPg } = await import('@prisma/adapter-pg')
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })
  const prisma = new PrismaClient({ adapter })
  try {
    const deliveryStatus = await prisma.$queryRawUnsafe('SELECT unnest(enum_range(NULL::"DeliveryStatus")) AS v')
    const values = new Set(deliveryStatus.map((row) => row.v))
    for (const expected of ['QUEUED', 'SENT', 'FAILED', 'SKIPPED_DUPLICATE']) {
      check(`DeliveryStatus contains ${expected}`, values.has(expected), JSON.stringify([...values]))
    }

    const notificationTypes = await prisma.$queryRawUnsafe('SELECT unnest(enum_range(NULL::"NotificationType")) AS v')
    const ntypes = new Set(notificationTypes.map((row) => row.v))
    for (const expected of [
      'INCIDENT',
      'ESCALATION',
      'TEST',
      'HIGH_RISK_APPROVAL_REQUIRED',
      'REPAIR_APPLIED',
      'REPAIR_FAILED',
      'ROLLBACK_COMPLETED',
      'RECOVERY',
      'FINAL_SUMMARY',
    ]) {
      check(`NotificationType contains ${expected}`, ntypes.has(expected), JSON.stringify([...ntypes]))
    }

    const migration = await prisma.$queryRawUnsafe(
      'SELECT migration_name FROM _prisma_migrations WHERE migration_name = $1',
      '20260830120000_add_telegram_summary_types',
    )
    check(
      'migration 20260830120000 recorded',
      migration.length === 1,
      `found ${migration.length} rows (state must not have been reset)`,
    )

    const uniqueIndex = await prisma.$queryRawUnsafe(
      `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'TelegramNotification' AND indexdef ILIKE '%UNIQUE%'`,
    )
    const hasUnique = uniqueIndex.some((row) => row.indexdef.includes('incidentId') && row.indexdef.includes('type'))
    check(
      'NO unique constraint on (incidentId, type) — append-only dedupe model',
      !hasUnique,
      hasUnique ? JSON.stringify(uniqueIndex) : '',
    )
  } finally {
    await prisma.$disconnect()
  }
}

async function run() {
  console.log('# BuildHub Telegram alert-delivery verification')
  console.log(`BASE=${BASE} · skip-send=${SKIP_SEND}`)
  await verifyAppSurface()
  await verifySchema()

  console.log('\n' + '='.repeat(52))
  console.log(`Telegram integration: ${passed} passed, ${failed} failed`)
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