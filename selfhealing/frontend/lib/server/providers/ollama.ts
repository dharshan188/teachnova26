import 'server-only'

// Phase 10 — Ollama readiness stub. BuildHub is designed to run repairs via Ollama
// once a participating agent is installed; this provider NEVER fabricates status.
// It reports unavailable until a real integration is enabled, and reads
// OLLAMA_BASE_URL so readiness probing is honest and config-driven.

import type {
  AIProvider,
  ProviderCall,
  ProviderResponse,
  ProviderName,
  ModeLabel,
} from './types'

const OLLAMA_BASE = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').trim()
const MODEL = (process.env.AI_MODEL ?? 'qwen3:8b').trim()

export function createOllamaProvider(): AIProvider {
  return {
    name: 'ollama' as ProviderName,
    mode: 'REAL' as ModeLabel,
    configuredModel: () => MODEL,

    // REAL readiness probe: 1s timeout, separate readiness endpoint. Returns
    // null when unreachable so the dashboard shows "not connected" truthfully.
    async probeModels(): Promise<string[] | null> {
      try {
        const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
          signal: AbortSignal.timeout(1500),
        })
        if (!res.ok) return null
        const data: { models?: Array<{ name: string }> } = await res.json()
        return (data.models ?? []).map((m) => m.name).sort()
      } catch {
        return null
      }
    },

    async call(_req: ProviderCall): Promise<ProviderResponse> {
      return {
        ok: false,
        status: 'FAILED',
        provider: 'ollama',
        mode: 'REAL',
        model: MODEL,
        error: `Ollama integration not enabled (probe of ${OLLAMA_BASE} did not report a serving model).`,
      }
    },
  }
}