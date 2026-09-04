# TeachNova 2026 Hackathon — BuildHub: Autonomous Agentic AI Self-Healing DevOps & Collaboration Platform

> **TeachNova 2026 Hackathon Entry**
> **Project:** BuildHub — Agentic AI Self-Healing System
> **Core Concept:** Autonomous multi-agent software maintenance, self-healing DevOps pipeline, RL experience learning, and threat containment for modern web applications.

---

## 🚀 Executive Summary

Modern web applications suffer from runtime anomalies, software bugs, security threats, and unexpected downtime. Traditional monitoring alerts human engineers, leading to high Mean Time To Resolution (MTTR) and high operational overhead.

**BuildHub** is a production-style developer collaboration platform equipped with an **Autonomous Agentic AI Self-Healing DevOps System**. Designed and demonstrated for the **TeachNova 2026 Hackathon**, BuildHub transforms incident management from reactive manual intervention to proactive, autonomous AI self-healing.

When an error, fault, or security threat occurs:
1. **Autonomous Detection**: System logs and health metrics trigger real-time incident creation.
2. **Multi-Agent Reasoning**: Specialised AI agents (**Fixer/Coder**, **Critic**, and **Judge**) perform root-cause analysis and generate targeted candidate patches across up to 3 iterative conversation rounds.
3. **Deterministic Risk Classification**: Fixes are evaluated against a deterministic risk engine (LOW, MEDIUM, HIGH).
4. **Automated Probe Validation & Rollback**: Safe LOW/MEDIUM repairs are validated against live HTTP probes and applied automatically; if validation fails, the patch is automatically rolled back.
5. **Human-in-the-Loop Approval**: HIGH-risk repairs (e.g. auth/security/data modifications) are paused, requiring operator approval via the AI Command Center or Telegram before application.
6. **Reinforcement Learning (RL) Loop**: Terminal outcomes generate normalized RL experiences `(state, action, reward, nextState, terminal)` and repair memory, continuously improving repair policies over time.

---

## 🤖 Agentic AI System Architecture & Features

```text
               ┌────────────────────────────────────────┐
               │    BuildHub Collaboration Web App      │
               └───────────────────┬────────────────────┘
                                   │
                                   ▼
               ┌────────────────────────────────────────┐
               │       Observability & Logging          │
               └───────────────────┬────────────────────┘
                                   │
                        💥 Fault / Attack Detected
                                   │
                                   ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │                AGENTIC AI SELF-HEALING ENGINE                       │
 │                                                                     │
 │   ┌──────────────┐      ┌──────────────┐      ┌──────────────┐      │
 │   │ FIXER / CODER│ ───► │    CRITIC    │ ───► │    JUDGE     │      │
 │   │ (Generates)  │      │ (Evaluates)  │      │ (Decides)    │      │
 │   └──────────────┘      └──────────────┘      └──────────────┘      │
 └─────────────────────────────────┬───────────────────────────────────┘
                                   │
                                   ▼
               ┌────────────────────────────────────────┐
               │   Deterministic Risk Engine (L / M / H)│
               └───────────────────┬────────────────────┘
                                   │
                 ┌─────────────────┴─────────────────┐
                 │                                   │
       [LOW / MEDIUM Risk]                     [HIGH Risk]
                 │                                   │
                 ▼                                   ▼
   ┌──────────────────────────┐         ┌──────────────────────────┐
   │ Automated Patch & Probe  │         │ Human Approval Required  │
   └─────────────┬────────────┘         │ (Telegram / AI Console)  │
                 │                      └────────────┬─────────────┘
        ┌────────┴────────┐                          │ Approved
        │                 │                          ▼
     [PASS]            [FAIL]           ┌──────────────────────────┐
        │                 │             │ Apply Patch & Validate   │
        ▼                 ▼             └──────────────────────────┘
  ┌───────────┐    ┌─────────────┐
  │ RESOLVED  │    │ ROLLED_BACK │
  └─────┬─────┘    └──────┬──────┘
        │                 │
        └────────┬────────┘
                 ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │             REINFORCEMENT LEARNING (RL) EXPERIENCE LOOP             │
 │  • Record Repair Memory                                            │
 │  • Compute Reward Policy (+1.0 RESOLVED, -0.5 ROLLED_BACK, -1.0)  │
 │  • Export RL Dataset & Update Learning Metrics Dashboard            │
 └─────────────────────────────────────────────────────────────────────┘
```

