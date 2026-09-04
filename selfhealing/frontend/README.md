# BuildHub — Full-Stack Application & Agentic AI Self-Healing System

BuildHub is a production-style developer collaboration web application integrated with an **Autonomous Agentic AI Self-Healing DevOps System**.

It provides a modern social collaboration platform for developers (projects, posts, comments, likes, auth, profiles) while serving as the operational environment for AI-driven error detection, multi-agent repair, risk-bounded patch approval, and reinforcement learning.

---

## 🛠️ Stack & Architecture

- **Framework**: Next.js 16 (App Router, Turbopack) & React 19
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **Database & ORM**: PostgreSQL 16 & Prisma 7 with `@prisma/adapter-pg` driver adapter
- **Agentic AI Pipeline**: Groq API (`qwen/qwen3.8-27b`) / Hermetic TEST scenarios provider
- **Observability & Logging**: Structured `LogEvent` logger, incident tracking, request correlation IDs
- **Communications**: Telegram Bot API (IPv4-forced transport, append-only delivery log)
- **PDF Reports**: PDFKit report generator
- **3D Visualization**: Three.js / React Three Fiber

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database running (e.g., Docker container `buildhub-pg` on port `5432`)

### Installation

```bash
npm install
```

### Environment Configuration

Copy `.env.example` to `.env.local` and configure credentials:

```bash
cp .env.example .env.local
```

Key environment variables:
- `DATABASE_URL`: PostgreSQL connection string (e.g. `postgresql://postgres:postgres@localhost:5432/buildhub`)
- `AUTH_SECRET`: Secret key for session hashing
- `GROQ_API_KEY`: Groq API key for real AI agent inference
- `TELEGRAM_BOT_TOKEN`: Telegram bot token for alerting
- `TELEGRAM_CHAT_ID`: Destination chat ID for incident briefs
- `FAULT_INJECTION_ENABLED`: Controls runtime fault injection availability (`true` / `false`)

### Database Migration & Seeding

```bash
npx prisma migrate deploy   # Apply database migrations
npm run db:seed             # Seed database with initial users, posts, and projects
```

### Available Scripts

```bash
npm run dev                 # Start Next.js development server
npm run build               # Build application for production
npm start                   # Start production server
npm run lint                # Run ESLint checks
npx tsc --noEmit            # Run TypeScript type checker
```

---

## 🤖 Agentic AI Capabilities & Endpoints

### Key Routes & AI Command Center Pages

- `/` — Marketing landing page with WebGL 3D hero
- `/feed` — Main collaboration feed (posts, comments, likes, tags)
- `/projects` — Developer projects and management
- `/ai` — **AI Command Center Overview** (risk gauges, health scores, live incidents, pipeline snapshot)
- `/ai/incidents` — Incident management list and live transcript detail pages
- `/ai/security` — Security posture, findings, and operator Agentic AI Console chat
- `/ai/learning` — **Phase 10 Learning Loop Dashboard** (reward statistics, RL dataset export preview, evaluation harness)

### AI & Observability API Endpoints

- `GET /api/health` — Public component health status
- `GET /api/observability/summary` — Aggregate metrics, risk scores, and system health
- `GET /api/incidents` — List detected incidents
- `GET /api/incidents/[id]` — Full incident detail, timeline, and agent runs
- `POST /api/security/run` — Dispatch Agentic AI self-healing pipeline (`FIXER/CODER` → `CRITIC` → `JUDGE`)
- `POST /api/approvals/proceed` — Human operator approval/rejection for HIGH-risk patches
- `POST /api/faults` — Activate/deactivate controlled fault injection scenarios (LOW-01..03, MEDIUM-01..03, HIGH-01..03)
- `POST /api/ai/chat` — Real-time operator AI Assistant chat
- `GET /api/ai/learning` — Reinforcement learning metrics and policy configuration
- `GET /api/ai/rl-dataset` — Normalized RL experiences export JSON

---

## 📂 Codebase Organization

```text
app/
  (app)/                 # Authenticated collaboration app shell (feed, posts, projects, settings)
  (auth)/                # Public authentication routes (login, signup)
  (command)/             # AI Command Center Mission Control shell (/ai, /ai/learning, /ai/security)
  api/                   # RESTful API routes & SSE streams
components/
  ui/                    # Reusable design primitives (Button, Card, Modal, Badge, Avatar)
  navigation/            # App shell sidebar, header, and mobile navigation
  command/               # AI Command Center components & 3D visualizations
lib/
  server/                # Server-only modules:
    db.ts                # Prisma client setup
    ai.ts                # Groq LLM agent integration
    repair/              # Iterative self-healing engine (conversation, validation, patch-engine)
    learning/            # RL memory bank & reward policy engine
    notifications/       # Canonical incident briefing & Telegram message builders
    risk.ts              # Deterministic risk engine
    fault-injection.ts   # Controlled fault registry
```

---

## 🧪 Verification & Testing

Verify the application and Agentic AI system using the project verifiers:

```bash
# Verify API & collaboration features (88 checks)
node ../scripts/verify-self-healing.mjs

# Verify Self-Healing engine & fault injection (80 checks)
node scripts/verify-self-healing.mjs

# Run Phase 10 Learning Loop E2E tests
python3 ../scripts/e2e_phase10_learning.py
```
