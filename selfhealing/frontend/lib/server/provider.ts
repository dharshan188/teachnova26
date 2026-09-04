import 'server-only'

// Phase 9 — provider factory. Resolves the active AI provider from
// environment configuration. Production default is Groq (REAL). The TEST
// provider is only selectable when explicitly enabled AND not in a production
// build (never shows as production telemetry). Ollama remains a readiness stub.

import { createGroqProvider } from './providers/groq'
import { createTestProvider } from './providers/test'
import { createOllamaProvider } from './providers/ollama'
import type { AIProvider } from './providers/types'

export function testModeEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false
  const flag = (process.env.SELF_HEALING_TEST_MODE ?? '').trim().toLowerCase()
  return flag === '1' || flag === 'true' || flag === 'yes'
}

let cached: AIProvider | null = null

export function getProvider(): AIProvider {
  if (cached) return cached
  const env = (process.env.AI_PROVIDER ?? 'groq').trim().toLowerCase()
  if (env === 'test' && testModeEnabled()) {
    cached = createTestProvider()
  } else if (env === 'ollama') {
    cached = createOllamaProvider()
  } else {
    cached = createGroqProvider()
  }
  return cached
}

/** Test-only reset so verify scripts can switch providers per phase. */
export function resetProviderCache(): void {
  cached = null
}

export function providerConfiguredModel(): string {
  return getProvider().configuredModel()
}

export async function providerOfferedModels(): Promise<string[] | null> {
  return getProvider().probeModels()
}

export function providerModeLabel(): 'REAL' | 'TEST' {
  return getProvider().mode
}

export function providerName(): string {
  return getProvider().name
}