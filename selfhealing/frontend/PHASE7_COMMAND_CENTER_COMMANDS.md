# Phase 7 — AI Command Center: Commands & Validation

Deterministic runbook for the phase. All commands run from `frontend/`.

## Quick start

```bash
# 1. Database must be running (Docker container `buildhub-pg`)
docker start buildhub-pg                      # if stopped

# 2. Prisma client should already be generated; if you just pulled a new
#    schema, regenerate (ours matches the committed migrations):
npx prisma generate

# 3. Load demo data (idempotent). Creates users + posts/projects (no-op if
#    `arjun` exists) and 4 demo incidents + 30 log events (no-op if INC-00021
#    exists):
npm run db:seed        # = node prisma/seed.mjs

# 4. Start the dev server
npm run dev            # http://localhost:3000

# 5. Open the command center as the demo operator
#    http://localhost:3000/ai   (login: arjun / buildhub-demo1)
```

## Pristine demo baseline

The command center's scores are pure functions of the database (ADR-012). After
a clean seed, the deterministic baseline is:

| Metric             | Value |
| ------------------ | ----- |
| riskScore          | 72    |
| cyberSafetyScore   | 94    |
| systemHealth       | 98    |
| activeIncidents    | 2     |
| security findings  | 3     |

Reproduce it any time (after failed-login tests pollute counts):

```bash
node scripts/reset-observability.mjs   # wipe Incidents/LogEvents/AgentRuns/Approvals + reseed
node scripts/verify-observability.mjs  # 45 assertions; prints 45 passed, 0 failed
```

Requires the dev server to be running (the verifier logs in as `arjun` over the
API). `BASE_URL` overrides `http://localhost:3000`.

## Routes added in Phase 7

| Method | Route | Auth | Purpose |
| ------ | ----- | ---- | ------- |
| GET    | `/api/health` | public | component health (healthy/degraded/unavailable) + latency |
| GET    | `/api/incidents` | yes | list; `status`/`severity` comma-lists + page/pageSize |
| GET    | `/api/incidents/[id]` | yes | timeline, logs, agentRuns, approvals, previous-similar |
| POST   | `/api/incidents/[id]/report` | yes | PDF report (application/pdf download) |
| GET    | `/api/logs` | yes | level/service/route/method/status/q/from/to + pagination |
| GET    | `/api/observability/summary` | yes | scores, component health, findings, recent logs |
| GET    | `/ai` + `/ai/incidents[/[id]]`, `/ai/logs`, `/ai/pipeline`, `/ai/history`, `/ai/reports` | yes | command-center UI (server gate redirects guests) |

Quick spot checks:

```bash
curl -s http://localhost:3000/api/health | head -c 300

# authed session:
curl -s -c /tmp/bh.jar -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"arjun","password":"buildhub-demo1"}'

curl -s -b /tmp/bh.jar http://localhost:3000/api/observability/summary | head -c 500
curl -s -b /tmp/bh.jar "http://localhost:3000/api/incidents?status=DETECTED,INVESTIGATING"
```

## Full validation gate (in order)

```bash
# 1. Static checks
npm run lint                 # expect clean
npx tsc --noEmit             # expect clean

# 2. Build
npm run build                # must list /api/health, observability routes, /ai pages

# 3. Deterministic observability baseline (pristine DB first)
node scripts/reset-observability.mjs
node scripts/verify-observability.mjs          # 45 passed, 0 failed

# 4. Phase 4+5 API regression
node scripts/verify-posts-projects.mjs         # 88 passed, 0 failed

# 5. Phase 7 browser E2E (Playwright, chromium)
python3 scripts/e2e_phase7_full.py             # 25 passed, 0 failed

# 6. Phase 6 browser E2E regression
python3 scripts/e2e_phase6_full.py             # 44 passed, 0 failed

# 7. Restore the pristine demo baseline for hand-offs/demos
node scripts/reset-observability.mjs
node scripts/verify-observability.mjs
```

Notes:

- `verify-posts-projects.mjs` intentionally performs a wrong-password sign-in
  (401 → `AUTH_FAILED` warning). This and any other failed logins change the
  live baseline, which is exactly why step 7 re-resets before a demo.
- The E2E network policy allows no unexpected API 4xx/5xx on authed pages.
- The `/ai` AI Pipeline is a **simulation preview**: no external AI provider is
  invoked and nothing is fixed automatically. Human approval remains required
  for every change (see AGENTS.md + PLAN.md ADR-012).