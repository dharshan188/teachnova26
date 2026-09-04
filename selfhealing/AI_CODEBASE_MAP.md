# AI Codebase Map — BuildHub Self-Healing Integration

> This document provides the AI Self-Healing System with a structural map of the BuildHub codebase. It enables the AI to locate source files, understand component boundaries, and generate targeted patches.

---

## 1. High-Level Architecture

```
BuildHub (Next.js 16 + TypeScript + Tailwind v4)
│
├── frontend/                    # Next.js App Router application
│   ├── app/                    # App Router pages + API routes
│   │   ├── (app)/              # Authenticated app shell
│   │   │   ├── feed/           # Post feed page
│   │   │   ├── posts/          # Post detail + edit
│   │   │   ├── projects/       # Project list + detail
│   │   │   ├── profile/        # User profile
│   │   │   ├── settings/       # User settings
│   │   │   ├── explore/        # Project exploration
│   │   │   ├── notifications/  # Notifications (placeholder)
│   │   │   └── layout.tsx      # App shell layout
│   │   ├── (auth)/             # Public auth pages
│   │   │   ├── login/          # Login page
│   │   │   └── signup/         # Signup page
│   │   ├── (command)/          # AI Command Center
│   │   │   ├── security/       # Security view + Self-Healing Console chat
│   │   │   ├── incidents/      # Incident list + detail (live transcript)
│   │   │   ├── ai/learning/    # Phase 10 Learning dashboard
│   │   │   ├── pipeline/       # AI Pipeline view
│   │   │   ├── logs/           # Live logs
│   │   │   ├── reports/        # PDF reports
│   │   │   ├── history/        # Incident history
│   │   │   └── layout.tsx      # Command shell
│   │   ├── api/                # API routes (server-side)
│   │   │   ├── auth/           # Authentication
│   │   │   ├── posts/          # Posts CRUD
│   │   │   ├── projects/       # Projects CRUD
│   │   │   ├── comments/       # Comments CRUD
│   │   │   ├── likes/          # Likes
│   │   │   ├── incidents/      # Incident management (+ apply-patch)
│   │   │   ├── observability/  # Metrics + health
│   │   │   ├── security/       # Security findings + AI pipeline + run dispatch
│   │   │   ├── faults/         # Fault injection (activate/deactivate/random/deactivate-all)
│   │   │   ├── ai/             # Chat, memory, learning, rl-dataset, evaluate, experiences, visualization
│   │   │   ├── telegram/       # Test + SSE events stream
│   │   │   ├── approvals/      # Approval workflow
│   │   │   ├── health/         # Health checks
│   │   │   ├── logs/           # Log queries
│   │   │   └── users/          # User profiles
│   │   └── page.tsx            # Landing page
│   │
│   ├── components/             # React components
│   │   ├── ui/                 # Design system primitives
│   │   ├── navigation/         # Sidebar, header, mobile nav
│   │   ├── feedback/           # Loading, error, empty states
│   │   ├── posts/              # Post components
│   │   ├── projects/           # Project components
│   │   ├── profile/            # Profile components
│   │   └── command/            # Command Center components
│   │
│   ├── lib/                    # Shared libraries
│   │   ├── server/             # Server-only modules
│   │   │   ├── db.ts           # Prisma client (with pg adapter)
│   │   │   ├── auth.ts         # Session/auth utilities
│   │   │   ├── logger.ts       # Structured logging
│   │   │   ├── observability.ts # Incident/log/agent serialization
│   │   │   ├── risk.ts         # Deterministic risk engine
│   │   │   ├── security.ts     # Security findings + AI pipeline
│   │   │   ├── ai.ts           # Real Groq Fixer/Critic/Judge (+ TEST hermetic)
│   │   │   ├── telegram.ts     # IPv4-forced transport, append-only delivery + dedupe (ADR-016)
│   │   │   ├── notifications/  # Canonical incident brief + Telegram message builders
│   │   │   │   ├── brief.ts    # buildIncidentBrief — one persisted source of truth
│   │   │   │   └── summary.ts  # INCIDENT/ESCALATION/approval/FINAL_SUMMARY + terminal facts
│   │   │   ├── approval.ts     # Approval state machine (repairAttemptId-bound)
│   │   │   ├── self-healing.ts # Phase 8 single-pass analysis orchestration
│   │   │   ├── fault-injection.ts # Fault registry + disarm/rearm guards
│   │   │   ├── fault-injection-handlers.ts # Runtime fault behaviors (HIGH-03 outage)
│   │   │   ├── repair/         # Phase 9 iterative repair engine
│   │   │   │   ├── engine.ts   # runSelfHealingRepair/continueApprovedRepair/…
│   │   │   │   ├── conversation.ts # Coder/Critic/Judge rounds
│   │   │   │   ├── evidence.ts # error sanitisation/location
│   │   │   │   ├── canonical.ts # oracle baseline fix decision
│   │   │   │   ├── validation.ts # candidate guardrails
│   │   │   │   ├── patch-engine.ts # real file apply + backup/rollback
│   │   │   │   ├── risk.ts     # deterministic fault risk weights
│   │   │   │   ├── events.ts   # timeline events
│   │   │   │   └── ingest.ts   # createFaultIncident (fault → incident)
│   │   │   ├── learning/       # Phase 10 learning loop
│   │   │   │   └── memory.ts   # reward policy, memory/experience, dataset/metrics
│   │   │   ├── report.ts       # PDF generation
│   │   │   ├── routes-map.ts   # Route → source file hints
│   │   │   ├── slugs.ts        # Slug generation
│   │   │   ├── serializers.ts  # API DTO serializers
│   │   │   ├── response.ts     # API response helpers
│   │   │   └── validation.ts   # Zod schemas
│   │   ├── api.ts              # Client API abstraction
│   │   ├── auth.tsx            # Auth context/provider
│   │   └── utils.ts            # Client utilities
│   │
│   ├── prisma/                 # Database schema + migrations
│   │   └── schema.prisma       # Full schema
│   │
│   └── scripts/                # Verification + test scripts
│
├── .agents/                    # Agent skills + configuration
├── AGENTS.md                   # Agent operating instructions
├── PLAN.md                     # Project execution plan
```

