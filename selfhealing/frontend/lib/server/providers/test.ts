import 'server-only'

// Phase 9 — hermetic deterministic provider used only when AI_PROVIDER=test
// and SELF_HEALING_TEST_MODE is truthy. Its purpose is isolated, repeatable
// validation of the multi-agent conversation/patch engine WITHOUT external
// network calls. Every interaction is persisted with mode=TEST so it can never
// be mistaken for production telemetry.
//
// The provider is given the sandbox `fault` answer via ProviderContext only in
// TEST mode (production Groq never receives it) so the canonical good patch is
// deterministic and the engine's acceptance math is what is under test.

import type {
  AIProvider,
  ProviderCall,
  ProviderResponse,
  ProviderName,
  ModeLabel,
  CoderOutput,
  CriticOutput,
  JudgeOutput,
} from './types'

// Parse an isolated JSON body (with optional code fence) into an object.
function parseFenced(content: string): Record<string, unknown> | null {
  const trimmed = content.trim()
  for (const candidate of [trimmed, trimmed.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')]) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
    } catch {
      /* try next candidate */
    }
  }
  return null
}

const MODEL = 'test-provider'

function roundText(round: number): string {
  return `Round ${round}: deterministic test scenario.`
}

function coderJson(fault: NonNullable<ProviderCall['context']['fault']>): string {
  const output: CoderOutput = {
    diagnosis: `Deterministic test diagnosis for fault target ${fault.file}${fault.line ? `:${fault.line}` : ''} (${fault.function || 'unknown'}).`,
    rootCause: `The defect at ${fault.function || fault.file} produces the observed failure.`,
    file: fault.file,
    line: fault.line,
    function: fault.function || '',
    affectedBehavior: 'The affected behavior regresses as documented in the incident evidence.',
    currentCode: fault.faultCode,
    proposedCode: fault.originalCode,
    validationPlan: 'Re-run the documented HTTP probe; expect the pre-fault status.',
    confidence: 88,
  }
  return emit(output)
}

// Round-trip the simulated output through the same JSON parser the engine uses
// so DECODED structs (parse errors excluded) are what tests assert on.
function emit(obj: unknown): string {
  const json = JSON.stringify(obj)
  const parsed = parseFenced(json)
  return parsed === null ? json : JSON.stringify(parsed)
}

function criticJson(verdict: 'ACCEPT' | 'REVISE' | 'REJECT', round: number): string {
  const output: CriticOutput =
    verdict === 'ACCEPT'
      ? {
          verdict,
          reasoning: 'The proposed change matches the healthy baseline and addresses the observed failure.',
          problems: [],
          requiredChanges: ['None.'],
          testsRequired: ['Re-run the incident HTTP probe.'],
          securityConcerns: [],
        }
      : {
          verdict,
          reasoning: 'The proposed change still shows a gap against the healthy baseline.',
          problems: ['Proposed change is not yet verified against the healthy behavior.'],
          requiredChanges: ['Align proposedCode with the healthy baseline.'],
          testsRequired: ['Re-run the incident HTTP probe.'],
          securityConcerns: [],
        }
  void roundText(round)
  return emit(output)
}

function judgeJson(decision: 'APPROVE' | 'REJECT', risk: string): string {
  const output: JudgeOutput = {
    decision,
    reasoning: decision === 'APPROVE'
      ? 'Conversation converged; proposed patch is backed by validation and safe to apply.'
      : 'Repair conversation could not converge to a safe candidate.',
    confidence: decision === 'APPROVE' ? 90 : 25,
    risk: (risk as JudgeOutput['risk']) || 'MEDIUM',
    validationItems: ['HTTP probe of the affected endpoint after apply.'],
  }
  return emit(output)
}

export function createTestProvider(): AIProvider {
  return {
    name: 'test' as ProviderName,
    mode: 'TEST' as ModeLabel,
    configuredModel: () => MODEL,
    async probeModels() {
      return [MODEL]
    },
    async call(req: ProviderCall): Promise<ProviderResponse> {
      const { role, round, scenario, fault } = req.context
      let content: string | null = null
      let error: string | null = null

      if (role === 'CODER') {
        if (fault) {
          content = coderJson(fault)
        } else {
          error = 'TEST provider requires fault context for CODER determinism.'
        }
      } else if (role === 'CRITIC') {
        const s = scenario ?? 'accept-round-1'
        if ('reject-all'.startsWith(s) && s === 'reject-all') {
          content = criticJson('REJECT', round)
        } else if (s === 'accept-round-1') {
          content = criticJson('ACCEPT', round)
        } else if (s === 'accept-round-2') {
          content = criticJson(round === 1 ? 'REVISE' : 'ACCEPT', round)
        } else if (s === 'accept-round-3') {
          content = criticJson(round < 3 ? 'REVISE' : 'ACCEPT', round)
        } else {
          content = criticJson('ACCEPT', round)
        }
      } else if (role === 'JUDGE') {
        const risk = fault?.id?.toLowerCase().includes('high') ? 'HIGH' : fault?.id?.toLowerCase().includes('medium') ? 'MEDIUM' : 'LOW'
        const decision = scenario === 'judge-reject' ? 'REJECT' : 'APPROVE'
        content = judgeJson(decision, risk)
      } else {
        error = `TEST provider: unsupported role ${role}`
      }

      return {
        ok: content !== null,
        status: content !== null ? 'COMPLETE' : 'FAILED',
        provider: 'test',
        mode: 'TEST',
        model: MODEL,
        content: content ?? undefined,
        error: error ?? undefined,
        promptTokens: 1,
        completionTokens: 1,
      }
    },
  }
}