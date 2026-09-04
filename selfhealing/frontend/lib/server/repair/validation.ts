import 'server-only'

// Phase 9 — real HTTP validation probes. After a patch is applied the affected
// endpoint is probed with documented requests; the healthy outcome is asserted
// deterministically. All probes run against the local development server —
// there is never a random/guessed verdict.

import type { Incident } from '@prisma/client'
import { getFault } from '@/lib/server/fault-injection'

const BASE_URL = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'buildhub-demo1'
const PROBE_TIMEOUT_MS = 20_000

export interface ProbeResult {
  name: string
  method: string
  path: string
  ok: boolean
  expected: string
  actual: string
}

interface ProbeEnv {
  arjunCookie: string
  meeraCookie: string
  postId: string | null
  ownerProjectId: string | null
  foreignProjectId: string | null
}

type ProbeFn = (env: ProbeEnv) => Promise<ProbeResult>

interface ProbeSpec {
  name: string
  method: string
  path: string
  fn: ProbeFn
}

async function request(
  method: string,
  path: string,
  opts: { cookie?: string; body?: unknown } = {},
): Promise<{ status: number; body: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(opts.cookie ? { Cookie: opts.cookie } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
      redirect: 'manual',
    })
    return { status: res.status, body: await res.text() }
  } finally {
    clearTimeout(timer)
  }
}

function jsonOf<T>(result: { body: string }): T | null {
  try {
    return JSON.parse(result.body) as T
  } catch {
    return null
  }
}

async function sessionCookie(username: string): Promise<string | null> {
  const raw = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: username, password: DEMO_PASSWORD }),
    redirect: 'manual',
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  })
  const setCookie = raw.headers.get('set-cookie')
  if (!setCookie) return null
  return setCookie.split(';')[0] ?? null
}

async function ensureForeignProject(meeraCookie: string): Promise<string | null> {
  const create = await request('POST', '/api/projects', {
    cookie: meeraCookie,
    body: { name: `__repair_probe_${Date.now()}`, description: 'repair validation probe project' },
  })
  const parsed = jsonOf<{ project?: { id: string } }>(create)
  return parsed?.project?.id ?? null
}

async function cleanupForeignProject(meeraCookie: string, projectId: string): Promise<void> {
  await request('DELETE', `/api/projects/${projectId}`, { cookie: meeraCookie })
}

async function buildProbeEnv(): Promise<ProbeEnv> {
  const arjunCookie = (await sessionCookie('arjun')) ?? ''
  const meeraCookie = (await sessionCookie('meera')) ?? ''
  const env: ProbeEnv = { arjunCookie, meeraCookie, postId: null, ownerProjectId: null, foreignProjectId: null }

  if (arjunCookie) {
    const posts = await request('GET', '/api/posts?pageSize=3', { cookie: arjunCookie })
    env.postId = jsonOf<{ posts?: Array<{ id: string }> }>(posts)?.posts?.[0]?.id ?? null

    const projects = await request('GET', '/api/projects?pageSize=50', { cookie: arjunCookie })
    env.ownerProjectId = jsonOf<{ projects?: Array<{ id: string }> }>(projects)?.projects?.[0]?.id ?? null
  }
  return env
}

