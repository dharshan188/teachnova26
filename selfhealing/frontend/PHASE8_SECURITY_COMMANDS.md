# Phase 8 — Security Command Center: Commands & Validation

Deterministic runbook for Phase 8. All commands run from `frontend/`.

> Phase 8 replaces Phase 7's simulated Fixer → Critic → Judge preview with a
> **real** Groq-backed pipeline. Provider: **Groq** (OpenAI-compatible
> endpoint `https://api.groq.com/openai/v1`), model
> `qwen/qwen3.8-27b` (validated live against the agent JSON contract).
> Anything labeled `xAI`/`Grok` in older docs is obsolete — use Groq.

## Prerequisites

```bash
docker start buildhub-pg                      # Postgres 16 (container buildhub-pg)
npx prisma generate                            # after any schema change
```

### Real AI + alerting surface (`.env`)

| Variable | Purpose | Present in `.env.example` |
| -------- | ------- | :---: |
| `GROQ_API_KEY` | Groq inference key (server-side only, never logged/printed) | ✓ |
| `AI_PROVIDER=groq` | provider selector used by `lib/server/ai.ts` | ✓ |
| `AI_MODEL` | e.g. `qwen/qwen3.8-27b` (validated in the Groq catalog) | ✓ |
| `TELEGRAM_BOT_TOKEN` | alert bot (never logged/printed) | ✓ |
| `TELEGRAM_CHAT_ID` | destination chat | ✓ |
| `SECURITY_OPERATOR_USERNAMES` | comma list of operators; default `arjun` | ✓ |
| `COMMAND_CENTER_URL` | URL used in alert links | ✓ |

Never print `GROQ_API_KEY` or `TELEGRAM_BOT_TOKEN`; the status API reports
configuration only (`model`, `telegram.configured`, chat id).

## Full Phase 8 flow (the real detection → AI loop)

```bash
# 0. Start the server
npm run dev                     # http://localhost:3000

# 1. Generate REAL evidence: a burst of failed logins (each returns 401 and is
#    recorded as a WARN log event with errorCode AUTH_FAILED)
for i in $(seq 1 10); do
  curl -s -o /dev/null http://localhost:3000/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"identifier":"nobody","password":"wrong"}'
done

# 2. Dump real log events to JSON
node scripts/dump-log-events.mjs -o /tmp/buildhub/logs.json

# 3. Run the stdlib-only Python analyzer (9 rules, contract version 2)
python3 scripts/security_log_analyzer.py /tmp/buildhub/logs.json -o /tmp/buildhub/findings.json
cat /tmp/buildhub/findings.json | python3 -m json.tool | head -40

# 4. Ingest findings (operator-authenticated; fingerprint dedupe)
curl -s -c /tmp/bh.jar -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"arjun","password":"buildhub-demo1"}'
curl -s -b /tmp/bh.jar -X POST http://localhost:3000/api/security/findings \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/buildhub/findings.json

# 5. Promote findings → incidents and queue REAL agent runs
curl -s -b /tmp/bh.jar -X POST http://localhost:3000/api/security/ingest \
  -H 'Content-Type: application/json' \
  -d '{}'                                            # processes all DETECTED findings

# 6. Run Fixer → Critic → Judge for an incident (real Groq calls + Telegram alert)
curl -s -b /tmp/bh.jar -X POST http://localhost:3000/api/security/run \
  -H 'Content-Type: application/json' \
  -d '{"incidentId":"<INCIDENT_ID>"}'                # from status/index payload

# 7. Watch status (risk/tier/model/telegram/agent outcomes)
curl -s -b /tmp/bh.jar http://localhost:3000/api/security/status | python3 -m json.tool
```

Incidents appear under `/ai/security` and `/ai/incidents`; each agent run shows
`FIXER/CRITIC/JUDGE` with `mode=REAL`, confidence and any failure as
`AI ANALYSIS UNAVAILABLE — <reason>`. Candidates are **advisory text only**;
nothing is auto-applied.

## Operator gating

| User | status `canOperate` | Write access (findings/ingest/run/telegram-test) |
| ---- | :---: | --- |
| `arjun` (operator) | `true` | allowed |
| `meera` (regular) | `false` | 403 |
| anonymous | — | 401 |

Override the operator list via `SECURITY_OPERATOR_USERNAMES=meera,arjun`.

## Routes added in Phase 8

| Method | Route | Auth | Purpose |
| ------ | ----- | ---- | ------- |
| GET | `/api/security/status` | session | risk/tier, findings, incidents, agent outcomes, model + Telegram config |
| POST | `/api/security/findings` | operator | ingest analyzer findings + fingerprint dedupe |
| POST | `/api/security/ingest` | operator | findings → incidents/events + queued REAL runs |
| POST | `/api/security/run` | operator | Fixer → Critic → Judge via Groq + Telegram |
| POST | `/api/telegram/test` | operator | sends `BuildHub Telegram integration test` |
| GET | `/ai/security` | session (server gate) | Security view (3D network + live posture) |

## Full validation gate (in order)

```bash
# 1. Static checks
npm run lint                 # expect clean
npx tsc --noEmit             # expect clean

# 2. Build
npm run build                # must list /api/security/*, /api/telegram/test, /ai/security

# 3. Analyzer unit tests (pure stdlib, no DB)
python3 scripts/test_security_log_analyzer.py       # 12 passed, 0 failed

# 4. Clean-baseline API verification (wipes runtime state first)
node scripts/reset-observability.mjs
node scripts/verify-observability.mjs               # clean risk 0 / cyber 100 / health 100
node scripts/verify-security.mjs                    # gate matrix + contract + clean status

# 5. Phase 4+5 API regression
node scripts/verify-posts-projects.mjs

# 6. Phase 6/7 browser E2E on the clean baseline
python3 scripts/e2e_phase7_full.py                  # empty-state assertions, no simulation copy
python3 scripts/e2e_phase6_full.py

# 7. Live Phase 8 end-to-end smoke (call the flow above with 10 failed logins),
#    once incidents exist:
python3 scripts/e2e_phase8_full.py                  # real pipeline UI + operator actions

# 8. Wipe to the clean baseline for demos/hand-off
node scripts/reset-observability.mjs
node scripts/verify-observability.mjs               # 0/100/100/0
node scripts/verify-security.mjs                    # clean contract re-confirmed
```

## AI-honesty contract

- If Groq is unreachable or returns malformed JSON, the `AgentRun` is marked
  `FAILED`; the pipeline keeps moving and Telegram still fires. The UI surfaces
  `AI ANALYSIS UNAVAILABLE — <reason>` and will **never** substitute fake AI
  output.
- `GET /api/security/status` reports `model.configured`, `model.provider=groq`
  and `model.valid` (`true` when verified in the Groq catalog, `null` when the
  catalog is unreachable).
- Alert severity tier uses the **global** risk score, not per-incident severity.

## Verification scripts

| Script | What it proves |
| ------ | -------------- |
| `scripts/test_security_log_analyzer.py` | 12 rule/regression unit tests (pass on clean CI, no network) |
| `scripts/verify-security.mjs` | operator gate (401/403), status contract, clean status values, Groq/Telegram config truthfulness |
| `scripts/e2e_phase8_full.py` | browser E2E: Security view, Live·Real badges, operator actions, real runs, PDF, no network errors |
| `scripts/e2e_phase7_full.py` | clean-state E2E asserting no simulation copy remains |