---

## 2. Database Schema (Key Models)

### Core Application
- `User` — authentication, profile
- `Session` — opaque DB-backed sessions
- `Post` — content, tags, optional project link
- `Comment` — post comments
- `Like` — post likes (unique user+post)
- `Project` — name, slug, description, status, owner

### Observability + Self-Healing
- `Incident` — detected issues (DETECTED→INVESTIGATING→AWAITING_REVIEW→VALIDATING→RESOLVED|ROLLED_BACK); fault incidents carry `metadata.faultId`
- `IncidentEvent` — timeline events
- `LogEvent` — structured logs (INFO/WARN/ERROR/SECURITY)
- `AgentRun` — AI agent executions (FIXER/CRITIC/JUDGE/CODER, mode=REAL|SIMULATION, `round`/`kind`)
- `Approval` — approval requests (PENDING→APPROVED|REJECTED|EXPIRED→CONSUMED), optional `repairAttemptId` binding
- `SecurityFinding` — analyzer output (fingerprint-deduped)
- `TelegramNotification` — append-only delivery log (write-once rows; SENT/FAILED/SKIPPED_DUPLICATE; permanent dedupe at send time, no `@@unique`)
- `RepairAttempt` — engine repair run (rounds, outcome, finalCandidateId)
- `PatchRecord` — applied patch + backup/rollback path
- `RepairMemory` — terminal repair memory rows
- `RepairExperience` — normalized RL experiences `(state, action, reward, nextState, terminal)`

---

## 3. Key Server Modules (lib/server/)

### `security.ts` — Security Pipeline (Phase 8 analysis for legacy incidents)
- `ingestAnalyzerFindings()` — fingerprint-deduped finding storage
- `promoteFindingsToIncidents()` — findings → incidents + initial `INCIDENT` Telegram alert + queued REAL agent runs
- `runAgentPipeline(incidentId)` — Fixer→Critic→Judge via Groq
- `alertTelegramForIncident()` — `ESCALATION` alert after AI analysis (awaits/rejects).
- `requireSecurityOperator()` — operator authorization guard
- `app/api/security/run` dispatches fault incidents (`metadata.faultId`) to `repair/engine.ts` instead

