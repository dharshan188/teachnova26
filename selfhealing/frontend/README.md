# BuildHub — Frontend

The frontend for **BuildHub**, a production-style developer collaboration platform, and the future controlled test environment for the AI Self-Healing DevOps System.

## Stack

- **Next.js 16** (App Router, Turbopack)
- **React 19**
- **TypeScript**
- **Tailwind CSS v4** (CSS-first configuration)
- **ESLint** (`eslint-config-next`)

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Available scripts:

```bash
npm run dev       # development server
npm run build     # production build
npm start         # serve production build
npm run lint      # ESLint
npx tsc --noEmit  # type check
```

## Structure

```text
app/                     # routes (landing, auth, authenticated shell)
components/
  ui/                    # design-system primitives (Button, Card, Modal, ...)
  layout/                # shell layout pieces
  navigation/            # sidebar, header, mobile nav
  posts/                 # post card, composer, comments
  projects/              # project card, task board, sections
  feedback/              # skeleton, empty state, error state
  notifications/         # notification list
lib/
  types.ts               # API-shape types
  api/                   # data-access layer (mock-backed)
  mock/                  # centralized mock data
  hooks.ts               # useAsync, useDebounce
  avatar.ts, format.ts, cn.ts, nav.ts
```

## Data

Phase 1 is UI-only. The data-access layer in `lib/api/` currently returns mock data
(from `lib/mock/`) with artificial latency, mirroring the shape real API endpoints will
return. Swap implementations in `lib/api/` when the backend exists.

## Environment

Copy `.env.example` to `.env.local` and adjust as needed. Currently no secrets are
required for the UI foundation.
