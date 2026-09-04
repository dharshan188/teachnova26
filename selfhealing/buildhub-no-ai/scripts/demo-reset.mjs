// BuildHub — No-AI Demo
//
// `npm run demo:reset` restores the clean starting state of the demo:
//   1. If the dev/demo server is running: sign in and POST /api/demo/fault
//      `reset` — deactivates LOW-01 in-memory and clears the demo log trail.
//   2. Otherwise: clear any leftover demo LogEvent rows directly from the DB
//      (a stopped server holds no in-memory fault state to undo).
// Real application code is never touched.

import 'dotenv/config'
import { readFileSync } from 'node:fs'

const base = process.env.DEMO_BASE ?? `http://localhost:${process.env.PORT ?? 3001}`
const identifier = process.env.DEMO_USER ?? 'arjun'
const password = process.env.DEMO_PASSWORD ?? 'buildhub-demo1'

function fail(message) {
  console.error(`[demo:reset] FAIL ${message}`)
  process.exit(1)
}

async function serverReachable() {
  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

async function clearLogsDirect() {
  // Prisma 7 requires an explicit driver adapter — mirror the application's
  // working initialization (see prisma/seed.mjs and lib/server/db.ts).
  const { PrismaClient } = await import('@prisma/client')
  const { PrismaPg } = await import('@prisma/adapter-pg')
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) fail('DATABASE_URL is required')
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  try {
    // Clear the leftover LOW-01 demo fault log trail (same rows the
    // /api/demo/fault reset clears when the server is reachable).
    await prisma.logEvent.deleteMany({
      where: {
        OR: [{ service: 'fault-injection' }, { service: 'demo' }, { route: '/api/posts' }],
      },
    })
    // Clear the No-AI availability latch (attack rows) so /health returns to
    // healthy. Unlike the in-app resetAvailability()/boot-clean (which only
    // scrub the last 24h), the reset must also clear stale rows left from an
    // earlier run — otherwise an old ATTACK_UNAVAILABLE / AUTH_FAILED batch
    // older than 24h keeps the latch perpetually latched. Clear them without
    // an age cutoff.
    await prisma.logEvent.deleteMany({
      where: {
        OR: [
          { service: 'attack' },
          { errorCode: { in: ['AUTH_FAILED', 'ATTACK_DEGRADED', 'ATTACK_UNAVAILABLE'] } },
        ],
      },
    })
    console.log(`[demo:reset] Cleared leftover demo + availability LogEvent rows (DB).`)
  } finally {
    await prisma.$disconnect()
  }
}

async function resetViaApi() {
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  })
  if (!login.ok) fail(`login returned HTTP ${login.status}`)
  const setCookie = login.headers.getSetCookie?.().join(';') ?? login.headers.get('set-cookie') ?? ''
  const sessionCookie = setCookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('buildhub_session='))
  if (!sessionCookie) fail('login did not return a buildhub_session cookie')

  const headers = { 'content-type': 'application/json', cookie: sessionCookie }

  const reset = await fetch(`${base}/api/demo/fault`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'reset' }),
  })
  if (!reset.ok) fail(`reset returned HTTP ${reset.status}`)
  const state = await reset.json()

  try {
    await fetch(`${base}/api/auth/logout`, { method: 'POST', headers })
  } catch {
    // Logout cleanup is best-effort; the reset already succeeded.
  }

  console.log(
    `[demo:reset] LOW-01 ${state.active ? 'STILL ACTIVE' : 'deactivated'} — demo log trail cleared.`,
  )
  if (state.active) fail('fault is still active after reset')
}

if (!(await serverReachable())) {
  console.log('[demo:reset] Server not reachable — no in-memory fault state to undo.')
  await clearLogsDirect()
  console.log('[demo:reset] Clean starting state restored.')
  process.exit(0)
}

await resetViaApi()
console.log('[demo:reset] Clean starting state restored.')