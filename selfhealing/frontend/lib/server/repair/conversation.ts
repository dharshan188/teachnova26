import 'server-only'

// Phase 9 — iterative repair conversation engine.
//
// One RepairAttempt runs the Coder/Critic loop (up to MAX_CODER_ROUNDS) with
// early acceptance, followed by a final Judge verdict. Every single agent call
// is persisted on AgentRun (round, kind, tokens, duration, context) with an
// honest status, so the dashboard state is a transcript of reality.

import { prisma } from '@/lib/server/db'
import { getProvider } from '@/lib/server/provider'
import { addIncidentEvent } from '@/lib/server/repair/events'
import { logger } from '@/lib/server/logger'
import type {
  AgentRole,
  ChatMessage,
  CoderOutput,
  CriticOutput,
  JudgeOutput,
  ProviderCall,
  ProviderResponse,
  RepairEvidence,
} from '@/lib/server/providers/types'
import type { Incident, RepairAttempt } from '@prisma/client'
import { Prisma } from '@prisma/client'

export const MAX_CODER_ROUNDS = 3

export interface RepairOptions {
  maxRounds?: number
  scenario?: string
  /** Sandbox answer for the deterministic TEST provider only; never an LLM. */
  fault?: {
    id: string
    file: string
    line: number | null
    function: string
    originalCode: string
    faultCode: string
  } | null
}

export interface TurnResult {
  role: AgentRole
  round: number
  agentRunId: string
  status: 'COMPLETE' | 'FAILED'
  output: CoderOutput | CriticOutput | JudgeOutput | null
  summary: string
  error?: string
  model: string
  mode: 'REAL' | 'TEST'
}

export interface ConversationResult {
  attempt: RepairAttempt
  converged: boolean
  roundsUsed: number
  stopReason:
    | 'CODER_ACCEPTED'
    | 'CODER_REJECTED'
    | 'ROUNDS_EXHAUSTED'
    | 'CODER_FAILED'
    | 'JUDGE_FAILED'
  candidate: CoderOutput | null
  judge: JudgeOutput | null
  turns: TurnResult[]
  coderCode: string | null
  humanBrief: string
}

export async function nextAttemptId(): Promise<string> {
  const rows = await prisma.repairAttempt.findMany({ select: { attemptId: true } })
  let max = 0
  for (const row of rows) {
    const match = row.attemptId.match(/^RPR-(\d+)$/)
    if (match) max = Math.max(max, Number.parseInt(match[1], 10))
  }
  return `RPR-${String(max + 1).padStart(5, '0')}`
}

export async function createRepairAttempt(incident: Incident): Promise<RepairAttempt> {
  return prisma.repairAttempt.create({
    data: { attemptId: await nextAttemptId(), incidentId: incident.id, status: 'INCIDENT_DETECTED' },
  })
}

export async function updateAttemptStatus(
  attemptId: string,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await prisma.repairAttempt.update({ where: { id: attemptId }, data: { status, ...extra } })
}

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

function evidenceHeader(evidence: RepairEvidence): string {
  const lines = [
    `Incident ${evidence.incidentRef} (${evidence.severity})`,
    `Title: ${evidence.title}`,
    `Endpoint: ${evidence.method} ${evidence.endpoint}`,
    `Error code: ${evidence.errorCode ?? 'n/a'}`,
    `Request ID: ${evidence.requestId ?? 'n/a'}`,
    `Detected by: ${evidence.detectedBy}`,
    `Suspect source (hint): ${evidence.suspectSource}`,
    `Evidence rows: ${evidence.evidenceCount}`,
    ``,
    `## Incident description`,
    evidence.description,
  ]
  if (evidence.stackTrace) lines.push(``, `## Stack trace`, evidence.stackTrace)
  if (evidence.logs.length > 0) {
    lines.push(
      ``,
      `## Recent log evidence`,
      ...evidence.logs.slice(0, 15).map(
        (l) => `[${l.createdAt}] ${l.level} ${l.method ?? ''} ${l.route ?? ''} ${l.status ?? ''} ${l.message}${l.errorCode ? ` (${l.errorCode})` : ''}`,
      ),
    )
  }
  if (evidence.memoryHints.length > 0) {
    lines.push(
      ``,
      `## Repair memory (outcomes from earlier incidents)`,
      ...evidence.memoryHints.map((m) => `- ${m.outcome}: ${m.rootCause} -> ${m.patchSummary}`),
    )
  }
  if (evidence.sourceContext) lines.push(``, `## Current source (environment view)`, evidence.sourceContext)
  return lines.join('\n')
}

