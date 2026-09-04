import 'server-only'

// Phase 8 compat shim over the provider factory.
//
// The Phase 9 iterative Coder/Critic/Judge engine lives in
// `lib/server/self-healing-engine.ts` and uses the provider abstraction
// directly. This module keeps the original single-call Analysis pipeline
// (FIXER/CRITIC/JUDGE text analysis) working with identical prompts and the
// same public types, so the existing security pipeline and telemetry keep
// functioning until the self-healing orchestration is upgraded.
//
// Every failure path returns a structured FAILED result — analysis never
// throws and never modifies code (the agents are explicitly told so).

import { getProvider, providerConfiguredModel, providerOfferedModels } from './provider'
import type { ProviderCall } from './providers/types'

export type AgentKind = 'FIXER' | 'CRITIC' | 'JUDGE'

export interface AgentContext {
  incidentRef: string
  incidentId: string
  severity: string
  title: string
  description: string
  summary: string | null
  endpoint: string
  method: string
  errorCode: string | null
  requestId: string | null
  expectedRootCause: string | null
  suspectSource: string
  ruleId: string
  detectedBy: string
  evidenceCount: number
}

export interface AgentOutput {
  summary: string
  recommendation: string
  confidence: number
  suspectFiles: string[]
  hypothesizedRootCause?: string
  verdict?: string
  reasoning?: string
  riskOfFix?: string
}

export interface AgentCallResult {
  ok: boolean
  status: 'COMPLETE' | 'FAILED'
  model: string
  output?: AgentOutput
  error?: string
}

export function configuredModel(): string {
  return providerConfiguredModel()
}

export async function offeredModels(): Promise<string[] | null> {
  return providerOfferedModels()
}

function systemPromptFor(agent: AgentKind): string {
  switch (agent) {
    case 'FIXER':
      return [
        `You are the Fixer inside BuildHub's self-healing pipeline. BuildHub is a real web application; the incident context below was collected from real logs.`,
        'Analyse the incident and hypothesize a plausible root cause. You produce ANALYSIS ONLY: do not write, propose to apply, or mention applying any code patch. ' +
          'If the evidence is insufficient, say so honestly instead of guessing.',
        'Respond with STRICT JSON only, no markdown. Shape: {"summary": string, "hypothesizedRootCause": string, "recommendation": string, "confidence": number (0-1), "suspectFiles": string[]}.',
      ].join('\n')
    case 'CRITIC':
      return [
        "You are the Critic inside BuildHub's self-healing pipeline. A previous agent (Fixer) provided a root-cause hypothesis and recommendation.",
        'Challenge it: is it consistent with the observed evidence? Would it mislead a human operator? Respond with a quality check and clear verdict. ANALYSIS ONLY: never propose or apply code.',
        'Respond with STRICT JSON only, no markdown. Shape: {"summary": string, "verdict": "approve" | "amend" | "reject", "reasoning": string, "recommendation": string, "confidence": number (0-1)}.',
      ].join('\n')
    case 'JUDGE':
      return [
        "You are the Judge inside BuildHub's self-healing pipeline, the final arbiter for a human operator.",
        'Weigh the Fixer hypothesis and the Critic review, then issue a final verdict and a short plain-language brief a human can act on. The incident is NOT auto-fixed; nothing here is applied automatically.',
        'Respond with STRICT JSON only, no markdown. Shape: {"summary": string, "verdict": "approve" | "amend" | "reject", "reasoning": string, "recommendation": string, "riskOfFix": "low" | "medium" | "high", "confidence": number (0-1)}.',
      ].join('\n')
  }
}

function buildUserMessage(agent: AgentKind, ctx: AgentContext, prior?: AgentOutput): string {
  const header = `Incident ${ctx.incidentRef} (${ctx.severity})\nTitle: ${ctx.title}\n` +
    `Endpoint: ${ctx.method} ${ctx.endpoint}\nError code: ${ctx.errorCode ?? 'n/a'}\n` +
    `Request ID: ${ctx.requestId ?? 'n/a'}\nRule: ${ctx.ruleId}\nDetected by: ${ctx.detectedBy}\n` +
    `Suspect source file (heuristic hint only): ${ctx.suspectSource}\nEvidence rows: ${ctx.evidenceCount}\n\n${ctx.description}`
  if (agent === 'FIXER') return header
  if (agent === 'CRITIC') {
    const fixer = prior ? JSON.stringify(prior, null, 2) : '(no Fixer output available)'
    return `${header}\n\n=== Fixer output to review ===\n${fixer}`
  }
  const critic = prior ? JSON.stringify(prior, null, 2) : '(no prior output available)'
  return `${header}\n\n=== Fixer + Critic output to adjudicate ===\n${critic}`
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (match) {
      try {
        return JSON.parse(match[1].trim())
      } catch {
        return null
      }
    }
    return null
  }
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  if (value >= 0 && value <= 1) return Math.round(value * 100)
  return Math.round(Math.min(100, Math.max(0, value)))
}

function normalizeOutput(agent: AgentKind, parsed: unknown): AgentOutput | null {
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>
  const summary = typeof obj.summary === 'string' ? obj.summary.slice(0, 800) : ''
  const recommendation =
    typeof obj.recommendation === 'string' ? obj.recommendation.slice(0, 800) : ''
  const confidence = normalizeConfidence(obj.confidence)
  if (!summary.trim()) return null
  const suspectFiles = Array.isArray(obj.suspectFiles)
    ? obj.suspectFiles.filter((f): f is string => typeof f === 'string').slice(0, 6)
    : []

  const output: AgentOutput = { summary, recommendation, confidence, suspectFiles }
  if (typeof obj.hypothesizedRootCause === 'string') {
    output.hypothesizedRootCause = obj.hypothesizedRootCause.slice(0, 600)
  }
  if (typeof obj.verdict === 'string') output.verdict = obj.verdict
  if (typeof obj.reasoning === 'string') output.reasoning = obj.reasoning.slice(0, 800)
  if (typeof obj.riskOfFix === 'string') output.riskOfFix = obj.riskOfFix
  return output
}

/**
 * Executes a single real agent against an incident context through the active
 * provider. Never throws: provider/network/parse failures all become a FAILED
 * result so the pipeline records them honestly (AI ANALYSIS UNAVAILABLE).
 */
export async function callAgent(
  agent: AgentKind,
  ctx: AgentContext,
  prior?: AgentOutput,
): Promise<AgentCallResult> {
  const provider = getProvider()
  const model = provider.configuredModel()
  const roleKind = agent === 'FIXER' ? 'CODER' : agent

  const call: ProviderCall = {
    model,
    messages: [
      { role: 'system', content: systemPromptFor(agent) },
      { role: 'user', content: buildUserMessage(agent, ctx, prior) },
    ],
    maxTokens: 700,
    temperature: 0.2,
    context: { role: roleKind, round: 1 },
  }

  const response = await provider.call(call)
  if (!response.ok || !response.content) {
    return {
      ok: false,
      status: 'FAILED',
      model,
      error:
        response.error ?? `AI call failed (provider ${provider.name})`.slice(0, 500),
    }
  }

  const output = normalizeOutput(agent, parseJsonContent(response.content))
  if (!output) {
    return {
      ok: false,
      status: 'FAILED',
      model,
      error: 'AI response could not be parsed as the expected JSON contract.',
    }
  }
  return { ok: true, status: 'COMPLETE', model, output }
}