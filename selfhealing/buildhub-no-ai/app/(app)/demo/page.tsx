'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { useAsync } from '@/lib/hooks'
import { useAuth } from '@/components/auth/auth-provider'

// BuildHub — No-AI Demo
//
// Honest comparison page: the SAME controlled LOW-01 fault (the one the
// AI-enabled BuildHub detects and repairs) is triggered through the REAL
// application flow. This project configures no AI, so the fault stays broken.

interface FaultInfo {
  id: string
  name: string
  difficulty: string
  file: string
  line: number
  function: string
  originalCode: string
  faultCode: string
  triggerMethod: string
  triggerEndpoint: string
  expectedError: string
  riskLevel: string
}

interface FaultState {
  enabled: boolean
  faultId: string
  active: boolean
  unresolved: boolean
  fault: FaultInfo
}

interface LogEntry {
  id: string
  timestamp: string
  level: string
  service: string
  message: string
  route: string | null
  method: string | null
  status: number | null
  errorCode: string | null
}

interface TriggerResult {
  status: number
  error: string
  endpoint: string
  method: string
  timestamp: string
}

const SAMPLE_POST = 'No-AI demo trigger — controlled failure (LOW-01).'

async function fetchFaultState(): Promise<FaultState> {
  const res = await fetch('/api/demo/fault')
  if (!res.ok) throw new Error(`fault status ${res.status}`)
  return (await res.json()) as FaultState
}

async function fetchDemoLogs(): Promise<LogEntry[]> {
  const res = await fetch('/api/demo/logs')
  if (!res.ok) return []
  const json = (await res.json()) as { entries: LogEntry[] }
  return json.entries
}