### Key Agentic AI Capabilities

1. **Multi-Agent AI Repair Pipeline (`FIXER/CODER` → `CRITIC` → `JUDGE`)**
   - Utilizes LLMs (Groq `qwen/qwen3.8-27b`) to perform Code-Based Diagnosis and Repair (CBDC).
   - Iterative conversation rounds refine code fixes before execution.

2. **Deterministic Risk Classifier**
   - Evaluates blast radius, lines changed, security sensitivity, database involvement, and reversibility.
   - LOW / MEDIUM risk fixes auto-apply and validate. HIGH risk fixes require explicit operator authorization.

3. **Live Probe Validation & Automated Rollback**
   - Applies candidate code patches in a sandboxed environment and executes live HTTP validation probes against the running application.
   - If probes pass → `RESOLVED`. If probes fail → automatic file restore + guard rearm → `ROLLED_BACK`.

4. **Reinforcement Learning (RL) Experience & Memory Loop**
   - Persists every repair attempt into a normalized RL dataset with configurable reward policies (`REPAIR_REWARD_RESOLVED=1.0`, `REPAIR_REWARD_ROLLED_BACK=-0.5`, `REPAIR_REWARD_NEGATIVE=-1.0`).
   - Surfaces learning metrics, reward statistics, evaluation harness results, and experience timelines at `/ai/learning`.

5. **Canonical Incident Briefing & Telegram Alerting**
   - Generates unified, multi-section incident briefs across Telegram, AI Chat, PDF reports, and dashboard cards.
   - Supports 10 briefing sections (Problem, Trigger, Root Cause, Location, Proposed Fix, Code Change, Validation, Risk Policy, Attack Telemetry, System Health).

6. **Side-by-Side Attack Containment & Comparison**
   - Includes a loopback attack client (`attack-demo`) comparing the AI-enabled BuildHub against a baseline No-AI BuildHub under identical traffic spikes.
   - **WITHOUT AI**: Degrades under attack and latches `SERVICE UNAVAILABLE` (HTTP 503).
   - **WITH AI**: Detects malicious traffic bursts, applies source IP blocks (HTTP 429), containing threats while keeping normal application health `OK`.

---

## 📁 Repository Structure

```text
.
├── selfhealing/
│   ├── frontend/                 # Main AI-Enabled BuildHub Web Application (Next.js 16 + React 19)
│   │   ├── app/                 # App Router (Collaborative App, Auth, & (command) /ai Mission Control)
│   │   ├── lib/server/          # Agentic AI Engine, Risk Classifier, Repair Engine, RL Memory
│   │   ├── prisma/              # Schema & Migrations (PostgreSQL)
│   │   └── scripts/             # End-to-end verification and test suites
│   │
│   ├── buildhub-no-ai/          # Controlled No-AI baseline application (Port 3001)
│   │   └── README.md            # Side-by-side comparison documentation
│   │
│   ├── attack-demo/             # Standalone Python attack & overload simulation client
│   │   ├── run_attack.py        # Attack simulation client
│   │   ├── run-overload.py      # Multi-endpoint hard-overload comparison client
│   │   └── HARD_OVERLOAD_DEMO.md# Measured BEFORE/AFTER comparison results
│   │
│   ├── AGENTS.md                # AI Agent Operating Instructions & Standards
│   ├── PLAN.md                  # Project execution plan & architectural decisions (ADRs)
│   ├── AI_CODEBASE_MAP.md       # AI structural map of the codebase
│   └── BUILDHUB_DEMO_AND_TEST_COMMANDS.md # Command reference sheet
└── README.md                    # Root TeachNova 2026 Hackathon Documentation
```

---