### `repair/engine.ts` — Iterative Self-Healing Engine (Phase 9, fault incidents)
- `runSelfHealingRepair(incidentId)` — evidence → up to 3 Coder/Critic/Judge rounds → risk → candidate → patch → live probe → RESOLVED/ROLLED_BACK (HIGH risk pauses at `WAITING_APPROVAL` + approval)
- `continueApprovedRepair(incidentId)` — applies approved candidate, validates, consumes approval
- `finalizeFailure(incidentId)` — honest `AI_REPAIR_FAILED` stage
- `persistLearning(incidentId, attempt)` — memory + normalized RL experience (Phase 10)
- `loadFinalCandidate()`, `notifyRepair()` — telegram outcomes

### `learning/memory.ts` — Phase 10 Learning Loop
- `recordRepairMemory()` / `recordRepairExperience()` — from real attempts
- `computeLearningMetrics()`, `computeEvaluationStats(paramString)` — dataset stats + evaluation harness
- `exportRlDataset()` — dataset JSON; visualization aggregates (per-severity win/rollback)
- Reward policy: `REPAIR_REWARD_RESOLVED`/`ROLLED_BACK`/`NEGATIVE` env-tunable (defaults 1.0 / -0.5 / -1.0)

### `ai.ts` — Real Groq Agents (hermetic TEST)
- `callAgent(agent, ctx, prior)` — single agent call (FIXER|CRITIC|JUDGE|CODER)
- `systemPromptFor(agent)` — strict JSON contracts
- `normalizeOutput()` — validates AI response shape
- Provider: Groq (qwen/qwen3.8-27b), 90s timeout; `AI_PROVIDER=test` + `SELF_HEALING_TEST_MODE` + non-production returns deterministic `scenario` contracts (`accept-round-1|2|3`, `reject-all`, `judge-reject`) — scenarios are never sent to Groq

### `approval.ts` — Approval State Machine
- `createApproval({incidentId, patchId, operator, repairAttemptId?})` — creates APR-XXXXX (crypto randomInt id, collision retry only on P2002)
- `getPendingApproval(approvalId)` — fetch PENDING
- `approveApproval(approvalId)` — PENDING→APPROVED
- `rejectApproval(approvalId)` — PENDING→REJECTED
- `expireApproval(approvalId)` — PENDING→EXPIRED (if past expiresAt)
- `consumeApproval(approvalId)` — APPROVED→CONSUMED
- `isExpired(approval)`, `canConsume(approval)`

### `telegram.ts` — Alerting + Append-Only Delivery (ADR-016)
- `sendTelegram({type, message, incidentId, severity})` — IPv4-forced `node:https` (`family: 4` + `autoSelectFamily: false`), 12s timeout, retry ≤3 on network/429/5xx only; `SENT` only on real `ok:true` response; permanent per-`(incidentId, type)` dedupe records `SKIPPED_DUPLICATE`; no-op (no rows) when unconfigured
- `telegramAlreadySent(incidentId, type)` — dedupe check (a SENT row exists)
- `checkTelegramConnectivity()` — real `getMe` probe → `{configured, reachable, botUsername, latencyMs, error}` (status API + Telegram card)
- `telegramConfig()` — `{configured, chatId}` from `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` (token never logged/persisted)
- `escapeTelegramText()` — HTML `parse_mode` escaping

### `notifications/brief.ts` — Canonical Incident Brief (Phase 8.5)
- `buildIncidentBrief(incidentId)` — ONE persisted source of truth for every incident-facing surface (Telegram, incident detail terminal card, PDF §6.6, AI chat). Built only from real `Incident`/`RepairAttempt`/`AgentRun`/`PatchRecord`/`Approval`/`TelegramNotification` rows; missing steps render `n/a` / `Pending AI analysis…`, never invented facts
- `isAttackIncident` (metadata `faultId` absent AND detected-by `security-log-analyzer`), `parseProbeResult` (shared validation-probe parser), `approvalDecision`, `finalStateOf` (REJECTED/EXPIRED precedence over incident status)

