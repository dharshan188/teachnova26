# Telegram Alerting — Technical Guide

Operational documentation for BuildHub's Telegram alert conduit (`lib/server/telegram.ts` + `lib/server/notifications/summary.ts` and everything that surfaces delivery state).

## 1. Scope

Every Telegram alert BuildHub sends is a **real, persisted delivery record** (`TelegramNotification` row). Nothing is fabricated: a message is only recorded as `SENT` when the Telegram API returned `ok:true` with a real `message_id`. When Telegram is not configured the send path is a no-op and never writes a fake "sent" row.

The delivery log is **append-only audit state**: rows are never updated in place, so the UI, PDF report, SSE realtime feed and AI chat all read the same honest history.

## 2. Configuration (`frontend/.env`, do NOT commit real values)

| Variable | Purpose |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Bot token (never logged, never persisted, never echoed by any API). |
| `TELEGRAM_CHAT_ID` | Destination chat/group id. |

Helpers:

- `telegramConfig()` → `{ configured: boolean, chatId }`. Configured only when token AND chat id are both present.

## 3. Transport (IPv4-forced, hardened)

`lib/server/telegram.ts` uses a direct `node:https` request to `api.telegram.org:443`:

- The request path is always `/bot<token><method>` (e.g. `/bot<token>/sendMessage`, `/bot<token>/getMe`). The token is required in the path — omitting the `/bot<token>` prefix makes the API return 404, and tokens must never be logged or echoed in errors.

- `family: 4` + `autoSelectFamily: false` — forces IPv4. The default Node socket path (Happy Eyeballs) intermittently hangs on `api.telegram.org` AAAA records and produces `ETIMEDOUT` even though `curl -4` works; this was the root cause of the original flaky delivery.
- `rejectUnauthorized: true`, `timeout: API_TIMEOUT_MS` (12s).
- Messages sent with `parse_mode: 'HTML'` and `disable_web_page_preview: true`; text truncated to 4000 chars on the wire.
- Escaping for HTML mode: `escapeTelegramText()` (escapes `&`, `<`, `>`).

> The options object is cast `as https.RequestOptions` because `@types/node` (20.x) does not type `autoSelectFamily` on http/https `RequestOptions` (it is net-level only). Keep that cast if you touch this code.

### Retry policy

Transient failures (network-level `statusCode === 0`, or HTTP `429`/`5xx`) are retried up to `MAX_SEND_ATTEMPTS = 3` with backoff `600ms * attempt`. HTTP `400`/`401`/`403` API rejections are **never** retried. A rejected bot token is sanitized to the generic message "Telegram bot token rejected by the API (400).".

## 4. Delivery contracts

`sendTelegram({ type, message, incidentId, severity })` returns:

```ts
{ ok, configured, deliveryStatus: 'SENT' | 'FAILED' | 'SKIPPED_DUPLICATE',
  telegramMessageId: string | null, error: string | null }
```

Persisted row (`TelegramNotification`):

| Field | Notes |
| --- | --- |
| `incidentId` | nullable — TEST messages have no incident but are still recorded (append-only audit, so a successful conduit test shows up in the feed). |
| `type` | `INCIDENT`, `ESCALATION`, `TEST`, `HIGH_RISK_APPROVAL_REQUIRED`, `REPAIR_APPLIED`, `REPAIR_FAILED`, `ROLLBACK_COMPLETED`, `RECOVERY`, `FINAL_SUMMARY`. |
| `severity` | incident severity at send time. |
| `chatId` | destination. |
| `message` | truncated to 2000 chars for storage. |
| `deliveryStatus` | `QUEUED` (legacy) / `SENT` / `FAILED` / `SKIPPED_DUPLICATE`. |
| `telegramMessageId` | real Telegram `message_id` when SENT. |
| `error` | sanitized, ≤ 500 chars, never contains the token. |
| `lastSentAt` | set only on SENT. `createdAt` is the row timestamp. |

### Permanent dedupe

At most ONE `SENT` message per `(incidentId, type)`. A later attempt for the same key records a `SKIPPED_DUPLICATE` row ("Duplicate delivery skipped — a SENT message already exists for this incident and type.") and is never sent again. A `SKIPPED_DUPLICATE` row therefore only ever appears **after** a SENT row for the same key.

There is intentionally **no** `@@unique([incidentId, type])` on the table — the guarantee is enforced by `telegramAlreadySent()` at send time, and the DB stays append-only so the audit trail can show every attempt.

## 5. Canonical briefing (`lib/server/notifications/brief.ts`)

