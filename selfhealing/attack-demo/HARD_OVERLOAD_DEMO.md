# Hard-Overload Demonstration — BEFORE / AFTER

> Controlled local resilience demonstration of the hard-overload comparison:
> the SAME multi-endpoint workload against the WITHOUT-AI build (`:3001`) and
> the WITH-AI build (`:3000`). Everything below is what actually happened on
> 2026-08-30 with real measured numbers from `run-overload.py` and the real
> Backend telemetry.

## 1. What is shown

```
WITHOUT AI  :3001   NORMAL → ATTACK → TRAFFIC SPIKE → RESOURCE PRESSURE
                    → SERVICE UNAVAILABLE → 503 ERROR PAGE
WITH AI     :3000   NORMAL → ATTACK → DETECTION → CODER → CRITIC → JUDGE
                    → RISK → MITIGATION → 429 BLOCK → SERVICE HEALTHY
```

The workload is identical on both ports. Only the port changes.

- `POST /api/auth/login` — forged sign-ins, **rate-bounded to 12/s**
- `GET /api/posts` / `GET /api/projects` — sustained unauthenticated probing
- `GET /api/health` — live probes

## 2. The exact command

```bash
python3 attack-demo/run-overload.py --port 3001 --confirm-local
python3 attack-demo/run-overload.py --port 3000 --confirm-local
```

`--confirm-local` is mandatory (the run aborts before a single request
without it). Hosts are 127.0.0.1 / localhost / ::1; ports 3000 / 3001 only.

## 3. Safety limits (enforced in code, fail-closed)

```
duration  ≤ 20 s      (MAX_DURATION)
requests  ≤ 3000      (MAX_REQUESTS, hard ceiling 4000)
in-flight ≤ 16        (MAX_CONCURRENCY, default 9)
login     ≤ 12/s      (DEFAULT_LOGIN_RATE, hard ceiling 100/s)
host      = 127.0.0.1 | localhost | ::1  ONLY
port      = 3000 or 3001  ONLY
```

The client stops immediately when the target latches UNAVAILABLE, when the AI
mitigation is observed (HTTP 429), when a cap is reached, or on Ctrl+C. It
never kills/restarts/manipulates any process and never touches OS, network,
files or databases.

## 4. Expected timeline (designed behavior)

| WITHOUT AI (:3001) | WITH AI (:3000) |
|--------------------|-----------------|
| Normal -> degrade at 40 failed logins | Normal -> spike -> detection at 10 failed logins (60 s window) |
| Unavailable at 60 failed logins (503) | Incident + FIXER/CRITIC/JUDGE pipeline |
| Stays down until operator reset | Risk scored, mitigation arms 120 s source block |
| — | Forged logins rejected with 429 |
| — | Service stays available, auto-recovers |

## 5. Observed timeline — WITHOUT AI (:3001)

```
pre-flight /api/health @ http://127.0.0.1:3001 -> ok (HTTP 200)
  0.0s  Attack started, traffic at full concurrency (9 workers)
  1.9s  Traffic increasing — 100 requests issued
  3.7s  Health first reported DEGRADED  (GET /api/health -> degraded HTTP 200)
  5.0s  Health first reported UNAVAILABLE (GET /api/health -> unavailable HTTP 503)
```

**ATTACK RESULT** (real observations)

```
Requests issued: 330     Responses received: 330     Elapsed: 5.1 s
Peak latency: 384 ms     Avg latency: 137 ms         p95: 201 ms
2xx: 265 (200)   4xx: 60 (401)   5xx: 5 (503)
By endpoint: login 60 · posts 120 · projects 95 · health 55
Final health:  unavailable (HTTP 503)
Stop reason:  /api/health UNAVAILABLE — service down
```

- Failed sign-ins reach the no-AI thresholds: degrade at 40, unavailable at 60.
- The service latches UNAVAILABLE and stays there. **The web app reflects the
  real outage:** opening `http://127.0.0.1:3001/` shows the demo-only
  SERVICE UNAVAILABLE page (driven by the real `/api/health` result) while
  `http://127.0.0.1:3001/demo/attack` shows WITHOUT-AI @ RESOURCE PRESSURE →
  SERVICE UNAVAILABLE → 503 ERROR PAGE.
- Verified live: `GET /api/health` = 503, root page shows SERVICE UNAVAILABLE
  / OFFLINE / operator recovery required.

## 6. Recovery — WITHOUT AI (operator action)

The no-AI build has **no** auto-mitigation. Recovery is operator-only:

```bash
# Signed-in operator reset (session cookie from a real login)
curl -b <buildhub_session-cookie> -X POST http://127.0.0.1:3001/api/demo/attack \
  -H 'Content-Type: application/json' -d '{"action":"reset"}'
```

Verified: `/api/health` back to 200 and the SERVICE UNAVAILABLE page gone.

## 7. Observed timeline — WITH AI (:3000)

```
pre-flight /api/health @ http://127.0.0.1:3000 -> ok (HTTP 200)
  0.0s  Attack started, traffic at full concurrency (9 workers)
  0.4s  Health briefly reports DEGRADED (GET /api/health -> degraded HTTP 200)
  1.2s  First HTTP 429 from POST /api/auth/login — AI mitigation (source block active)
  1.3s  Incident INC-00002 created · HIGH · risk 24 · Authentication failure burst
```

**ATTACK RESULT** (real observations)

```
Requests issued: 46      Responses received: 46      Elapsed: 1.3 s
Peak latency: 580 ms     Avg latency: 238 ms         p95: 518 ms
2xx: 25 (200)   4xx: 21 (401 x12, 429 x9)   5xx: 0
By endpoint: login 21 · posts 9 · health 9 · projects 7
Final health:  degraded (HTTP 200)  —  never UNAVAILABLE
Stop reason:   AI mitigation observed (HTTP 429) — ATTACK CONTAINED
```

**Backend telemetry after the run** (real incident + pipeline)

```
Incident:  INC-00002 · AWAITING_REVIEW · HIGH · risk 24 · "Authentication failure burst"
Pipeline:  FIXER COMPLETE · CRITIC COMPLETE · JUDGE COMPLETE  (round 1, mode REAL)
Timestamps: firstFailure 10:30:08.266 → detected 10:30:08.469 (~0.2 s)
            → mitigated 10:30:09.092 (~0.8 s)
Block:      active, blockMs 120000, blockedCount 9
Events:     9 x IP_BLOCKED 429 (@ /api/auth/login, source ::ffff:127.0.0.1)
```

- Detection ~0.2 s after the first failure; mitigation ~0.8 s; without any
  5xx — the service never crashes.
- `http://127.0.0.1:3001/demo/attack` shows the WITH-AI chain reachable all
  the way to 429 BLOCK; after the block expires it shows SERVICE HEALTHY.

## 8. Auto-recovery — WITH AI

The mitigation is temporary (120 000 ms). Verified by polling
`/api/demo/attack` on `:3000`:

```
... mitigating (block active) → 60 s later: phase recovered, health ok, block released
... stays recovered / ok (10+ minutes, no further degradation)
```

No operator action is required for the WITH-AI build.

## 9. Reset / end of demo

```bash
# Signed-in demo-state reset on both ports (operator session cookies)
curl -b <noai-cookie> -X POST http://127.0.0.1:3001/api/demo/attack \
  -H 'Content-Type: application/json' -d '{"action":"reset"}'
curl -b <ai-cookie>   -X POST http://127.0.0.1:3000/api/demo/attack \
  -H 'Content-Type: application/json' -d '{"action":"reset"}'
```

Verified: both `/api/health` endpoints return 200 and both demo states are
back to NORMAL.

## 10. Screenshots / URLs

| URL | What to look at |
|-----|-----------------|
| `http://127.0.0.1:3001/demo/attack` | Side-by-side SAME-ATTACK comparison (both panels live) |
| `http://127.0.0.1:3001/` (during no-AI run) | Real 503 → SERVICE UNAVAILABLE page (gate driven by `/api/health`) |
| `http://127.0.0.1:3000/api/demo/attack` | Real WITH-AI incident/pipeline telemetry (JSON) |

Screenshots captured during the recorded run are in `/tmp/ui/`:
`a-normal-root.png`, `b-normal-demo.png`, `c-outage-root.png`,
`d-outage-demo.png`, `e-recovered-root.png`, `g-ai-noaiside.png`,
`h-ai-recovered.png`.

## 11. Validation performed

- `npm run lint` — 0 errors in `buildhub-no-ai`
- `npx tsc --noEmit` — clean in `buildhub-no-ai`
- `npm run build` — clean in `buildhub-no-ai`
- `python3 attack-demo/test_attack_safety.py` — 83 checks passed, 0 failed
  (covers both `run_attack.py` and `run-overload.py`)
- Recorded live comparison executed exactly as documented above and verified
  in a real browser (session-authenticated pages).