### `notifications/summary.ts` — Canonical Message Builders (Phase 8.5)
- `sendIncidentAlert(incident)` — initial `INCIDENT` alert at incident creation (attack-aware, ten briefing sections) via `buildIncidentAlertMessage`
- `sendRepairPlanMessage(incident)` — LOW/MEDIUM `ESCALATION` auto-apply plan after risk classification (`buildRepairPlanMessage`)
- `sendIncidentTerminalSummary(incident)` — terminal `FINAL_SUMMARY` (dedupe: 1 per incident) via `loadTerminalSummaryFacts` + `buildTerminalSummaryText` (headers per final state RESOLVED/ROLLED_BACK/REJECTED/EXPIRED/AI_REPAIR_FAILED, incl. System Health / Cyber Score / Site Risk lines)
- `buildApprovalRequiredMessage` — `HIGH_RISK_APPROVAL_REQUIRED` (candidate brief + `PROCEED <id>`/`REJECT <id>` + 5-min expiry); `buildAttackAnalysisMessage` — attack `ESCALATION` (`🛡️ BUILDHUB ATTACK — AI ASSESSMENT`, honest DETECTION/MITIGATION/SELF-HEALING telemetry)
- `loadTerminalSummaryFacts(incident)` — terminal facts from patch/approval/attempt/validation + local `systemSnapshot()` (avoids observability import cycle) used by message + dashboard + PDF
- `summaryNotificationType()` — retry target for the terminal summary

### `risk.ts` — Deterministic Risk Engine
- `computeSecurityOverview()` — riskScore, cyberSafetyScore, systemHealth, activeIncidents
- `riskTier(riskScore)` — dashboard|incident|heightened|critical
- Pure function of DB state (incidents, log events, security findings)

### `self-healing.ts` — Orchestration
- `runSelfHealingPipeline(incidentId)` — runs AI pipeline + creates approval
- `simulateProceed(approvalId)` — test harness approval path
- `forceValidationFailure(incidentId)` — test harness rollback trigger
- `getIncidentApproval()`, `hasPendingApproval()`

### `routes-map.ts` — Source Hints
- `suspectSourceFor(route)` — route prefix → source file mapping

---

## 4. API Routes (Key Endpoints)

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| POST | `/api/auth/register` | — | User registration |
| POST | `/api/auth/login` | — | Login + session |
| POST | `/api/auth/logout` | session | Logout |
| GET | `/api/auth/me` | session | Current user |
| POST | `/api/posts` | session | Create post |
| GET | `/api/posts` | session | List posts (paginated) |
| PATCH | `/api/posts/[id]` | session+ownership | Edit post |
| DELETE | `/api/posts/[id]` | session+ownership | Delete post |
| POST | `/api/projects` | session | Create project |
| GET | `/api/projects` | session | List projects |
| PATCH | `/api/projects/[id]` | session+ownership | Edit project |
| POST | `/api/posts/[id]/like` | session | Toggle like |
| POST | `/api/posts/[id]/comments` | session | Create comment |
| GET | `/api/health` | — | Public health |
| GET | `/api/observability/summary` | session | Metrics + scores |
| GET | `/api/incidents` | session | List incidents |
| GET | `/api/incidents/[id]` | session | Incident detail (+ `telegram.deliveries`, `terminalSummary`) |
| POST | `/api/incidents/[id]/report` | session | PDF report |
| GET | `/api/security/events` | session | SSE stream (snapshot + delivery + lifecycle + keepalive) |
| POST | `/api/security/findings` | operator | Ingest findings |
| POST | `/api/security/ingest` | operator | Promote findings |
| POST | `/api/security/run` | operator | Run AI pipeline |
| GET | `/api/security/status` | session | Security status (incl. telegram connectivity + last delivery/incident) |
| POST | `/api/telegram/test` | operator | Test Telegram |
| GET | `/api/faults` | operator | List faults (id, severity, difficulty, trigger, symptom, active) |
| POST | `/api/faults` | operator | Activate fault (applies patch + creates incident) |
| POST | `/api/faults/deactivate` | operator | Deactivate one fault |
| POST | `/api/faults/deactivate-all` | operator | Deactivate all faults |
| GET | `/api/faults/random` | operator | Pick one inactive fault (409 if all active) |
| POST | `/api/security/run` | operator | Dispatch: fault incident → repair engine; else analysis pipeline |
| POST | `/api/approvals/create` | operator | Create approval (404 if incident unknown) |
| POST | `/api/approvals/proceed` | operator | Approve/reject (continues bound repair on approve) |
| POST | `/api/incidents/[id]/apply-patch` | session | Apply approved patch |
| POST | `/api/ai/chat` | session | Real Groq operations chat (TEST short-circuit; REAL injects observed Telegram delivery facts) |
| GET | `/api/ai/memory` | session | Repair memory |
| GET | `/api/ai/learning` | session | Phase 10 learning metrics |
| GET | `/api/ai/rl-dataset` | session | RL dataset export |
| GET | `/api/ai/evaluate` | session | Evaluation harness |
| GET | `/api/ai/experiences` | session | Experience timeline |
| GET | `/api/ai/visualization` | session | Visualization aggregates |

