import 'server-only'

import type {
  AIProvider,
  ProviderCall,
  ProviderResponse,
  ProviderName,
  ModeLabel,
} from './types'

// Phase 9 — production Groq provider. OpenAI-compatible endpoint; the model is
// taken from AI_MODEL and validated live against Groq's catalog during startup
// probes. The key comes from GROQ_API_KEY (server-only) and is never logged,
// stored, or returned to the browser. Every failure path returns a structured
// FAILED result — this provider never throws.

const GROQ_BASE = 'https://api.groq.com/openai/v1'
const REQUEST_TIMEOUT_MS = 120_000
const DEFAULT_MODEL = 'qwen/qwen3.8-27b'
// Rate-limit (429) and 5xx retries keep the escape-room demo reliable on the
// small on_demand Groq tier (per-minute token caps are easily hit by the
// multi-round Coder/Critic/Judge pipeline). Retries back off briefly and give
// up after MAX_RETRIES so a genuinely dead provider still surfaces honestly.
const MAX_RETRIES = 3
const RETRY_TARGETS = new Set([429, 500, 502, 503, 504])
const RETRY_DELAY_MS = [800, 2500, 6000]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function model(): string {
  return (process.env.AI_MODEL ?? '').trim() || DEFAULT_MODEL
}

let modelProbe: { offered: string[] | null; checkedAt: number } | null = null

export function createGroqProvider(): AIProvider {
  return {
    name: 'groq' as ProviderName,
    mode: 'REAL' as ModeLabel,

    configuredModel: model,

    /** Validates the configured model against /v1/models (cached 10 min). */
    async probeModels(): Promise<string[] | null> {
      const now = Date.now()
      if (modelProbe && now - modelProbe.checkedAt < 10 * 60 * 1000) {
        return modelProbe.offered
      }
      const key = process.env.GROQ_API_KEY?.trim()
      if (!key) {
        modelProbe = { offered: null, checkedAt: now }
        return null
      }
      try {
        const res = await fetch(`${GROQ_BASE}/models`, {
          headers: { authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(15000),
        })
        if (!res.ok) {
          modelProbe = { offered: null, checkedAt: now }
          return null
        }
        const data: { data?: Array<{ id: string }> } = await res.json()
        const offered = (data.data ?? []).map((m) => m.id).sort()
        modelProbe = { offered, checkedAt: now }
        return offered
      } catch {
        modelProbe = { offered: null, checkedAt: now }
        return null
      }
    },

    async call(req: ProviderCall): Promise<ProviderResponse> {
      const key = process.env.GROQ_API_KEY?.trim()
      if (!key) {
        return {
          ok: false,
          status: 'FAILED',
          provider: 'groq',
          mode: 'REAL',
          model: model(),
          error: 'GROQ_API_KEY is not configured.',
        }
      }
      try {
        let response: Awaited<ReturnType<typeof fetch>> | null = null
        let lastDetail = ''
        let attempts = 0
        while (attempts <= MAX_RETRIES) {
          try {
            response = await fetch(`${GROQ_BASE}/chat/completions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                authorization: `Bearer ${key}`,
              },
              body: JSON.stringify({
                model: req.model,
                messages: req.messages,
                temperature: req.temperature,
                max_tokens: req.maxTokens,
              }),
              signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            })
          } catch (err) {
            if (attempts < MAX_RETRIES && /timed? ?out|abort|ECONNRESET|fetch failed/i.test(err instanceof Error ? err.message : '')) {
              attempts += 1
              await sleep(RETRY_DELAY_MS[Math.min(attempts, RETRY_DELAY_MS.length - 1)])
              continue
            }
            throw err
          }

          if (response.ok) break

          const body = await response.text().catch(() => '')
          lastDetail = body?.slice?.(0, 300) ?? ''
          if (RETRY_TARGETS.has(response.status) && attempts < MAX_RETRIES) {
            attempts += 1
            await sleep(RETRY_DELAY_MS[Math.min(attempts, RETRY_DELAY_MS.length - 1)])
            continue
          }

          return {
            ok: false,
            status: 'FAILED',
            provider: 'groq',
            mode: 'REAL',
            model: req.model,
            error: `Groq API ${response.status}${lastDetail ? ` · ${lastDetail}` : ''}`.slice(0, 500),
          }
        }

        if (!response || !response.ok || !response.body) {
          if (!lastDetail && response && response.status) {
            lastDetail = `HTTP ${response.status}`
          }
          return {
            ok: false,
            status: 'FAILED',
            provider: 'groq',
            mode: 'REAL',
            model: req.model,
            error: `Groq API ${response?.status ?? 'unknown'}${lastDetail ? ` · ${lastDetail}` : ''}`.slice(0, 500),
          }
        }

        const data: {
          choices?: Array<{ message?: { content?: string } }>
          usage?: { prompt_tokens?: number; completion_tokens?: number }
        } = await response.json()
        const content = data.choices?.[0]?.message?.content
        if (!content) {
          return {
            ok: false,
            status: 'FAILED',
            provider: 'groq',
            mode: 'REAL',
            model: req.model,
            error: 'Groq returned an empty completion.',
          }
        }
        return {
          ok: true,
          status: 'COMPLETE',
          provider: 'groq',
          mode: 'REAL',
          model: req.model,
          content,
          promptTokens: data.usage?.prompt_tokens ?? null,
          completionTokens: data.usage?.completion_tokens ?? null,
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown AI call failure'
        const timedOut = /timed? ?out|abort/i.test(message) ? ' (timed out after 120s)' : ''
        return {
          ok: false,
          status: 'FAILED',
          provider: 'groq',
          mode: 'REAL',
          model: req.model,
          error: `Groq call failed${timedOut}${err instanceof Error ? ` · ${message}` : ''}`.slice(0, 500),
        }
      }
    },
  }
}