import 'server-only'

import https from 'node:https'

import { prisma } from './db'
import type { IncidentSeverity, NotificationType } from '@prisma/client'

// Phase 8 / 8.5 — Telegram alert conduit (hardened).
//
// Safety contract:
//   - The bot token is read from TELEGRAM_BOT_TOKEN, never logged, never stored
//     in the DB, never included in messages or API responses.
//   - Messages are plain operational text (no secrets, no tokens).
//   - When Telegram is not configured the send is a no-op returning
//     `configured:false` — it never persists a fake "sent" row.
//   - Transport: direct `node:https` with an IPv4-forced lookup
//     (`family: 4` + `autoSelectFamily: false`). The default Node socket path
//     (Happy Eyeballs) intermittently hangs on IPv6 `api.telegram.org` AAAA
//     records in dev environments, producing ETIMEDOUT while `curl -4` works.
//   - Retry: transient network/timeout/5xx/429 failures are retried up to
//     MAX_SEND_ATTEMPTS with a short backoff. API rejections (400/401/403)
//     are never retried.
//   - Dedupe (permanent): at most ONE SENT message per (incident, type). A
//     later attempt for the same key is recorded as SKIPPED_DUPLICATE so the
//     delivery log stays an honest, append-only audit trail. SKIPPED_DUPLICATE
//     rows therefore only ever exist after a SENT row for the same key.

export interface TelegramConfigResult {
  configured: boolean
  chatId: string | null
}

export function telegramConfig(): TelegramConfigResult {
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim() || null
  return {
    configured: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && chatId),
    chatId,
  }
}

function telegramToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? ''
  return token
}

export interface SendTelegramResult {
  ok: boolean
  configured: boolean
  deliveryStatus: 'SENT' | 'FAILED' | 'SKIPPED_DUPLICATE'
  telegramMessageId: string | null
  error: string | null
}

interface SendTelegramOptions {
  type: NotificationType
  message: string
  incidentId?: string | null
  severity?: IncidentSeverity | null
}

// ---------------------------------------------------------------------------
// Reliable HTTPS transport (IPv4-forced) + retry
// ---------------------------------------------------------------------------

interface TelegramApiResult {
  ok: boolean
  statusCode: number
  data: {
    ok?: boolean
    result?: { message_id?: number; username?: string } | null
    description?: string
    error_code?: number
  } | null
  error: string | null
  latencyMs: number
}