---

## 5. Component Boundaries

### Frontend → Backend
- All data access via `lib/api.ts` (typed fetch wrappers)
- No direct DB access from client components
- Server Components used for initial data fetching

### Authentication
- Opaque session tokens (SHA-256 hashed in DB)
- HttpOnly, Secure, SameSite=Lax cookie
- 7-day TTL, validated on each request
- `getSessionUser()` in server modules

### Authorization
- Resource ownership enforced in API routes (403 for non-owners)
- Security operator gate for `/api/security/*` and `/api/telegram/test`
- `SECURITY_OPERATOR_USERNAMES` env var (default: `arjun`)

### Validation
- Zod schemas in `lib/server/validation.ts` + per-route
- Request body, query params, path params validated
- Consistent 400/401/403/404/500 responses

---

## 6. Self-Healing Integration Points

### For the AI System to Monitor:
- `GET /api/health` — component health
- `GET /api/observability/summary` — scores, findings, recent logs
- `GET /api/incidents` — active incidents
- `GET /api/incidents/[id]` — full incident context
- `GET /api/logs` — filtered log events
- `GET /api/security/status` — security posture + model config + telegram connectivity/last delivery
- `GET /api/security/events` — authenticated SSE: snapshot + realtime delivery events + lifecycle diffs (incidents/events/agentRuns/approvals/repairs) via `lib/api/security.ts` `subscribeSecurityEvents({ onSnapshot, onDelivery, onLifecycle, ... })`

### For the AI System to Repair:
1. **Detect** — fault activation creates a fault incident (`metadata.faultId`); security incidents come from the analyzer pipeline
2. **Locate** — `incident.metadata.faultId` → fault registry target file/function (per fault table below); `suspectSourceFor()`
3. **Analyze** — `POST /api/security/run` dispatches to `runSelfHealingRepair(incidentId)` → evidence → up to 3 Coder/Critic/Judge rounds
4. **Generate** — candidate patch from conversation (sandboxed `sourceContext` with TEST-only fault hints; `canonical.ts` provides oracle baseline for tests)
5. **Validate** — structural candidate guardrails + real HTTP probes against `APP_URL || http://localhost:3000`
6. **Approve** — HIGH risk: `WAITING_APPROVAL` + `repairAttemptId`-bound approval; `POST /api/approvals/proceed` continues the repair
7. **Apply** — patch-engine writes the real file, backs it up, disarms the runtime fault guard
8. **Verify** — re-run validation probes against the disarmed handler; `RESOLVED`, or roll back the file + rearm → `ROLLED_BACK`
9. **Learn** — `persistLearning()` writes `RepairMemory` + a normalized `RepairExperience` (Phase 10)

### Key Identifiers:
- Incident: `INC-XXXXX` (ref), `cuid()` (id)
- Approval: `APR-XXXXXX` (approvalId), `cuid()` (id)
- Patch: `PATCH-XXXXXXXX` (patchId)

---

## 7. Fault Injection Targets (Phase 9)

Faults live in `lib/server/fault-injection.ts` (registry) + `fault-injection-handlers.ts` (behaviors). Runtime triggering is gated by the `isFaultGaurded` guard disabled/re-enabled by disarm/rearm. **Activating a fault applies its file patch and creates a fault incident → the repair engine fixes it.** All faults are deactivated in the healthy baseline.

