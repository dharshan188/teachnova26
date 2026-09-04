'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Icon, type IconName } from '@/components/ui/icon'
import { cn } from '@/lib/cn'

// BuildHub — "Same Attack" comparison (WITHOUT-AI vs WITH-AI)
//
// Two side-by-side panels showing the SAME controlled authentication-failure
// burst (loopback only) against the WITHOUT-AI build on :3001 and the WITH-AI
// build on :3000. Every value rendered here is REAL backend state fetched from
// live telemetry — no simulated progress, no fabricated health, no fake AI.

interface HealthInfo {
  status?: string
  availability?: string
  latencyMs?: number
  checkedAt?: string
  systemHealth?: number | string
  components?: Array<{ name?: string; label?: string; status?: string; detail?: string }>
  detail?: string
}

interface StateInfo {
  failCount?: number
  activeFailures?: number
  threshold?: number
  windowMs?: number
  blockMs?: number
  blocked?: boolean
  blockedUntil?: string | null
  blockedCount?: number
  degradeThreshold?: number
  failThreshold?: number
  firstFailureAt?: string | null
  degradedAt?: string | null
  unavailableAt?: string | null
}

interface IncidentInfo {
  ref?: string
  severity?: string
  status?: string
  riskScore?: number
  title?: string
  createdAt?: string
}

interface AgentRunInfo {
  agent?: string
  status?: string
  progress?: number | null
  currentActivity?: string | null
  round?: number
  mode?: string
}

interface EventEntry {
  id: string
  level: string
  service: string
  message: string
  route: string | null
  method: string | null
  status: number | null
  errorCode: string | null
  createdAt: string
}

interface Timestamps {
  firstFailureAt?: string | null
  detectedAt?: string | null
  mitigatedAt?: string | null
}

interface Telemetry {
  build?: string
  port?: number
  source?: string
  phase?: string
  error?: string
  state?: StateInfo
  health?: HealthInfo
  incident?: IncidentInfo | null
  agentRuns?: AgentRunInfo[]
  timestamps?: Timestamps
  events?: EventEntry[]
}

function deltaSeconds(later: string | null | undefined, earlier: string | null | undefined): string {
  if (!later || !earlier) return '—'
  const a = new Date(later).getTime()
  const b = new Date(earlier).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return '—'
  return `${(Math.max(0, a - b) / 1000).toFixed(1)}s`
}

function toLocale(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString()
}

interface Step {
  id: string
  label: string
  reached: boolean
  current: boolean
}

function noaiSteps(phase: string, state: StateInfo, health: HealthInfo): Step[] {
  const failCount = state.failCount ?? 0
  const degradeThreshold = state.degradeThreshold ?? 40
  const spikeFrom = Math.ceil(degradeThreshold * 0.5)
  const degraded = phase === 'degraded' || phase === 'unavailable'
  const attack = failCount > 0 || degraded
  const trafficSpike = failCount >= spikeFrom || degraded
  const serviceUnavailable = phase === 'unavailable'
  const errorPage = serviceUnavailable && health.status === 'unavailable'
  let current = 'NORMAL'
  if (phase !== 'normal') {
    if (!trafficSpike) current = 'ATTACK'
    else if (!degraded) current = 'TRAFFIC SPIKE'
    else if (!serviceUnavailable) current = 'RESOURCE PRESSURE'
    else current = 'SERVICE UNAVAILABLE'
  }
  return [
    { id: 'n1', label: 'NORMAL', reached: true, current: current === 'NORMAL' },
    { id: 'n2', label: 'ATTACK', reached: attack, current: current === 'ATTACK' },
    { id: 'n3', label: 'TRAFFIC SPIKE', reached: trafficSpike, current: current === 'TRAFFIC SPIKE' },
    { id: 'n4', label: 'RESOURCE PRESSURE', reached: degraded, current: current === 'RESOURCE PRESSURE' },
    { id: 'n5', label: 'SERVICE UNAVAILABLE', reached: serviceUnavailable, current: current === 'SERVICE UNAVAILABLE' },
    { id: 'n6', label: '503 ERROR PAGE', reached: errorPage, current: current === 'SERVICE UNAVAILABLE' && errorPage },
  ]
}