function transcriptBlock(coder: CoderOutput, critic: CriticOutput | null): string {
  const lines = [`--- Proposal (Coder) ---`, JSON.stringify(coder, null, 2)]
  if (critic) {
    lines.push(
      ``,
      `--- Review (Critic: ${critic.verdict}) ---`,
      `Reasoning: ${critic.reasoning}`,
      `Problems: ${critic.problems.join('; ') || 'none'}`,
      `Required changes: ${critic.requiredChanges.join('; ') || 'none'}`,
    )
  }
  return lines.join('\n')
}

const CODER_SYSTEM = [
  `You are the Coder in BuildHub's self-healing pipeline. You propose a REAL, minimal source patch that fixes the observed runtime failure.`,
  `Inspect the incident evidence and the "Current source (environment view)" section. The defect is a wrong runtime behavior caused by the code exactly as shown; correct the smallest surface that restores the healthy behavior described by the evidence. Do not invent features.`,
  `currentCode MUST be copied verbatim from the source shown (the wrong text). proposedCode is your minimal fix.`,
  `Respond with STRICT JSON only, no markdown. Shape: {"diagnosis": string, "rootCause": string, "file": string (frontend-relative path, e.g. app/api/posts/route.ts or lib/server/validation.ts), "line": number|null, "function": string, "affectedBehavior": string, "currentCode": string, "proposedCode": string, "validationPlan": string, "confidence": number (0-100)}.`,
].join('\n')

const CRITIC_SYSTEM = [
  `You are the Critic in BuildHub's self-healing pipeline. You review the Coder's patch with strict evidence discipline.`,
  `ACCEPT only when the change clearly restores the healthy behavior described by the evidence and introduces no security/regression risk. REVISE when a better fix is plausible. REJECT when the change cannot be trusted or is unrelated to the evidence.`,
  `Respond with STRICT JSON only, no markdown. Shape: {"verdict": "ACCEPT"|"REVISE"|"REJECT", "reasoning": string, "problems": string[], "requiredChanges": string[], "testsRequired": string[], "securityConcerns": string[]}.`,
].join('\n')

const JUDGE_SYSTEM = [
  `You are the Judge in BuildHub's self-healing pipeline: the final arbiter.`,
  `Review the whole repair conversation against the incident evidence. APPROVE only when the proposed patch is evidenced, minimal, and safe; REJECT otherwise. If no repair candidate exists, you MUST reject. Always require documented validation to be re-run after apply.`,
  `Respond with STRICT JSON only, no markdown. Shape: {"decision": "APPROVE"|"REJECT", "reasoning": string, "confidence": number (0-100), "risk": "LOW"|"MEDIUM"|"HIGH", "validationItems": string[]}.`,
].join('\n')

// ---------------------------------------------------------------------------
// JSON normalization
// ---------------------------------------------------------------------------