export function probeSpecsFor(faultId: string): ProbeSpec[] {
  const statusProbe = (name: string, method: string, path: string, expectedStatus: number, healthy: string): ProbeFn =>
    async (env) => {
      const res = await request(method, path, { cookie: env.arjunCookie })
      const ok = res.status === expectedStatus
      return { name, method, path, ok, expected: `${expectedStatus} (${healthy})`, actual: `${res.status}${res.body ? ` · ${res.body.slice(0, 120)}` : ''}` }
    }

  switch (faultId) {
    case 'LOW-01':
    case 'MEDIUM-01':
      return [{ name: 'Post creation succeeds', method: 'POST', path: '/api/posts', fn: async (env) => {
        const res = await request('POST', '/api/posts', { cookie: env.arjunCookie, body: { content: 'A healthy post used for validation probing.', tags: ['probe'] } })
        return { name: 'Post creation succeeds', method: 'POST', path: '/api/posts', ok: res.status === 201, expected: '201 (post created)', actual: `${res.status}${res.body ? ` · ${res.body.slice(0, 120)}` : ''}` }
      } }]
    case 'LOW-02':
      return [{
        name: 'Post response contract has post key',
        method: 'GET',
        path: '/api/posts/{postId}',
        fn: async (env) => {
          if (!env.postId) return { name: 'Post response contract has post key', method: 'GET', path: '/api/posts/{postId}', ok: false, expected: 'a post exists', actual: 'no post id resolved' }
          const res = await request('GET', `/api/posts/${env.postId}`, { cookie: env.arjunCookie })
          const parsed = jsonOf<{ post?: unknown; poost?: unknown }>(res)
          const ok = res.status === 200 && parsed !== null && 'post' in parsed && !('poost' in parsed)
          return {
            name: 'Post response contract has post key',
            method: 'GET',
            path: `/api/posts/${env.postId}`,
            ok,
            expected: '200 with post key',
            actual: `${res.status} keys: ${parsed ? Object.keys(parsed).join(',') : res.body.slice(0, 80)}`,
          }
        },
      }]
    case 'LOW-03':
      return [{ name: 'Short post accepted', method: 'POST', path: '/api/posts', fn: async (env) => {
        const res = await request('POST', '/api/posts', { cookie: env.arjunCookie, body: { content: 'A short healthy post used for validation probing.', tags: ['probe'] } })
        return { name: 'Short post accepted', method: 'POST', path: '/api/posts', ok: res.status === 201, expected: '201 (short content accepted)', actual: `${res.status}` }
      } }]
    case 'MEDIUM-02':
      return [{ name: 'Feed loads', method: 'GET', path: '/api/posts', fn: statusProbe('Feed loads', 'GET', '/api/posts', 200, 'feed returned') }]
    case 'MEDIUM-03':
      return [{ name: 'Owner can update own project', method: 'PATCH', path: '/api/projects/{projectId}', fn: async (env) => {
        if (!env.ownerProjectId) return { name: 'Owner can update own project', method: 'PATCH', path: '/api/projects/{projectId}', ok: false, expected: 'a project exists', actual: 'no project id resolved' }
        const res = await request('PATCH', `/api/projects/${env.ownerProjectId}`, { cookie: env.arjunCookie, body: { description: 'validation probe description' } })
        return { name: 'Owner can update own project', method: 'PATCH', path: `/api/projects/${env.ownerProjectId}`, ok: res.status === 200, expected: '200 (owner allowed)', actual: `${res.status}` }
      } }]
    case 'HIGH-01':
      return [{ name: 'Wrong password rejected', method: 'POST', path: '/api/auth/login', fn: async () => {
        const res = await request('POST', '/api/auth/login', { body: { identifier: 'arjun', password: 'definitely-wrong-password' } })
        return { name: 'Wrong password rejected', method: 'POST', path: '/api/auth/login', ok: res.status === 401, expected: '401 (wrong password rejected)', actual: `${res.status}` }
      } }]
    case 'HIGH-02':
      return [{ name: 'Non-owner cannot delete project', method: 'DELETE', path: '/api/projects/{foreignProjectId}', fn: async (env) => {
        if (!env.foreignProjectId) return { name: 'Non-owner cannot delete project', method: 'DELETE', path: '/api/projects/{foreignProjectId}', ok: false, expected: '403 for non-owner', actual: 'no foreign project id resolved' }
        const res = await request('DELETE', `/api/projects/${env.foreignProjectId}`, { cookie: env.arjunCookie })
        return { name: 'Non-owner cannot delete project', method: 'DELETE', path: `/api/projects/${env.foreignProjectId}`, ok: res.status === 403, expected: '403 (non-owner denied)', actual: `${res.status}` }
      } }]
    case 'HIGH-03':
      return [{ name: 'Database-backed endpoint healthy', method: 'GET', path: '/api/posts', fn: statusProbe('Database-backed endpoint healthy', 'GET', '/api/posts', 200, 'feed returned') }]
    default:
      return []
  }
}

/**
 * Runs the real HTTP probes for an incident's fault. `foreignForHigh02` creates
 * a throwaway project owned by a different user so the non-owner probe has a
 * target; it is cleaned up afterwards.
 */
export async function runValidationProbes(
  _incident: Incident,
  faultId: string | null,
): Promise<ProbeResult[]> {
  if (!faultId) {
    const health = await request('GET', '/api/health')
    return [{ name: 'Generic health probe', method: 'GET', path: '/api/health', ok: health.status === 200, expected: '200 (app reachable)', actual: `${health.status}` }]
  }

  const env = await buildProbeEnv()
  if (faultId === 'HIGH-02' && env.meeraCookie) {
    env.foreignProjectId = await ensureForeignProject(env.meeraCookie)
  }

  const specs = probeSpecsFor(faultId)
  const results = await Promise.all(specs.map((spec) => spec.fn(env)))

  if (faultId === 'HIGH-02' && env.foreignProjectId) {
    await cleanupForeignProject(env.meeraCookie, env.foreignProjectId)
  }
  return results
}