### LOW (auto-apply, auto-validate, auto-rollback)
| ID | File | Line | Function | Fault Type |
|----|------|------|----------|------------|
| LOW-01 | `app/api/posts/route.ts` | ~45 | `POST` handler | Undefined variable |
| LOW-02 | `app/api/posts/[id]/route.ts` | ~62 | `GET` handler | Field typo in response |
| LOW-03 | `lib/server/validation.ts` | ~28 | `postContentSchema` | Wrong condition |

### MEDIUM (auto-apply, auto-validate, auto-rollback)
| ID | File | Line | Function | Fault Type |
|----|------|------|----------|------------|
| MEDIUM-01 | `app/api/posts/route.ts` | ~38 | `POST` handler | Broken API (server error) |
| MEDIUM-02 | `app/api/posts/route.ts` | ~85 | `GET` handler | DB query error |
| MEDIUM-03 | `app/api/projects/[id]/route.ts` | ~72 | `PATCH` handler | Business logic bug |

### HIGH (approval required, validate, rollback)
| ID | File | Line | Function | Fault Type |
|----|------|------|----------|------------|
| HIGH-01 | `app/api/auth/login/route.ts` | ~55 | `POST` handler | Auth bypass |
| HIGH-02 | `app/api/projects/[id]/route.ts` | ~45 | `DELETE` handler | Authz bypass |
| HIGH-03 | `lib/server/fault-injection-handlers.ts` (wired into `app/api/posts/route.ts` GET ~77) | ~85 | `applyFaultBehavior` | DB connectivity (simulated outage → 503) |

---

## 8. Risk Classification Rules

Risk is **not** based on filename alone. Factors:
- Files affected count
- Functions affected count
- Lines changed
- Blast radius (users/requests impacted)
- Security impact (auth, authz, data exposure)
- Authentication involvement
- Authorization involvement
- Database involvement
- Infrastructure involvement
- Data impact (PII, credentials, content)
- Reversibility (easy to revert?)
- Test coverage of affected area
- Dependency changes
- Patch confidence (AI confidence score)

### Thresholds:
- **LOW**: 1 file, 1 function, ≤5 lines, no security/auth/db, reversible, high test coverage
- **MEDIUM**: 1-2 files, 1-3 functions, 5-20 lines, some business logic, reversible
- **HIGH**: Auth/authz/db/infra, >1 file, >20 lines, security-sensitive, low reversibility

---

## 9. Test Commands

```bash
# Start server
cd frontend && npm run dev          # dev server
cd frontend && npm run start        # production server

# Static checks
npm run lint
npx tsc --noEmit
npm run build

# Phase 8 verification
node scripts/verify-observability.mjs
node scripts/verify-security.mjs
python3 scripts/test_security_log_analyzer.py

# API regression
node scripts/verify-posts-projects.mjs

# Browser E2E
python3 scripts/e2e_phase6_full.py
python3 scripts/e2e_phase7_full.py
python3 scripts/e2e_phase8_full.py

# Phase 9 — self-healing verified (fault → incident → engine path)
node scripts/verify-self-healing.mjs        # 80 passed, 0 failed
python3 scripts/e2e_phase9_full.py           # 64 passed, 0 failed

# Phase 10 — learning loop E2E (real LOW-01 + HIGH-01 approval flows)
python3 scripts/e2e_phase10_learning.py      # 50 passed, 0 failed

# Telegram alerting (ADR-016) — needs dev server + real .env creds
node scripts/test-telegram-integration.mjs            # HTTP surface + DB schema contract (--skip-send avoids a real TEST send)
node scripts/test-incident-briefing.mjs               # 17 Teleind checks: canonical brief contract vs persisted SENT messages + detail/PDF + SSE + no-secrets
python3 scripts/e2e_telegram_notifications.py         # MEDIUM-01 → incident → INCIDENT → run-repair → ESCALATION + FINAL_SUMMARY → PDF → UI feeds
```

---

## 10. Environment Variables