function extractJsonContent(content: string): string | null {
  const trimmed = content.trim()
  // Direct JSON.
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object') return trimmed
  } catch {
    // fall through
  }

  // Fenced code block (```json ... ``` or ``` ... ```).
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) {
    const inner = fence[1].trim()
    try {
      const parsed = JSON.parse(inner)
      if (parsed && typeof parsed === 'object') return inner
    } catch {
      // fall through
    }
  }

  // A single balanced {...} object anywhere in prose (LLMs often wrap JSON in
  // a sentence or explanation before/after the actual payload). We walk braces
  // and return the outermost object that parses.
  let depth = 0
  let start = -1
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i]
    if (ch === '{') {
      if (depth === 0) start = i
      depth += 1
    } else if (ch === '}') {
      depth -= 1
      if (depth === 0 && start !== -1) {
        const candidate = trimmed.slice(start, i + 1)
        try {
          const parsed = JSON.parse(candidate)
          if (parsed && typeof parsed === 'object') return candidate
        } catch {
          // keep scanning for a valid object
        }
      }
    }
  }
  return null
}

function firstJsonObject(content: string): Record<string, unknown> | null {
  const extracted = extractJsonContent(content)
  if (extracted === null) return null
  try {
    const parsed = JSON.parse(extracted)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return null
  }
  return null
}

function str(v: unknown, max = 2000): string {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

function num(v: unknown, fallback = 0): number {
  if (typeof v !== 'number' || Number.isNaN(v)) return fallback
  return Math.round(Math.min(100, Math.max(0, v)))
}

export function parseCoder(parsed: Record<string, unknown> | null): CoderOutput | null {
  if (!parsed) return null
  const diagnosis = str(parsed.diagnosis)
  const file = str(parsed.file, 300)
  const currentCode = str(parsed.currentCode, 7000)
  const proposedCode = str(parsed.proposedCode, 14000)
  if (!diagnosis || !file || !currentCode) return null
  return {
    diagnosis,
    rootCause: str(parsed.rootCause, 1500) || diagnosis,
    file,
    line: typeof parsed.line === 'number' && Number.isFinite(parsed.line) ? Math.floor(parsed.line) : null,
    function: str(parsed.function, 300),
    affectedBehavior: str(parsed.affectedBehavior, 1000),
    currentCode,
    proposedCode,
    validationPlan: str(parsed.validationPlan, 1000),
    confidence: num(parsed.confidence, 50),
  }
}

export function parseCritic(parsed: Record<string, unknown> | null): CriticOutput | null {
  if (!parsed || (parsed.verdict !== 'ACCEPT' && parsed.verdict !== 'REVISE' && parsed.verdict !== 'REJECT')) return null
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 8) : [])
  return {
    verdict: parsed.verdict,
    reasoning: str(parsed.reasoning, 2000) || 'No reasoning provided.',
    problems: arr(parsed.problems),
    requiredChanges: arr(parsed.requiredChanges),
    testsRequired: arr(parsed.testsRequired),
    securityConcerns: arr(parsed.securityConcerns),
  }
}

export function parseJudge(parsed: Record<string, unknown> | null): JudgeOutput | null {
  if (!parsed || (parsed.decision !== 'APPROVE' && parsed.decision !== 'REJECT')) return null
  const riskRaw = str(parsed.risk, 10).toUpperCase()
  const risk: JudgeOutput['risk'] = riskRaw === 'LOW' || riskRaw === 'MEDIUM' || riskRaw === 'HIGH' ? riskRaw : 'MEDIUM'
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 8) : [])
  return {
    decision: parsed.decision,
    reasoning: str(parsed.reasoning, 2500) || 'No reasoning provided.',
    confidence: num(parsed.confidence, 50),
    risk,
    validationItems: arr(parsed.validationItems),
  }
}

// ---------------------------------------------------------------------------
// Provider call + persistence per turn
// ---------------------------------------------------------------------------

interface StoredResult {
  agentRunId: string
  status: 'COMPLETE' | 'FAILED'
  output: CoderOutput | CriticOutput | JudgeOutput | null
  summary: string
  error?: string
  model: string
  mode: 'REAL' | 'TEST'
  durationMs: number
  promptTokens: number | null
  completionTokens: number | null
}