const AI_AGENTS = ['FIXER', 'CRITIC', 'JUDGE']

function aiSteps(
  phase: string,
  state: StateInfo,
  health: HealthInfo,
  timestamps: Timestamps,
  agentRuns: AgentRunInfo[],
  incident: IncidentInfo | null,
  events: EventEntry[],
): Step[] {
  const failCount = state.failCount ?? 0
  const blockedCount = state.blockedCount ?? 0
  const runs = agentRuns ?? []
  const has429 = blockedCount > 0 || events.some((e) => e.errorCode === 'IP_BLOCKED' || e.status === 429)
  const attack = failCount > 0 || ['attack', 'detected', 'mitigating', 'recovered'].includes(phase)
  const detected =
    Boolean(timestamps.detectedAt) || has429 || ['detected', 'mitigating', 'recovered'].includes(phase)
  const fixer = runs.some((r) => r.agent === 'FIXER')
  const critic = runs.some((r) => r.agent === 'CRITIC')
  const judge = runs.some((r) => r.agent === 'JUDGE')
  const risk = Boolean(incident && incident.riskScore != null)
  const mitigation = phase === 'mitigating' || (has429 && ['detected', 'mitigating', 'recovered'].includes(phase))
  const healthy = phase === 'recovered' && health.status === 'ok'
  let current = 'NORMAL'
  if (healthy) current = 'SERVICE HEALTHY'
  else if (phase === 'mitigating') current = 'MITIGATION'
  else if (has429) current = '429 BLOCK'
  else if (judge) current = 'JUDGE'
  else if (critic) current = 'CRITIC'
  else if (fixer) current = 'CODER'
  else if (detected) current = 'DETECTION'
  else if (attack) current = 'ATTACK'
  return [
    { id: 'a1', label: 'NORMAL', reached: true, current: current === 'NORMAL' },
    { id: 'a2', label: 'ATTACK', reached: attack, current: current === 'ATTACK' },
    { id: 'a3', label: 'DETECTION', reached: detected, current: current === 'DETECTION' },
    { id: 'a4', label: 'CODER', reached: fixer, current: current === 'CODER' },
    { id: 'a5', label: 'CRITIC', reached: critic, current: current === 'CRITIC' },
    { id: 'a6', label: 'JUDGE', reached: judge, current: current === 'JUDGE' },
    { id: 'a7', label: 'RISK', reached: risk, current: false },
    { id: 'a8', label: 'MITIGATION', reached: mitigation, current: current === 'MITIGATION' },
    { id: 'a9', label: '429 BLOCK', reached: has429, current: current === '429 BLOCK' },
    { id: 'a10', label: 'SERVICE HEALTHY', reached: healthy, current: current === 'SERVICE HEALTHY' },
  ]
}

const NOAI_STEPS = [
  { id: 'n1', label: 'NORMAL' },
  { id: 'n2', label: 'ATTACK' },
  { id: 'n3', label: 'TRAFFIC SPIKE' },
  { id: 'n4', label: 'RESOURCE PRESSURE' },
  { id: 'n5', label: 'SERVICE UNAVAILABLE' },
  { id: 'n6', label: '503 ERROR PAGE' },
]
const AI_STEPS = [
  { id: 'a1', label: 'NORMAL' },
  { id: 'a2', label: 'ATTACK' },
  { id: 'a3', label: 'DETECTION' },
  { id: 'a4', label: 'CODER' },
  { id: 'a5', label: 'CRITIC' },
  { id: 'a6', label: 'JUDGE' },
  { id: 'a7', label: 'RISK' },
  { id: 'a8', label: 'MITIGATION' },
  { id: 'a9', label: '429 BLOCK' },
  { id: 'a10', label: 'SERVICE HEALTHY' },
]

function toneFor(phase: string, build: string): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  if (phase === 'unavailable' || phase === 'down') return 'danger'
  if (phase === 'degraded' || phase === 'attack') return 'warning'
  if (phase === 'mitigating' || phase === 'detected') return 'info'
  if (phase === 'recovered' || phase === 'normal' || (build === 'ai' && phase === 'recovered')) return 'success'
  return 'neutral'
}