function telegramApiRequest(
  token: string,
  method: 'GET' | 'POST',
  path: string,
  body: Record<string, unknown> | null,
  timeoutMs: number,
): Promise<TelegramApiResult> {
  const payload = body === null ? null : JSON.stringify(body)
  const startedAt = Date.now()
  return new Promise((resolve) => {
    let settled = false
    const finish = (result: TelegramApiResult) => {
      if (!settled) {
        settled = true
        resolve(result)
      }
    }

    const request = https.request(
      {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${token}${path}`,
        method,
        headers: payload
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          : undefined,
        family: 4,
        autoSelectFamily: false,
        timeout: timeoutMs,
        rejectUnauthorized: true,
      } as https.RequestOptions,
      (response) => {
        let raw = ''
        response.setEncoding('utf8')
        response.on('data', (chunk: string) => {
          raw += chunk
        })
        response.on('end', () => {
          let data: TelegramApiResult['data'] = null
          try {
            data = raw ? (JSON.parse(raw) as TelegramApiResult['data']) : null
          } catch {
            data = null
          }
          finish({
            ok: response.statusCode != null && response.statusCode >= 200 && response.statusCode < 300,
            statusCode: response.statusCode ?? 0,
            data,
            error: null,
            latencyMs: Date.now() - startedAt,
          })
        })
      },
    )

    request.on('timeout', () => {
      request.destroy(new Error(`Telegram request timed out after ${timeoutMs}ms`))
    })
    request.on('error', (err) => {
      finish({ ok: false, statusCode: 0, data: null, error: err.message, latencyMs: Date.now() - startedAt })
    })
    if (payload) request.write(payload)
    request.end()
  })
}

export const MAX_SEND_ATTEMPTS = 3
const RETRY_BASE_MS = 600
const API_TIMEOUT_MS = 12000

function isRetryable(result: TelegramApiResult): boolean {
  if (result.ok) return false
  // Network-level transport failure (DNS/socket/timeout).
  if (result.statusCode === 0) return true
  // Transient HTTP failures only — never 400/401/403 API rejections.
  return result.statusCode === 429 || result.statusCode >= 500
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Telegram's sendMessage `text` is hard-capped at 4096 characters. We send at
// most TELEGRAM_MSG_LIMIT characters per part (a small buffer under the cap so
// HTML entities such as &lt; that expand on the wire never exceed it). A part
// must never drop a trailing section, so long messages are split into separate
// messages at section (newline) boundaries instead of being hard-sliced.
const TELEGRAM_MSG_LIMIT = 4000

function preTagsBalanced(section: string): boolean {
  const opens = (section.match(/<pre>/g) ?? []).length
  const closes = (section.match(/<\/pre>/g) ?? []).length
  const codeOpens = (section.match(/<code>/g) ?? []).length
  const codeCloses = (section.match(/<\/code>/g) ?? []).length
  return opens === closes && codeOpens === codeCloses
}

function splitTelegramText(text: string, max = TELEGRAM_MSG_LIMIT): string[] {
  if (text.length <= max) return [text]
  const parts: string[] = []
  let rest = text
  while (rest.length > max) {
    let cut = -1
    const earliest = Math.floor(max / 2)
    const latest = max
    for (let i = latest; i > earliest; i -= 1) {
      if (rest[i] === '\n' && preTagsBalanced(rest.slice(0, i))) {
        cut = i
        break
      }
    }
    if (cut === -1) {
      // No safe section break: hard-cut at max, then back off so we never
      // split a lone <pre>/<code> (which would break HTML parse_mode).
      const hard = max
      if (preTagsBalanced(rest.slice(0, hard))) {
        cut = hard
      } else {
        const tagStart = rest.slice(0, hard).lastIndexOf('<')
        cut = tagStart > earliest ? tagStart : hard
      }
    }
    parts.push(rest.slice(0, cut).replace(/\s+$/, ''))
    rest = rest.slice(cut).replace(/^\s+/, '')
  }
  if (rest.length > 0) parts.push(rest)
  return parts
}

async function sendSingleMessage(
  token: string,
  chatId: string,
  text: string,
): Promise<TelegramApiResult | null> {
  let last: TelegramApiResult | null = null
  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt += 1) {
    last = await telegramApiRequest(
      token,
      'POST',
      '/sendMessage',
      {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      },
      API_TIMEOUT_MS,
    )
    if (last.ok) break
    if (!isRetryable(last) || attempt === MAX_SEND_ATTEMPTS) break
    await delay(RETRY_BASE_MS * attempt)
  }
  return last
}

async function deliverMessage(
  token: string,
  chatId: string,
  text: string,
): Promise<{ ok: boolean; telegramMessageId: string | null; error: string | null }> {
  const parts = splitTelegramText(text)
  let firstId: string | null = null
  let lastError: string | null = null

  for (const part of parts) {
    const last = await sendSingleMessage(token, chatId, part)
    if (last === null) {
      lastError = 'Telegram request failed'
      break
    }
    if (last.ok) {
      if (firstId === null && last.data?.result?.message_id != null) {
        firstId = String(last.data.result.message_id)
      }
      continue
    }
    const rawError =
      last.error ??
      (last.data?.description ? `Telegram API ${last.statusCode}: ${last.data.description}` : `Telegram API ${last?.statusCode ?? 'unknown'}`)
    lastError = tokenRejected(rawError)
      ? 'Telegram bot token rejected by the API.'
      : rawError.slice(0, 300)
    break
  }

  if (lastError === null && parts.length > 0) {
    return { ok: true, telegramMessageId: firstId, error: null }
  }
  return { ok: false, telegramMessageId: firstId ?? null, error: lastError }
}

function tokenRejected(rawError: string): boolean {
  return /invalid token|unauthorized|bot token|404/i.test(rawError)
}

// ---------------------------------------------------------------------------
// Delivery record persistence (append-only)
// ---------------------------------------------------------------------------

type RecordedStatus = 'SENT' | 'FAILED' | 'SKIPPED_DUPLICATE'

async function recordDelivery(
  incidentId: string | null,
  type: NotificationType,
  severity: IncidentSeverity | null,
  chatId: string,
  message: string,
  deliveryStatus: RecordedStatus,
  telegramMessageId: string | null,
  error: string | null,
): Promise<void> {
  await prisma.telegramNotification.create({
    data: {
      incidentId,
      type,
      severity,
      chatId,
      message,
      deliveryStatus,
      telegramMessageId,
      error: error?.slice(0, 500) ?? null,
      lastSentAt: deliveryStatus === 'SENT' ? new Date() : null,
    },
  })
}

/** True when a real SENT message already exists for this (incident, type). */
export async function telegramAlreadySent(
  incidentId: string,
  type: NotificationType,
): Promise<boolean> {
  const row = await prisma.telegramNotification.findFirst({
    where: { incidentId, type, deliveryStatus: 'SENT' },
    select: { id: true },
  })
  return row !== null
}

// ---------------------------------------------------------------------------
// Public send
// ---------------------------------------------------------------------------

export async function sendTelegram({
  type,
  message,
  incidentId = null,
  severity = null,
}: SendTelegramOptions): Promise<SendTelegramResult> {
  const config = telegramConfig()
  if (!config.configured) {
    return {
      ok: false,
      configured: false,
      deliveryStatus: 'FAILED',
      telegramMessageId: null,
      error: 'Telegram not configured (set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID).',
    }
  }
  const chatId = config.chatId ?? ''
  const token = telegramToken()

  // Permanent dedupe: one SENT message per (incident, type). A repeat attempt
  // is recorded as SKIPPED_DUPLICATE and never sent again.
  if (incidentId && (await telegramAlreadySent(incidentId, type))) {
    await recordDelivery(incidentId, type, severity, chatId, message, 'SKIPPED_DUPLICATE', null, 'Duplicate delivery skipped — a SENT message already exists for this incident and type.')
    return {
      ok: false,
      configured: true,
      deliveryStatus: 'SKIPPED_DUPLICATE',
      telegramMessageId: null,
      error: 'Duplicate delivery skipped — a SENT message already exists for this incident and type.',
    }
  }

  const delivered = await deliverMessage(token, chatId, message)

  await recordDelivery(
    incidentId,
    type,
    severity,
    chatId,
    message,
    delivered.ok ? 'SENT' : 'FAILED',
    delivered.telegramMessageId,
    delivered.error,
  )

  return {
    ok: delivered.ok,
    configured: true,
    deliveryStatus: delivered.ok ? 'SENT' : 'FAILED',
    telegramMessageId: delivered.telegramMessageId,
    error: delivered.ok ? null : delivered.error,
  }
}

// ---------------------------------------------------------------------------
// Connectivity check (real health signal for the status API)
// ---------------------------------------------------------------------------

export interface TelegramConnectivity {
  configured: boolean
  reachable: boolean
  botUsername: string | null
  latencyMs: number | null
  error: string | null
}

const CONNECTIVITY_CACHE_TTL_MS = 30_000
let connectivityCache: { result: TelegramConnectivity; at: number } | null = null

export async function checkTelegramConnectivity(): Promise<TelegramConnectivity> {
  const config = telegramConfig()
  if (!config.configured) {
    return { configured: false, reachable: false, botUsername: null, latencyMs: null, error: 'Telegram not configured' }
  }

  const now = Date.now()
  if (connectivityCache && now - connectivityCache.at < CONNECTIVITY_CACHE_TTL_MS) {
    return connectivityCache.result
  }

  const result = await telegramApiRequest(telegramToken(), 'GET', '/getMe', null, API_TIMEOUT_MS)
  let output: TelegramConnectivity
  if (result.ok && result.data?.ok) {
    output = {
      configured: true,
      reachable: true,
      botUsername: typeof result.data.result?.username === 'string' ? result.data.result.username : null,
      latencyMs: result.latencyMs,
      error: null,
    }
  } else {
    output = {
      configured: true,
      reachable: false,
      botUsername: null,
      latencyMs: result.latencyMs,
      error: tokenRejected(result.error ?? '') ? 'Telegram bot token rejected by the API.' : (result.error ?? `Telegram API ${result.statusCode}`),
    }
  }
  connectivityCache = { result: output, at: now }
  return output
}

// ---------------------------------------------------------------------------
// Escaping (HTML parse_mode)
// ---------------------------------------------------------------------------

export function escapeTelegramText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}