Every incident-facing message is built from **ONE persisted source of truth** — `buildIncidentBrief(incidentId)` — so "what Telegram received" == "what the dashboard, PDF report and AI chat show". A brief is assembled only from real `Incident`, `RepairAttempt`, `AgentRun`, `PatchRecord`, `Approval` and `TelegramNotification` rows. If a step never ran it renders as `n/a` or `Pending AI analysis…` — never as a made-up value. Helpers: `isAttackIncident` (metadata `faultId` absent AND detected-by is the security-log-analyzer), `parseProbeResult` (shared validation-probe parser), `approvalDecision`, `finalStateOf`.

The Incident detail page, PDF section 6.6 and the AI chat all consume the same builder, so every surface agrees by construction.

## 6. Message lifecycle (`lib/server/notifications/summary.ts`)

| Type | When | Builder |
| --- | --- | --- |
| `INCIDENT` | On incident creation (`createFaultIncident` → `sendIncidentAlert(incident)`); attack-aware header (`🚨 BUILDHUB INCIDENT DETECTED` / `🛡️ BUILDHUB ATTACK DETECTED`) with the full ten-section brief: PROBLEM, TRIGGER, ROOT CAUSE, LOCATION, AI ANALYSIS, PROPOSED FIX, CODE CHANGE, VALIDATION, RISK POLICY (+ ATTACK TELEMETRY for security-log-analyzer incidents). | `buildIncidentAlertMessage` |
| `ESCALATION` | LOW/MEDIUM auto-repair: after risk classification, `sendRepairPlanMessage(incident)` pushes the repair plan (`🟢/🟡 … AUTO-APPLY`, "auto-apply → validate → keep if PASS → rollback if FAIL"). For attack incidents the legacy analysis completion uses `buildAttackAnalysisMessage` (`🛡️ BUILDHUB ATTACK — AI ASSESSMENT`, honest DETECTION / MITIGATION / SELF-HEALING telemetry via `alertTelegramForIncident` in `lib/server/security.ts`). | `buildRepairPlanMessage` / `buildAttackAnalysisMessage` |
| `HIGH_RISK_APPROVAL_REQUIRED` | HIGH-risk repair instead of an ESCALATION: `⚠️ HUMAN ACTION REQUIRED` with `Reply PROCEED <id>` / `Reply REJECT <id>` and a 5-minute expiry. Nothing is auto-applied until the operator decides. `notifyApproval(incident)` → `buildApprovalRequiredMessage`. | `buildApprovalRequiredMessage` |
| `FINAL_SUMMARY` | Terminal summary for every finished incident, sent by `sendIncidentTerminalSummary(incident)` (dedupe: 1 per incident): `✅ BUILDHUB REPAIR SUCCESSFUL` (RESOLVED), `🔄 REPAIR FAILED — ROLLBACK` (ROLLED_BACK, validation FAIL + known-good), `🛑 HIGH-RISK REPAIR REJECTED`, `⏰ APPROVAL EXPIRED`, or `⚠️ AI REPAIR FAILED`. Always includes `System Health` / `Cyber Score` / `Site Risk` lines. | `loadTerminalSummaryFacts` + `buildTerminalSummaryText` |
| `REPAIR_APPLIED`, `REPAIR_FAILED`, `ROLLBACK_COMPLETED`, `RECOVERY` | Engine lifecycle notifications (reserved types, wired through `notifyRepair`). | engine → `sendTelegram` |

**Message budget per incident (flood control):** `INCIDENT` (1) → `ESCALATION` OR `HIGH_RISK_APPROVAL_REQUIRED` (1) → `FINAL_SUMMARY` (1). Permanent dedupe (section 4) enforces "one SENT per (incident, type)".

`loadTerminalSummaryFacts(incident)` assembles the terminal facts (patch, latest approval, latest attempt, validation/probe result) plus a `systemSnapshot()` (active incidents, site risk, cyber-safety score, health) derived locally so the terminal line says the same thing the Overview shows — without an import cycle.

## 7. Connectivity check

`checkTelegramConnectivity()` → `{ configured, reachable, botUsername, latencyMs, error }`: calls real `GET /getMe` and reports the bot username + measured latency. Used by:

- `GET /api/security/status` (telegram block, see below)
- `POST /api/telegram/test`
- the `/ai/security` Telegram card (via the status API)

## 8. Surface API (`GET /api/security/status`)

The `telegram` object returned when authenticated:

```
{
  configured,
  chatId,
  status: { configured, reachable, botUsername, latencyMs, error, checkedAt },
  lastDelivery: RowDTO | null,          // single most recent TelegramNotification
  lastIncident: { ..., telegram: [rowDTO × 3] } | null,  // most recent incident + its latest deliveries
  recent: [rowDTO × 12]                 // newest 12 deliveries
}
```