function Metric({ label, value, danger }: { label: string; value: string | number; danger?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-bh-line/60 py-1.5 last:border-0">
      <dt className="text-xs text-bh-muted">{label}</dt>
      <dd className={cn('font-mono text-xs font-medium text-bh-ink', danger && 'font-semibold text-bh-danger')}>
        {value}
      </dd>
    </div>
  )
}

function Timeline({ steps }: { steps: Step[] }) {
  return (
    <ol className="mt-3 space-y-1.5">
      {steps.map((step) => (
        <li key={step.id} className="flex items-center gap-2.5">
          <span
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px]',
              step.reached
                ? step.current
                  ? 'animate-pulse border-bh-accent bg-bh-accent text-white'
                  : 'border-bh-accent/60 bg-bh-accent-soft text-bh-accent'
                : 'border-bh-line bg-bh-surface-2 text-bh-faint',
            )}
          >
            {step.reached && !step.current ? <Icon name="check" size={12} /> : step.id.slice(1)}
          </span>
          <span
            className={cn(
              'text-xs font-medium tracking-wide',
              step.reached ? (step.current ? 'text-bh-ink' : 'text-bh-muted') : 'text-bh-faint',
            )}
          >
            {step.label}
          </span>
          {step.reached && step.current && <span className="text-[10px] text-bh-faint">● live</span>}
        </li>
      ))}
    </ol>
  )
}

interface PanelProps {
  build: string
  title: string
  port: number
  data: Telemetry | null
  error: string | null
  steps: Step[]
}