async function callAndStore(
  incident: Incident,
  role: AgentRole,
  roleLabel: string,
  round: number,
  messages: ChatMessage[],
  options: RepairOptions,
  evidence: RepairEvidence,
): Promise<StoredResult> {
  const provider = getProvider()
  const model = provider.configuredModel()
  const startedAt = Date.now()

  const stored = await prisma.agentRun.create({
    data: {
      incidentId: incident.id,
      agent: role,
      role: roleLabel,
      status: 'ANALYZING',
      progress: 30,
      currentActivity: `Calling ${provider.name} (${role}) round ${round}`,
      mode: provider.mode,
      model,
      round,
      kind: role,
    },
  })

  const call: ProviderCall = {
    model,
    messages,
    maxTokens: 1200,
    temperature: 0.2,
    context: {
      role,
      round,
      scenario: options.scenario,
      fault: provider.name === 'test' ? options.fault ?? undefined : undefined,
    },
  }

  let response: ProviderResponse
  try {
    response = await provider.call(call)
  } catch (err) {
    response = {
      ok: false,
      status: 'FAILED',
      provider: provider.name,
      mode: provider.mode,
      model,
      error: err instanceof Error ? err.message : 'provider threw',
    }
  }
  const durationMs = Date.now() - startedAt

  const output = response.ok && response.content ? normalizeRoleOutput(role, response.content) : null
  const status: 'COMPLETE' | 'FAILED' = output !== null ? 'COMPLETE' : 'FAILED'
  const summary = output ? summarize(role, output) : (response.error ?? 'AI output unparseable')
  const error = status === 'FAILED' ? (response.error ?? 'unparseable AI output') : null

  await prisma.agentRun.update({
    where: { id: stored.id },
    data: {
      status,
      progress: 100,
      currentActivity: null,
      output: (output ? (output as unknown as Prisma.InputJsonValue) : Prisma.JsonNull) as Prisma.InputJsonValue | undefined,
      outputSummary: summary.slice(0, 300),
      confidence: output && 'confidence' in output && typeof output.confidence === 'number' ? output.confidence : null,
      model: response.model ?? model,
      error,
      durationMs,
      promptTokens: response.promptTokens ?? null,
      completionTokens: response.completionTokens ?? null,
      context: {
        provider: provider.name,
        scenario: options.scenario ?? null,
        promptTail: messages[messages.length - 1].content.slice(-1400),
        evidence: { incidentRef: evidence.incidentRef, endpoint: evidence.endpoint },
      },
      completedAt: new Date(),
    },
  })

  if (status === 'FAILED') {
    await logger.error({
      service: 'self-healing',
      message: `${role} round ${round} failed: ${error}`,
      route: evidence.endpoint,
      method: evidence.method,
      status: 503,
      requestId: evidence.requestId ?? undefined,
      incidentId: incident.id,
      errorCode: 'AGENT_CALL_FAILED',
    })
    await addIncidentEvent(incident.id, 'INVESTIGATING', `${role} round ${round} failed`, (error ?? '').slice(0, 300))
  } else {
    await addIncidentEvent(incident.id, 'INVESTIGATING', `${role} round ${round} completed`, summary.slice(0, 300))
  }

  return {
    agentRunId: stored.id,
    status,
    output,
    summary,
    error: error ?? undefined,
    model: response.model ?? model,
    mode: provider.mode,
    durationMs,
    promptTokens: response.promptTokens ?? null,
    completionTokens: response.completionTokens ?? null,
  }
}

// ---------------------------------------------------------------------------
// Conversation runner
// ---------------------------------------------------------------------------