export default function DemoPage() {
  const { user } = useAuth()
  const faultState = useAsync<FaultState>(fetchFaultState)
  const logState = useAsync<LogEntry[]>(fetchDemoLogs)
  const [result, setResult] = useState<TriggerResult | null>(null)
  const [acting, setActing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const state = faultState.data
  const fault = state?.fault
  const active = state?.unresolved ?? false
  const logs = logState.data ?? []
  const pageError = faultState.error ?? actionError

  const triggerFault = async () => {
    setActing(true)
    setActionError(null)
    try {
      const activateRes = await fetch('/api/demo/fault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'activate' }),
      })
      if (!activateRes.ok) throw new Error(`activate fault status ${activateRes.status}`)

      const realRes = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: SAMPLE_POST, tags: [] }),
      })
      let error = ''
      try {
        const body = (await realRes.json()) as { error?: string }
        error = body.error ?? ''
      } catch {
        error = `HTTP ${realRes.status}`
      }

      setResult({
        status: realRes.status,
        error,
        endpoint: '/api/posts',
        method: 'POST',
        timestamp: new Date().toISOString(),
      })
      faultState.refetch()
      logState.refetch()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to trigger fault.')
    } finally {
      setActing(false)
    }
  }

  const resetDemo = async () => {
    setActing(true)
    setActionError(null)
    try {
      const res = await fetch('/api/demo/fault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      })
      if (!res.ok) throw new Error(`reset status ${res.status}`)
      setResult(null)
      faultState.refetch()
      logState.refetch()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to reset demo.')
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="mr-1 flex items-center gap-2 text-lg font-semibold tracking-tight text-bh-ink">
          <Icon name="code" size={22} className="text-bh-accent" />
          Build<span className="text-bh-accent">Hub</span>
        </span>
        <Badge tone="accent">NO-AI DEMO</Badge>
        <Badge tone="neutral" dot>
          AI SELF-HEALING: OFF
        </Badge>
        {active && (
          <Badge tone="danger" dot>
            STATUS: FAULT INJECTED — UNRESOLVED
          </Badge>
        )}
      </div>

      <h1 className="text-2xl font-semibold tracking-tight text-bh-ink">
        BuildHub Without AI
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-bh-muted">
        Same application. Same controlled fault. No autonomous remediation.
        {user ? (
          <>
            {' '}
            Signed in as <span className="font-medium text-bh-ink">@{user.username}</span> —
            this build configures <span className="font-medium text-bh-ink">no AI</span>, so the
            fault below is never detected, patched, or rolled back automatically.
          </>
        ) : (
          ' Sign in required to trigger the fault through the real application flow.'
        )}
      </p>

      {pageError && (
        <Card className="mt-4 border-bh-danger/40 bg-bh-danger/5 p-4">
          <p className="text-sm font-medium text-bh-danger">
            <Icon name="warning" size={16} className="mr-1 inline" />
            {pageError}
          </p>
        </Card>
      )}

      <div className="mt-5">
        <Button asChild variant="outline" icon="radar">
          <Link href="/demo/attack" className="flex items-center">
            Same-attack comparison (WITHOUT-AI vs WITH-AI)
          </Link>
        </Button>
      </div>

      {state && fault && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Card className="p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-bh-muted">Status</p>
                <Badge tone={active ? 'danger' : 'success'} dot>
                  {active ? 'UNRESOLVED' : 'OPERATIONAL'}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-bh-ink">
                {active
                  ? 'The controlled fault is active. Without AI it will remain broken until demo:reset.'
                  : 'Application is healthy. Trigger the fault to start the comparison.'}
              </p>
              {active && result && (
                <dl className="mt-4 space-y-2 border-t border-bh-line pt-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-bh-muted">Endpoint</dt>
                    <dd className="font-mono text-bh-ink">
                      {result.method} {result.endpoint}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-bh-muted">Status code</dt>
                    <dd className="font-mono text-bh-danger">{result.status}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-bh-muted">Error</dt>
                    <dd className="font-mono text-bh-ink">{result.error}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-bh-muted">Timestamp</dt>
                    <dd className="font-mono text-bh-muted">
                      {new Date(result.timestamp).toLocaleTimeString()}
                    </dd>
                  </div>
                </dl>
              )}
            </Card>

            <Card className="p-5">
              <p className="text-sm font-medium text-bh-muted">
                Controlled fault &middot; {fault.id}
              </p>
              <p className="mt-1 text-sm font-medium text-bh-ink">{fault.name}</p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-bh-muted">File</dt>
                  <dd className="font-mono text-bh-ink">{fault.file}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-bh-muted">Line</dt>
                  <dd className="font-mono text-bh-ink">{fault.line}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-bh-muted">Function</dt>
                  <dd className="font-mono text-bh-ink">{fault.function}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-bh-muted">Trigger</dt>
                  <dd className="font-mono text-bh-ink">
                    {fault.triggerMethod} {fault.triggerEndpoint}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-bh-muted">Risk / Difficulty</dt>
                  <dd className="text-bh-ink">
                    {fault.riskLevel} / {fault.difficulty}
                  </dd>
                </div>
              </dl>
            </Card>
          </div>

          {active && (
            <Card className="mt-4 border-bh-danger/40 bg-bh-danger/5 p-5">
              <div className="flex items-start gap-3">
                <Icon name="bug" size={20} className="mt-0.5 shrink-0 text-bh-danger" />
                <div>
                  <p className="text-sm font-semibold text-bh-danger">ERROR DETECTED</p>
                  <p className="mt-1 text-sm text-bh-ink">
                    The real `POST /api/posts` request above received a{' '}
                    <span className="font-semibold text-bh-danger">
                      {result ? `HTTP ${result.status}` : 'server error'}
                    </span>
                    {result?.error && (
                      <>
                        {' '}
                        &mdash; <span className="font-mono">{result.error}</span>
                      </>
                    )}
                    . No AI is configured here, so nothing will fix it. Status:{' '}
                    <span className="font-semibold">UNRESOLVED</span>.
                  </p>
                </div>
              </div>
            </Card>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="danger" onClick={triggerFault} loading={acting} icon="bug">
              Trigger fault
            </Button>
            <Button variant="outline" onClick={resetDemo} loading={acting} icon="refresh">
              Reset demo
            </Button>
          </div>
        </>
      )}

      <Card className="mt-8 p-5">
        <div className="flex items-center gap-2">
          <Icon name="terminal" size={18} className="text-bh-accent" />
          <h2 className="text-sm font-medium text-bh-ink">Live log — real backend events</h2>
        </div>
        {logs.length === 0 ? (
          <p className="mt-3 text-sm text-bh-faint">
            No demo log entries yet. Trigger the fault to produce one.
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5 font-mono text-xs">
            {logs.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-md bg-bh-surface-2 px-3 py-2"
              >
                <span className="text-bh-faint">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                <span
                  className={
                    entry.level === 'ERROR'
                      ? 'font-semibold text-bh-danger'
                      : entry.level === 'WARN'
                        ? 'font-semibold text-bh-warning'
                        : 'text-bh-muted'
                  }
                >
                  {entry.level}
                </span>
                <span className="text-bh-muted">{entry.service}</span>
                <span className="text-bh-ink">
                  {entry.method} {entry.route}
                </span>
                {entry.status !== null && (
                  <span className={entry.status >= 500 ? 'text-bh-danger' : 'text-bh-muted'}>
                    {entry.status}
                  </span>
                )}
                <span className="w-full text-bh-muted">{entry.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}