function Panel({ build, title, port, data, error, steps }: PanelProps) {
  const phase = data?.phase ?? (error ? 'down' : 'waiting')
  const state = data?.state ?? {}
  const health = data?.health ?? {}
  const incident = data?.incident
  const runs = data?.agentRuns ?? []
  const timestamps = data?.timestamps ?? {}
  const events = data?.events ?? []
  const tone = error ? 'danger' : toneFor(phase, build)
  const badgeLabel = error
    ? 'UNREACHABLE'
    : phase.toUpperCase()

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-bh-ink">{title}</p>
          <p className="font-mono text-xs text-bh-faint">127.0.0.1:{port}</p>
        </div>
        <Badge tone={tone} dot>
          {badgeLabel}
        </Badge>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-bh-danger">{error}</p>
      ) : !data ? (
        <p className="mt-3 text-sm text-bh-faint">Waiting for telemetry…</p>
      ) : (
        <>
          <Timeline steps={steps} />

          <dl className="mt-4 rounded-lg bg-bh-surface-2 p-3">
            {build === 'noai' ? (
              <>
                <Metric label="Failed sign-ins" value={state.failCount ?? 0} />
                <Metric
                  label="Thresholds (degrade/fail)"
                  value={`${state.degradeThreshold ?? '—'} / ${state.failThreshold ?? '—'}`}
                />
                <Metric
                  label="Time to degradation"
                  value={deltaSeconds(state.degradedAt, state.firstFailureAt)}
                />
                <Metric
                  label="Time to unavailable"
                  value={deltaSeconds(state.unavailableAt, state.firstFailureAt)}
                  danger={phase === 'unavailable'}
                />
                <Metric
                  label="Health HTTP"
                  value={
                    health.status === 'unavailable'
                      ? '503'
                      : health.status === 'degraded'
                        ? '200 (degraded)'
                        : health.status === 'ok'
                          ? '200'
                          : '—'
                  }
                  danger={health.status === 'unavailable'}
                />
                <Metric label="Availability" value={health.availability ?? '—'} danger={phase === 'unavailable'} />
                <Metric label="Health latency" value={health.latencyMs != null ? `${health.latencyMs} ms` : '—'} />
              </>
            ) : (
              <>
                <Metric label="Failed sign-ins" value={state.failCount ?? 0} />
                <Metric label="Blocked (HTTP 429)" value={state.blockedCount ?? 0} />
                <Metric
                  label="429 blocked events"
                  value={events.filter((e) => e.errorCode === 'IP_BLOCKED' || e.status === 429).length}
                />
                <Metric
                  label="Detection time"
                  value={deltaSeconds(timestamps.detectedAt, timestamps.firstFailureAt)}
                />
                <Metric
                  label="Mitigation time"
                  value={deltaSeconds(timestamps.mitigatedAt, timestamps.firstFailureAt)}
                />
                <Metric
                  label="Risk"
                  value={
                    incident ? `${incident.severity ?? '—'} · ${incident.riskScore ?? '—'}` : '—'
                  }
                />
                <Metric
                  label="Pipeline (real)"
                  value={
                    AI_AGENTS.map((agent) => {
                      const run = runs.find((r) => r.agent === agent)
                      return run
                        ? `${agent} ${run.status === 'COMPLETE' ? '✓' : run.status === 'IN_PROGRESS' ? '…' : run.status ?? ''}`
                        : `${agent} —`
                    }).join('  ·  ')
                  }
                />
                <Metric label="Final health" value={health.status ?? '—'} danger={health.status === 'unavailable'} />
                <Metric label="Health latency" value={health.latencyMs != null ? `${health.latencyMs} ms` : '—'} />
              </>
            )}
          </dl>

          {build === 'ai' && incident && (
            <p className="mt-3 text-xs text-bh-muted">
              <Icon name="shield" size={13} className="mr-1 inline text-bh-accent" />
              Incident {incident.ref} · {incident.status} — {incident.title}
            </p>
          )}

          {events.length > 0 && (
            <div className="mt-4">
              <p className="flex items-center gap-1.5 text-xs font-medium text-bh-muted">
                <Icon name="terminal" size={13} className="text-bh-accent" />
                Live log — real backend events
              </p>
              <ul className="mt-2 space-y-1.5 font-mono text-[11px]">
                {events.slice(0, 7).map((event) => (
                  <li key={event.id} className="flex flex-wrap gap-x-2 rounded bg-bh-surface-2 px-2 py-1.5 text-bh-muted">
                    <span className="text-bh-faint">{toLocale(event.createdAt)}</span>
                    <span
                      className={cn(
                        'font-semibold',
                        event.level === 'ERROR' ? 'text-bh-danger' : event.level === 'WARN' ? 'text-amber-500' : 'text-bh-muted',
                      )}
                    >
                      {event.level}
                    </span>
                    <span>{event.errorCode ?? event.service}</span>
                    {event.status != null && <span>{event.status}</span>}
                    <span className="w-full truncate text-bh-muted">{event.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Card>
  )
}

export default function AttackDemoPage() {
  const [noai, setNoai] = useState<Telemetry | null>(null)
  const [ai, setAi] = useState<Telemetry | null>(null)
  const [noaiError, setNoaiError] = useState<string | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/demo/attack', { cache: 'no-store' })
        const json = (await res.json()) as Telemetry
        if (!cancelled) {
          setNoai(json)
          setNoaiError(null)
        }
      } catch {
        if (!cancelled) setNoaiError('WITHOUT-AI telemetry unreachable (port 3001 down?).')
      }
      try {
        const res = await fetch('/api/demo/attack/ai', { cache: 'no-store' })
        const json = (await res.json()) as Telemetry
        if (!cancelled) {
          setAi(json)
          setAiError(json?.error ? String(json.error) : null)
          setLastUpdated(new Date())
        }
      } catch {
        if (!cancelled) setAiError('WITH-AI telemetry bridge unreachable.')
      }
    }
    void load()
    const interval = setInterval(() => void load(), 2500)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const noaiStepsList = noai
    ? noaiSteps(noai.phase ?? 'normal', noai.state ?? {}, noai.health ?? {})
    : NOAI_STEPS.map((s) => ({ ...s, reached: s.id === 'n1', current: s.id === 'n1' }))
  const aiStepsList = ai
    ? aiSteps(
        ai.phase ?? 'normal',
        ai.state ?? {},
        ai.health ?? {},
        ai.timestamps ?? {},
        ai.agentRuns ?? [],
        ai.incident ?? null,
        ai.events ?? [],
      )
    : AI_STEPS.map((s) => ({ ...s, reached: s.id === 'a1', current: s.id === 'a1' }))

  const attackIcons: Array<{ icon: IconName; label: string }> = [
    { icon: 'bug', label: 'ATTACK SOURCE 127.0.0.1' },
    { icon: 'lock', label: 'FORGED SIGN-INS ≤12/s + SUSTAINED /posts /projects /health' },
    { icon: 'activity', label: '≤ 20s HARD CAP · IDENTICAL WORKLOAD ON BOTH SIDES' },
  ]

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 flex items-center gap-2 text-lg font-semibold tracking-tight text-bh-ink">
          <Icon name="code" size={22} className="text-bh-accent" />
          Build<span className="text-bh-accent">Hub</span>
        </span>
        <Badge tone="accent">NO-AI DEMO</Badge>
        <Badge tone="danger" dot>
          SAME ATTACK — LIVE COMPARISON
        </Badge>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button asChild variant="outline" size="sm" icon="arrowLeft">
          <Link href="/demo" className="flex items-center">
            Back to fault demo
          </Link>
        </Button>
        <span className="text-xs text-bh-faint">
          Last refresh {lastUpdated ? lastUpdated.toLocaleTimeString() : 'waiting…'} · auto-refresh every 2.5s
        </span>
      </div>

      <h1 className="mt-5 text-3xl font-semibold tracking-tight text-bh-ink">SAME ATTACK.</h1>
      <p className="mt-1 max-w-3xl text-sm text-bh-muted">
        The identical hard-overload workload is fired at both builds on loopback: a rate-bounded forged
        sign-in stream plus sustained probing of <span className="font-mono">/posts</span>,{' '}
        <span className="font-mono">/projects</span> and <span className="font-mono">/health</span>, capped at 20
        seconds. The WITHOUT-AI build has no auto-mitigation — it degrades, then the service 503s. The
        WITH-AI build detects the burst, runs its real security pipeline (FIXER · CRITIC · JUDGE), blocks the
        source with 429s, and stays available.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {attackIcons.map((item) => (
          <span
            key={item.label}
            className="flex items-center gap-1.5 rounded-full border border-bh-line bg-bh-surface-2 px-3 py-1 font-mono text-[11px] text-bh-muted"
          >
            <Icon name={item.icon} size={13} className="text-bh-accent" />
            {item.label}
          </span>
        ))}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Panel
          build="noai"
          title="BUILDHUB WITHOUT AI"
          port={3001}
          data={noai}
          error={noaiError}
          steps={noaiStepsList}
        />
        <Panel
          build="ai"
          title="BUILDHUB WITH AI"
          port={3000}
          data={ai}
          error={aiError}
          steps={aiStepsList}
        />
      </div>

      <Card className="mt-6 border-bh-line p-5">
        <p className="text-center text-sm text-bh-ink">
          <span className="font-semibold tracking-wide text-bh-ink">SAME ATTACK.</span>{' '}
          <span className="text-bh-muted">WITHOUT AI:</span>{' '}
          <span className="font-medium text-bh-danger">
            ATTACK → TRAFFIC SPIKE → RESOURCE PRESSURE → SERVICE UNAVAILABLE → 503 ERROR PAGE.
          </span>{' '}
          <span className="text-bh-muted">WITH AI:</span>{' '}
          <span className="font-medium text-bh-accent">
            SAME ATTACK → DETECTION → CODER → CRITIC → JUDGE → RISK → MITIGATION → 429 BLOCK → SERVICE HEALTHY.
          </span>
        </p>
        <p className="mt-2 text-center text-xs text-bh-faint">
          The live request counter, rps, latency and 2xx/4xx/5xx counters are printed by{' '}
          <span className="font-mono">python3 attack-demo/run-overload.py --port 3001 --confirm-local</span>{' '}
          and{' '}
          <span className="font-mono">--port 3000</span> from the script&apos;s own real observations — every
          value on this page is real backend health, incident and pipeline state.
        </p>
        <p className="mt-2 text-center text-xs">
          <a
            href="http://127.0.0.1:3001/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-bh-accent hover:underline"
          >
            http://127.0.0.1:3001/
          </a>
          <span className="text-bh-faint"> — open the real 503 / SERVICE UNAVAILABLE error page</span>
        </p>
      </Card>
    </div>
  )
}