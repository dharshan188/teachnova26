# BuildHub — AI vs No-AI

A side-by-side comparison of the two projects. Both builds share the same UI,
login, posts, projects, schema, and — crucially — the **same controlled
failure** (LOW-01). The only difference is the presence of the AI
self-healing engine.

## The controlled fault

Both builds define LOW-01 identically (see the main repository's
`PHASE9_FAULT_TEST_PLAN.md`):

| | |
|---|---|
| ID | `LOW-01` |
| File | `frontend/app/api/posts/route.ts` |
| Line | 45 |
| Function | `POST handler` |
| Original | `const authorId = session.user.id;` |
| Fault | `const authorId = session.user.undefinedProperty;` |
| Trigger | `POST /api/posts` (with a valid session) |
| Expected error | `TypeError: Cannot read property` / returns HTTP 500 `Cannot read property 'id' of undefined` |
| Risk / difficulty | LOW / EASY |

## The two projects

| | BuildHub (AI-enabled) | BuildHub — No-AI demo |
|---|---|---|
| Code | `/home/dharshan/selfhealing/frontend` | `/home/dharshan/selfhealing/buildhub-no-ai` |
| Port | 3000 | 3001 |
| Database | `buildhub` (docker `buildhub-pg`) | `buildhub_no_ai` (same container) |
| Schema | full (10 migrations) | same schema, 10 migrations |
| Seed credentials | `arjun` / `buildhub-demo1` | `arjun` / `buildhub-demo1` |
| AI engine layer | present (`lib/server/ai`, `lib/server/self-healing`, providers, agents) | removed entirely |
| Observability | incidents, agent runs, repairs tracked | not present (no AI to observe) |
| Runtime repairs | can generate + validate + approve + apply patches | never patches anything |
| Rollback support | yes | n/a |
| AI provider calls | Groq/xAI/Ollama when acting | zero — no provider configured or referenced |

## Same fault, opposite outcome

```text
POST /api/posts while LOW-01 is active
        │
        ▼
┌─────────────────────────┐
│  BuildHub (AI-enabled)      │
│  Detection → analysis →     │
│  candidate fix → tests      │
│  → human approval → apply   │
│  → verify → RESOLVED        │
└─────────────────────────┘

┌─────────────────────────┐
│  BuildHub — No-AI demo     │
│  real 500 + real log row   │
│  nothing automated runs    │
│  fault persists →          │
│  UNRESOLVED                │
└─────────────────────────┘
```

The No-AI copy is deliberate proof that nothing besides the AI engine repairs
the failure: same fault, same trigger, same application code behavior — but
without AI the error remains real and remains broken until `demo:reset`.

## Demo checks

### BuildHub (AI-enabled)
1. Start on port 3000.
2. Sign in, trigger LOW-01 through the tests / demo flow.
3. Observe: incident created, root-cause analysis, patch candidates generated
   and validated, human approval, patch applied, application verified, status
   `RESOLVED`. Source fixes are written and tests pass.

### BuildHub — No-AI
1. Start on port 3001.
2. Sign in, open `/demo`, click **Trigger fault** (or `POST /api/posts`).
3. Observe: HTTP 500 with the exact LOW-01 message, a real `LogEvent` row
   (service `fault-injection`, status 500, `errorCode` LOW-01), zero
   incidents/agent runs/repairs, status remains `UNRESOLVED`.
4. `npm run demo:reset` returns the demo to the clean start.

## Honesty guarantees in the No-AI copy

- The fault is never faked: the app produces a genuine server-side 500 and a
  genuine persisted log row.
- No automatic repair: runtime file patching does not exist in this project;
  source files are byte-identical before and after any run (verified by
  `scripts/e2e_no_ai_demo.py`).
- No AI network calls: no provider endpoint exists in the code, and the E2E
  interception asserts zero requests reach any AI host.
- No shared state: separate database (`buildhub_no_ai`), separate env files,
  separate port. The original BuildHub is never touched.