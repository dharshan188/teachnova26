# Phase 10 — Learning Loop & Validation Commands

BuildHub Phase 10 adds the learning substrate on top of the Phase 9
self-healing repair engine: repair memory, normalized RL experiences, an
inspectable reward policy, dataset/visualization exports, an evaluation
harness, a Learning dashboard, and an operator AI chat console.

## Prerequisites

- Dev server running: `npm run dev` (from `frontend/`)
- Real provider configured in `frontend/.env`:
  - `AI_PROVIDER=groq`, `AI_MODEL=...` (validated against Groq catalog at startup)
- Fault injection enabled: `FAULT_INJECTION_ENABLED=true`
- Demo operator: login `arjun` / `buildhub-demo1`

## Deterministic (hermetic) mode

The repair engine accepts an optional `scenario` on `POST /api/security/run`.
It is forwarded **only** to the TEST provider (never to Groq), so tests can run
deterministically without faking production:

```json
{ "incidentId": "...", "scenario": "accept-round-1" }
```

Scenarios: `accept-round-1 | accept-round-2 | accept-round-3 | reject-all | judge-reject`

To drive a full hermetic run:

```bash
# 1. activate a fault → creates the incident, applies the fault patch
curl -X POST localhost:3000/api/faults -H 'Content-Type: application/json' \
  -d '{ "faultId": "LOW-01" }'

# 2. run the repair engine deterministically (TEST mode only)
curl -X POST localhost:3000/api/security/run -H 'Content-Type: application/json' \
  -d '{ "incidentId": "<incidentId>", "scenario": "accept-round-1" }'

# 3. for HIGH risk, approve → applies candidate, real validation, resolve/rollback
curl -X POST localhost:3000/api/approvals/proceed -H 'Content-Type: application/json' \
  -d '{ "approvalId": "<approvalId>", "action": "proceed" }'
```

## Learning API surface

| Endpoint | Purpose |
| --- | --- |
| `GET /api/ai/learning` | reward policy + aggregate repair metrics |
| `GET /api/ai/memory` | repair memory records |
| `GET /api/ai/experiences` | normalized experience timeline |
| `GET /api/ai/rl-dataset` | RL-style `(state, action, reward, nextState, terminal)` rows |
| `GET /api/ai/evaluate` | evaluation axes (location, patch, validation, rollback) + score |
| `GET /api/ai/visualization` | neurons/edges + metrics/policy/breakdown for the 3D view |
| `POST /api/ai/chat` | operator Q&A via the configured provider (TEST mode short-circuits) |

## Crash-testing the repairs (real provider)

`node scripts/verify-self-healing.mjs` and `python3 scripts/e2e_phase9_full.py`
drive fault activation/trigger/repair against a running dev server.

`python3 scripts/e2e_phase10_learning.py` additionally asserts:

- fault → incident → engine → (approval for HIGH) → apply/validate/rollback
- learning metrics, memory, experiences and RL dataset reflect completed repairs
- Learning dashboard UI, Security console chat UI, and live incident transcript

## Cleanup after exercises

```bash
# deactivate every fault (removes guards; patches remain on files until repaired)
curl -X POST localhost:3000/api/faults -H 'Content-Type: application/json' \
  -d '{ "action": "deactivate-all" }'
```

Source files carry whatever the last repair engine applied (validated patch =
healthy baseline written to disk, rollback = previous state restored). The
runtime fault guards are cleared by `deactivate-all`; a disarmed fault is
bypassed until disarms are reset (`resetFaultDisarms`) or the fault is
deactivated and re-activated.