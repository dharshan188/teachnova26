# Phase 6 — Test Commands (Likes + Comments)

Exact, repo-specific commands to build, run, and verify BuildHub Phase 6
(Social Interactions: likes and comments). Run everything from the
`frontend/` directory unless stated otherwise.

```
frontend/   <- all commands below run from here
```

---

## 1. Environment prerequisites

- Node.js with npm, and the `frontend/` dependencies installed (`npm install` already done).
- Docker available for PostgreSQL.
- Python 3 with Playwright for the browser E2E script:
  `python3 -m playwright install chromium` if the browser binary is missing.

## 2. Start PostgreSQL

A Postgres 16 container named `buildhub-pg` is used (user `buildhub`,
password `buildhub_dev_pw`, database `buildhub`, host port 5432).

Already created:

```bash
docker start buildhub-pg
docker ps --filter name=buildhub-pg --format '{{.Names}}  {{.Status}}  {{.Ports}}'
# Expected: buildhub-pg  Up (x seconds)  0.0.0.0:5432->5432/tcp
```

If the container does not exist, recreate it with the same settings:

```bash
docker run -d --name buildhub-pg \
  -e POSTGRES_USER=buildhub \
  -e POSTGRES_PASSWORD=buildhub_dev_pw \
  -e POSTGRES_DB=buildhub \
  -p 5432:5432 \
  --restart unless-stopped \
  postgres:16-alpine
```

## 3. Database configuration

`.env` (gitignored) must contain the values shown in `.env.example`:

```bash
DATABASE_URL=postgresql://buildhub:buildhub_dev_pw@localhost:5432/buildhub
AUTH_SECRET=<value>
NEXT_PUBLIC_APP_NAME=BuildHub
```

The Prisma config loads it via `prisma.config.ts` (`import 'dotenv/config'`).

## 4. Apply and verify migrations

```bash
cd /home/dharshan/selfhealing/frontend
npx prisma migrate dev
npx prisma migrate status
# Expected: "3 migrations found" and "Database schema is up to date!"
# (20260829040353_add_likes_and_comments is the Phase 6 migration.)
```

## 5. Start the dev server

```bash
cd /home/dharshan/selfhealing/frontend
npm run dev
# Expected: ready on http://localhost:3000
```

Leave it running in its own terminal for the tests below.

## 6. API verification (78 checks)

```bash
cd /home/dharshan/selfhealing/frontend
node scripts/verify-posts-projects.mjs
# Expected: "BuildHub verification (posts/projects/likes/comments): 78 passed, 0 failed"
```

Covers: auth, posts CRUD (owner 403s), projects CRUD (owner 403s),
like/unlike idempotency + counts, comments CRUD + ownership authorization,
counts via serializers.

## 7. Browser E2E (32 checks) — with §36 console/network monitoring

```bash
cd /home/dharshan/selfhealing/frontend
python3 scripts/e2e_phase6_full.py
# Expected: "Phase 6 browser E2E (full): 32 passed, 0 failed"
```

The script fails if any unexpected browser console error or any unexpected
API 4xx/5xx response occurs (the only allowed one is `/api/auth/me` → 401
while unauthenticated). Covers: like/unlike with persistence, comment
CRUD with persistence, multi-user cross-authorization via direct API
mutations (403s), project/post/profile regression, and 375px mobile
(no horizontal overflow).

## 8. Static validation

```bash
cd /home/dharshan/selfhealing/frontend
npm run lint
# Expected: clean (no errors)

npx tsc --noEmit
# Expected: no type errors

npm run build
# Expected: build completes, routes listed (incl. /posts/[id])
```

## 9. Security review status (Phase 6)

- [x] Mutations (like/comment create/update/delete) require a session — unauthorized → 401.
- [x] Comment update/delete require ownership — cross-user → 403 (UI and direct API).
- [x] Post delete requires ownership — cross-user UI/menu hidden, direct API → 403.
- [x] Duplicate likes prevented at DB level (`@@unique([userId, postId])`) + idempotent upsert.
- [x] Input validated (zod): comment content ≤ 500 characters; errors returned as `{ error }`.
- [x] No passwords, tokens, or internal stack traces logged/exposed.
- [x] Direct API attempts verified in browser E2E (32/32) and API verifier (78/78).

## 10. One-shot sequence

```bash
docker start buildhub-pg
cd /home/dharshan/selfhealing/frontend
npx prisma migrate status
npm run lint && npx tsc --noEmit && npm run build
node scripts/verify-posts-projects.mjs
python3 scripts/e2e_phase6_full.py
```

Expected: 3 migrations / up to date, lint+tsc+build clean, 78/78, 32/32.