## 🛠️ Stack & Technologies

- **Frontend & Framework**: Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS v4.
- **Database & ORM**: PostgreSQL 16, Prisma 7 with `@prisma/adapter-pg` driver adapter.
- **AI / LLM Orchestration**: Groq API (`qwen/qwen3.8-27b`), Hermetic test scenarios provider.
- **Alerting & Communications**: Telegram Bot API (IPv4-forced transport, append-only delivery log).
- **Visualization & Design**: Three.js / React Three Fiber 3D Canvas, Lucide icons, PDFKit report generator.
- **Testing & Verification**: Python E2E Playwright suites, Node.js verifiers, pure Python stdlib attack suite.

---

## ⚡ Quick Start & Setup

### 1. Prerequisites
- **Node.js**: v20+
- **Docker**: Docker container `buildhub-pg` running PostgreSQL 16 on port 5432.
- **Python**: 3.10+ (for E2E verification and attack demo).

### 2. Database Provisioning
```bash
docker run -d --name buildhub-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16-alpine
```

### 3. AI-Enabled BuildHub Setup & Start (Port 3000)
```bash
cd selfhealing/frontend
npm install

# Setup environment variables
cp .env.example .env.local
# Set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/buildhub
# Set GROQ_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID as applicable

# Run migrations & seed database
npx prisma migrate deploy
npm run db:seed

# Start development server
npm run dev
```
Access the application at [http://localhost:3000](http://localhost:3000).
Access the **AI Command Center** at [http://localhost:3000/ai](http://localhost:3000/ai).

---

## 🧪 Demonstration & Testing

### 1. Fault Injection & Self-Healing Demo
Inject a controlled fault into the application and observe the Agentic AI repair loop:
```bash
# Trigger a random fault or activate a specific fault (e.g. LOW-01, MEDIUM-01, HIGH-01)
curl -X POST http://localhost:3000/api/faults -H "Content-Type: application/json" -d '{"faultId":"MEDIUM-01","action":"activate"}'

# Dispatch the AI self-healing repair loop
curl -X POST http://localhost:3000/api/security/run -H "Content-Type: application/json" -d '{"incidentId":"<INCIDENT_ID>"}'
```
Visit `/ai` or `/ai/incidents/<INCIDENT_ID>` to watch the live multi-agent conversation transcript, validation probes, and resolution state.

### 2. Side-by-Side Attack Comparison Demo
Run the safety-bounded overload client to compare No-AI vs. AI-enabled resilience:
```bash
# Test safety contracts
python3 selfhealing/attack-demo/test_attack_safety.py

# Run attack against No-AI build (Port 3001) -> Service degrades to 503
python3 selfhealing/attack-demo/run-overload.py --port 3001 --confirm-local

# Run attack against AI-Enabled build (Port 3000) -> AI contains attack with 429s, health stays 200
python3 selfhealing/attack-demo/run-overload.py --port 3000 --confirm-local
```

### 3. Verification Commands
```bash
# Verify Self-Healing engine (80/80 tests)
node selfhealing/scripts/verify-self-healing.mjs

# Verify API and App functionality (88/88 tests)
node selfhealing/scripts/verify-posts-projects.mjs

# Run E2E Learning Loop verification
python3 selfhealing/scripts/e2e_phase10_learning.py
```

---

## 🏆 Hackathon Value Proposition & Impact

BuildHub demonstrates how **Agentic AI** can transcend passive monitoring by taking autonomous, safe, and verifiable action to maintain software health. Key takeaways for TeachNova 2026:
- **Zero-Downtime Autonomous Repairs**: Minor errors are detected and resolved in seconds without developer intervention.
- **Safety & Human Control**: Deterministic risk boundaries guarantee human approval for security-sensitive modifications.
- **Continuous Learning**: Every repair contributes to an expanding RL memory bank, improving future agent decision-making.
- **Resilient Infrastructure**: Multi-agent orchestration keeps services operational even during active cyber attacks and unexpected code failures.

---

*Presented for TeachNova 2026 Hackathon — BuildHub Agentic AI Team*