Required for self-healing:
```
GROQ_API_KEY=xxx              # Groq inference (server-only)
AI_PROVIDER=groq
AI_MODEL=qwen/qwen3.8-27b
TELEGRAM_BOT_TOKEN=xxx        # Alert bot (server-only)
TELEGRAM_CHAT_ID=xxx          # Destination chat
SECURITY_OPERATOR_USERNAMES=arjun,operator2
COMMAND_CENTER_URL=http://localhost:3000/ai
DATABASE_URL=postgresql://...
AUTH_SECRET=xxx
FAULT_INJECTION_ENABLED=true  # Gates runtime fault behaviors
SELF_HEALING_TEST_MODE=false  # true + AI_PROVIDER=test + non-production → hermetic scenarios
APP_URL=http://localhost:3000 # Probe target for repair validation
REPAIR_REWARD_RESOLVED=1.0    # Phase 10 reward policy (env-tunable)
REPAIR_REWARD_ROLLED_BACK=-0.5
REPAIR_REWARD_NEGATIVE=-1.0
```

---

## 11. Key Conventions

- **No fake data** — all incidents, AI runs, approvals, repair attempts are real DB state
- **No fake AI** — Groq failures → `AI_UNAVAILABLE` / `AI_REPAIR_FAILED`; hermetic TEST `scenario`s are never forwarded to Groq
- **Deterministic risk** — pure function of state; fault risk from registry weights (LOW 10 / MED 25 / HIGH 60 / CRIT 90)
- **Approval binding** — each approval maps to ONE incident + ONE patch + optional `repairAttemptId`; HIGH-risk repairs pause at `WAITING_APPROVAL` on PROCEED
- **Universal rollback** — ALL risk levels rollback (file restore + rearm) on validation failure
- **Fault lifecycle** — activate applies patch + creates incident; disarm/rearm reversible in-memory; deactivate-all clears guards
- **Telegram dedupe** — append-only delivery log; max 1 SENT message per (incident+type), repeats recorded as `SKIPPED_DUPLICATE` (`SENT` only on real `ok:true`; no `@@unique`)
- **Structured logging** — requestId correlation throughout
- **Honest UI** — "Live · Real" badges, no simulation copy; pending approvals render decision=null
- **Honest stages** — engine reports terminal stage (`RESOLVED`, `ROLLED_BACK`, `WAITING_APPROVAL`, `AI_REPAIR_FAILED`), never the pre-repair status

---

## 12. File Locations for Common Fixes

| Issue Type | Likely File |
|------------|-------------|
| Auth bug | `app/api/auth/login/route.ts`, `app/api/auth/register/route.ts`, `lib/server/auth.ts` |
| Post bug | `app/api/posts/route.ts`, `app/api/posts/[id]/route.ts` |
| Project bug | `app/api/projects/route.ts`, `app/api/projects/[id]/route.ts` |
| Comment bug | `app/api/comments/[id]/route.ts`, `app/api/posts/[id]/comments/route.ts` |
| Like bug | `app/api/posts/[id]/like/route.ts` |
| Validation bug | `lib/server/validation.ts` |
| DB bug | `lib/server/db.ts`, `prisma/schema.prisma` |
| Logging bug | `lib/server/logger.ts` |
| Risk bug | `lib/server/risk.ts` |
| Security bug | `lib/server/security.ts` |
| AI bug | `lib/server/ai.ts` |
| Telegram bug | `lib/server/telegram.ts` |
| Telegram message content | `lib/server/notifications/brief.ts` (single source of truth) + `lib/server/notifications/summary.ts` |
| SSE delivery + lifecycle feed | `app/api/security/events/route.ts` (+ client helper `lib/api/security.ts`) |
| Approval bug | `lib/server/approval.ts` |
| Analysis pipeline bug | `lib/server/security.ts` |
| Repair engine bug | `lib/server/repair/engine.ts`, `lib/server/repair/*` |
| Learning loop bug | `lib/server/learning/memory.ts`, `app/api/ai/*` |
| Fault registry/handlers | `lib/server/fault-injection.ts`, `lib/server/fault-injection-handlers.ts` |

---

*Generated for BuildHub Phase 9 + Phase 10 — AI Self-Healing + Learning Integration*