export async function runRepairConversation(
  incident: Incident,
  attempt: RepairAttempt,
  evidence: RepairEvidence,
  options: RepairOptions = {},
): Promise<ConversationResult> {
  const provider = getProvider()
  const maxRounds = Math.min(MAX_CODER_ROUNDS, Math.max(1, options.maxRounds ?? MAX_CODER_ROUNDS))
  const header = evidenceHeader(evidence)

  const turns: TurnResult[] = []
  const coderOutputs: CoderOutput[] = []
  const criticOutputs: CriticOutput[] = []
  let stopReason: ConversationResult['stopReason'] = 'ROUNDS_EXHAUSTED'
  let converged = false
  let roundsUsed = 0

  await updateAttemptStatus(attempt.id, 'MEMORY_SEARCH')
  await addIncidentEvent(
    incident.id,
    'INVESTIGATING',
    'Repair memory searched',
    `${evidence.memoryHints.length} match(es) returned`,
  )

  await updateAttemptStatus(attempt.id, 'CODING')
  await addIncidentEvent(
    incident.id,
    'INVESTIGATING',
    'Coder/Critic conversation started',
    `provider=${provider.name} mode=${provider.mode} model=${provider.configuredModel()} maxRounds=${maxRounds}`,
  )

  for (let round = 1; round <= maxRounds; round += 1) {
    roundsUsed = round

    const coderMessages = coderPromptFor(header, round, coderOutputs, criticOutputs)
    const coderResult = await callAndStore(incident, 'CODER', 'Candidate generation (Coder)', round, coderMessages, options, evidence)
    turns.push({ role: 'CODER', round, agentRunId: coderResult.agentRunId, status: coderResult.status, output: coderResult.output, summary: coderResult.summary, error: coderResult.error, model: coderResult.model, mode: coderResult.mode })
    if (coderResult.status !== 'COMPLETE' || !coderResult.output) {
      stopReason = 'CODER_FAILED'
      break
    }
    const coder = coderResult.output as CoderOutput
    coderOutputs.push(coder)

    const criticMessages = criticPromptFor(header, coder, criticOutputs)
    const criticResult = await callAndStore(incident, 'CRITIC', 'Candidate reviewer (Critic)', round, criticMessages, options, evidence)
    turns.push({ role: 'CRITIC', round, agentRunId: criticResult.agentRunId, status: criticResult.status, output: criticResult.output, summary: criticResult.summary, error: criticResult.error, model: criticResult.model, mode: criticResult.mode })
    if (criticResult.status !== 'COMPLETE' || !criticResult.output) {
      stopReason = 'CODER_FAILED'
      break
    }
    const critic = criticResult.output as CriticOutput
    criticOutputs.push(critic)

    if (critic.verdict === 'ACCEPT') {
      converged = true
      stopReason = 'CODER_ACCEPTED'
      break
    }
    if (critic.verdict === 'REJECT') {
      stopReason = 'CODER_REJECTED'
      break
    }
  }

  await updateAttemptStatus(attempt.id, 'JUDGING')

  const judgeMessages = judgePromptFor(header, coderOutputs, criticOutputs, stopReason)
  const judgeResult = await callAndStore(incident, 'JUDGE', 'Final arbiter (Judge)', 1, judgeMessages, options, evidence)
  turns.push({ role: 'JUDGE', round: 1, agentRunId: judgeResult.agentRunId, status: judgeResult.status, output: judgeResult.output, summary: judgeResult.summary, error: judgeResult.error, model: judgeResult.model, mode: judgeResult.mode })
  const judge = judgeResult.status === 'COMPLETE' && judgeResult.output ? (judgeResult.output as JudgeOutput) : null
  if (!judge && stopReason !== 'CODER_FAILED') stopReason = 'JUDGE_FAILED'

  const candidate = converged ? coderOutputs[coderOutputs.length - 1] : null

  await updateAttemptStatus(attempt.id, stageAfterConversation(converged, judge), {
    summary: judge ? `${judge.decision}: ${judge.reasoning}` : null,
    completedAt: converged || judge ? new Date() : null,
  })

  await addIncidentEvent(
    incident.id,
    'INVESTIGATING',
    'Conversation finished',
    `stop=${stopReason} roundsUsed=${roundsUsed} verdicts=${criticOutputs.map((c) => c.verdict).join('>') || 'none'} judge=${judge?.decision ?? 'failed'}`,
  )

  return {
    attempt,
    converged,
    roundsUsed,
    stopReason,
    candidate,
    judge,
    turns,
    coderCode: candidate?.proposedCode ?? null,
    humanBrief: judge
      ? `${judge.decision} (${judge.confidence}%) · ${judge.reasoning}`
      : `No Judge verdict available after ${roundsUsed} Coder round(s).`,
  }
}

