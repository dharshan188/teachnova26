# BuildHub — No-AI Demo

A separate, isolated copy of **BuildHub** (the AI-enabled project lives in
`/home/dharshan/selfhealing/frontend`) with **all AI / self-healing
functionality removed**, kept deliberately identical in the normal application
behavior so it can be compared honestly against the AI-enabled BuildHub.

This copy exists as the controlled test target for the demo:

```text
BuildHub (AI-enabled)          BuildHub — No-AI demo
├── runs on port 3000          ├── runs on port 3001
├── DB `buildhub`              ├── DB `buildhub_no_ai`
├── detects + repairs LOW-01   ├── LOW-01 injected, nothing repairs it
└── zero manual intervention   └── stays broken (UNRESOLVED)
```

No AI provider endpoints are configured or referenced anywhere. No code is
patched at runtime. No incident, repair, or rollback pipeline is invoked.

## Requirements

- Node.js 20+
- A running Postgres (this repository's dev database runs in the Docker
  container `buildhub-pg`, mapping host port `5432`)

## Setup

```bash
cd /home/dharshan/selfhealing/buildhub-no-ai
npm install

# Copy the template and fill in real values (never commit .env / .env.local):
cp .env.example .env
#   DATABASE_URL=postgresql://<user>:<password>@localhost:5432/buildhub_no_ai
#   FAULT_INJECTION_ENABLED=true
# create a real AUTH_SECRET, for example:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

npx prisma migrate deploy   # apply schema to buildhub_no_ai
npx prisma generate         # generate the Prisma client
npm run db:seed             # demo users/posts/projects/likes
```

Seed accounts: `arjun` / `buildhub-demo1` (all demo accounts share this
password — demo-only, development data).

## Running

```bash
npm run dev -- --port 3001   # or: npm run demo
```

Visit `http://localhost:3001`. The footer navigation of the signed-in app
links to the **No-AI Demo** page (`/demo`).

## Demo walkthrough

1. Sign in (`arjun` / `buildhub-demo1`).
2. Open `/demo`. The page shows `AI SELF-HEALING: OFF` and the app in the
   `OPERATIONAL` state — the same controlled LOW-01 fault that the
   AI-enabled BuildHub repairs automatically.
3. Click **Trigger fault**, or send a `POST /api/posts`. The real backend
   returns HTTP 500 `{"error":"Cannot read property 'id' of undefined"}` and
   writes a real row to the `LogEvent` table.
4. Nothing repairs it. The status stays `UNRESOLVED`; the error keeps
   happening. This is the honest No-AI comparison.
5. `npm run demo:reset` restores the clean starting state (deactivates the
   fault if the server is running, and clears the demo log trail; never
   touches application source).

## Validation

```bash
npm run lint
npx tsc --noEmit
npm run build

# E2E against the running dev server:
python3 scripts/e2e_no_ai_demo.py
```

The E2E asserts: real 500 on `POST /api/posts`, the exact LOW-01 message, a
durable `LogEvent` row in the DB, zero incident/agent/repair rows, zero
requests to any AI provider, no automatic repair, and byte-identical source
files before/after the trigger.

## Layout

- `/api/demo/fault` — demo-only controller: `activate` / `deactivate` / `reset`
- `/api/demo/logs` — real backend log events for the demo
- `/demo` — the comparison page
- `lib/server/fault-injection.ts` — the minimal runtime fault guard (LOW-01 only)
- `scripts/demo-reset.mjs` — `npm run demo:reset`
- `scripts/e2e_no_ai_demo.py` — end-to-end validation

See [BUILDHUB_AI_VS_NO_AI.md](./BUILDHUB_AI_VS_NO_AI.md) for the side-by-side
comparison with the AI-enabled BuildHub.