`RowDTO` = `{ id, type, severity, deliveryStatus, telegramMessageId, error, chatId, createdAt, lastSentAt, incidentId, incidentRef }`.

Client type mirrors live in `frontend/lib/api/security.ts` (`DeliveryStatus`, `NotificationType`, telegram block DTOs). Keep the client and server shapes in sync.

## 9. Realtime feed (SSE)

`GET /api/security/events` is an authenticated Server-Sent Event stream:

- Event `snapshot` on connect: `{ rows, lastIncident, checkedAt }` — first payload.
- Event `delivery` afterwards: rows newer than the last seen id, polled from the DB every ~4s. If the last seen id has scrolled out of the recent window the whole window is pushed (never `slice(0,-1)`).
- Event `lifecycle`: on connect an `LifecycleEventDTO` snapshot, then per-poll diffs of the incident lifecycle — `incidents`, `events`, `agentRuns`, `approvals`, `repairs` (newest 12 each) — so the Overview "Incident Lifecycle" feed shows detection → agent rounds → approvals → repair outcomes in real time.
- Comment keep-alive every ~15s.
- HTML/SSE headers include `X-Accel-Buffering: no`, `no-cache`, `no-transform`, `Connection: keep-alive`.

Client helper: `subscribeSecurityEvents({ onSnapshot, onDelivery, onLifecycle, onError, onClose })` (EventSource; call the returned `close()` to unsubscribe). Consumed live by the Command Center Overview (Telegram Delivery + Incident Lifecycle cards) and the Security view.

## 10. PDF report

Section 6.5 "Alert Delivery" renders the real delivery rows (SENT / FAILED / SKIPPED_DUPLICATE coloring). Section 6.6 "Terminal Summary" renders the exact `terminalSummary.text` produced by the canonical builder — the same text that was stored in the `FINAL_SUMMARY` delivery row. The report route reads from the same `telegramNotifications` include + `loadTerminalSummaryFacts` used by the UI.

## 11. AI chat context

`POST /api/ai/chat` (REAL mode) builds its system context from the **same canonical brief** as Telegram (`buildIncidentBrief(latestIncident.id)`) plus 24h delivery counts — so the bot answers from real, persisted facts and can never invent incident state. When the latest delivery FAILED the context states **"telegram delivery failed."** explicitly so the operator can be told the alert channel is down. In hermetic TEST mode the provider is never called and a fixed TEST-mode reply is returned.

## 12. Testing

- `node scripts/test-telegram-integration.mjs` — HTTP surface contract (login, status telegram block, `POST /api/telegram/test`, incident detail delivery array) + DB schema checks (enums include `SKIPPED_DUPLICATE` and all `NotificationType`s; no unique index on `(incidentId, type)`). `--skip-send` avoids actually sending a TEST message.
- `node scripts/test-incident-briefing.mjs` — the 17 Teleind canonical-briefing checks against real persisted state: message types, permanent dedupe, message persistence, ten-section INCIDENT contract, no-fabrication (pending AI facts render as pending), LOW/MEDIUM AUTO-APPLY ESCALATION, HIGH approval contract, terminal header == final state, stored FINAL_SUMMARY == detail/PDF terminal text, System-Health lines, ROLLED_BACK honesty, REJECTED/EXPIRED "no code change" honesty, attack honesty, AI-chat uses the canonical brief + `Telegram delivery failed` phrase, SSE lifecycle frame, no terminal while approval pending, and no token/chat-id leakage. Content-signature scoped: pre-revision legacy alerts (no `TRIGGER` section) are reported, not asserted.
- `python3 scripts/e2e_telegram_notifications.py` — browser E2E: activates MEDIUM-01 → INCIDENT alert → triggers the defect → runs the repair pipeline (`POST /api/security/run`) → asserts `ESCALATION` auto-apply + `FINAL_SUMMARY` terminal rows are SENT (one each), terminalSummary carries System Health/Cyber Score with a known terminal state, status `lastDelivery` SENT, PDF report, delivery row rendering on incident detail, the terminal brief card, the Overview Telegram Delivery + Incident Lifecycle cards and the AI chat endpoint; then deactivates the fault. Requires the dev server + real credentials in `.env` (deterministic runs pair it with a `SELF_HEALING_TEST_MODE=true AI_PROVIDER=test` server).

## 13. Forbidden

- Never log or return the bot token.
- Never persist the token or secrets in message bodies/responses.
- Never record a SENT row without an `ok:true` Telegram response.