function stageAfterConversation(converged: boolean, judge: JudgeOutput | null): string {
  if (!converged) return 'JUDGED'
  if (!judge) return 'JUDGED_FAILED'
  return judge.decision === 'APPROVE' ? 'JUDGE_APPROVED' : 'JUDGE_REJECTED'
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function coderPromptFor(
  header: string,
  round: number,
  coderOutputs: CoderOutput[],
  criticOutputs: CriticOutput[],
): ChatMessage[] {
  const lines = [header]
  if (round > 1 && coderOutputs.length > 0) {
    lines.push(``, `## Earlier proposals and critique`)
    for (let i = 0; i < coderOutputs.length; i += 1) {
      lines.push(transcriptBlock(coderOutputs[i], criticOutputs[i] ?? null))
    }
    lines.push(`## Task`, `Address the Critic's required changes and produce an updated proposal (round ${round}).`)
  } else {
    lines.push(`## Task`, `Propose the minimal, evidence-backed fix.`)
  }
  lines.push(`## Output`, `STRICT JSON matching the Coder contract.`)
  return [
    { role: 'system', content: CODER_SYSTEM },
    { role: 'user', content: lines.join('\n') },
  ]
}

function criticPromptFor(
  header: string,
  coder: CoderOutput,
  criticOutputs: CriticOutput[],
): ChatMessage[] {
  const lines = [header, ``, `## Candidate to review`, JSON.stringify(coder, null, 2)]
  if (criticOutputs.length > 0) {
    lines.push(``, `## Prior reviews`, ...criticOutputs.map((c) => `${c.verdict}: ${c.reasoning}`))
  }
  lines.push(`## Output`, `STRICT JSON matching the Critic contract.`)
  return [
    { role: 'system', content: CRITIC_SYSTEM },
    { role: 'user', content: lines.join('\n') },
  ]
}

function judgePromptFor(
  header: string,
  coderOutputs: CoderOutput[],
  criticOutputs: CriticOutput[],
  stopReason: string,
): ChatMessage[] {
  const lines = [header, ``]
  if (coderOutputs.length === 0) {
    lines.push(`No repair candidate was produced (${stopReason}). As policy, the Judge MUST REJECT.`)
  } else {
    lines.push(`## Repair conversation transcript`)
    for (let i = 0; i < coderOutputs.length; i += 1) {
      lines.push(transcriptBlock(coderOutputs[i], criticOutputs[i] ?? null))
      lines.push(``)
    }
    lines.push(`Conversation ended: ${stopReason}.`, `## Output`, `STRICT JSON matching the Judge contract; cite evidence and recommend a risk tier.`)
  }
  return [
    { role: 'system', content: JUDGE_SYSTEM },
    { role: 'user', content: lines.join('\n') },
  ]
}

function normalizeRoleOutput(role: AgentRole, content: string): CoderOutput | CriticOutput | JudgeOutput | null {
  const parsed = firstJsonObject(content)
  if (!parsed) return null
  if (role === 'CODER') return parseCoder(parsed)
  if (role === 'CRITIC') return parseCritic(parsed)
  return parseJudge(parsed)
}

function summarize(role: AgentRole, output: CoderOutput | CriticOutput | JudgeOutput): string {
  if (role === 'CODER') return (output as CoderOutput).diagnosis
  if (role === 'CRITIC') return `${(output as CriticOutput).verdict}: ${(output as CriticOutput).reasoning}`
  return `${(output as JudgeOutput).decision}: ${(output as JudgeOutput).reasoning}`
}