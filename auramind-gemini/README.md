# AuraMind — Frontend SPA

The web client for **AuraMind, Your AI Learning System** — an adaptive AI learning system that turns anything you're studying (a PDF, a video, a lecture, a topic) into a personalized course, then schedules your reviews with FSRS v5 spaced repetition and tutors you with a knowledge model that remembers what you struggle with.

**Stack:** React 19 · TypeScript (strict) · Vite · Tailwind 4 · Base UI · Framer Motion · Zustand · react-router v7 · Supabase (auth + data) · Stripe (payments) · Capacitor 8 (Android)

The Android build is a first-class Capacitor app, not a browser bookmark: native
status-bar and back-button handling, Android bottom navigation, haptic review
feedback, local study reminders, system sharing, and device-aware services are
wired through `src/lib/nativeShim.ts`. The shared React surfaces remain the
source of truth so web and Android stay behaviorally consistent.

## Run locally

```bash
npm ci
# copy .env.example to .env and fill in your keys (Supabase is required;
# see the repo-root README and DEPLOYMENT.md for the full variable list)
npm run dev        # vite dev server on port 3000
```

The API lives in the sibling `../api` directory (Express dev server on port 3001); the optional streaming-chat backend is `../model-service` (FastAPI on port 8000).

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server (port 3000) |
| `npm run type-check` | `tsc --noEmit` |
| `npm test` | Vitest suite (320+ tests) |
| `npm run build` | Production build (with bundle-size guard, ~393 KB gzipped budget 500 KB) |
| `npm run size` | Bundle-size check |

## Layout

```
src/
├── App.tsx              # Command center: auth lifecycle, routes, session sync
├── components/          # ~40 dirs — landing, chat, study, dashboard, ui primitives
├── pages/               # Route pages (dashboard, chat, generator, study, …)
├── hooks/               # 39 hooks (useAIChat, useStudyStats, useCurrentUserId, …)
├── services/            # API clients, DB modules, AI providers, chat persistence
├── lib/                 # Pure logic: chat-prompts, conceptModel, chatMemory, fsrs
├── contexts/            # AuraContext, DashboardWorkspaceContext, …
└── __tests__/           # Vitest suite
```

## Notable pieces

- **Prof. Aura (the tutor)** — `components/chat/AIChatPage.tsx` + `hooks/useAIChat.ts` + `lib/chat-prompts.ts`. The system prompt is assembled from *real* study data: streak, 7-day retention, last-session accuracy, weak cards, and concept-level weaknesses (`lib/conceptModel.ts`) plus cross-session memory (`lib/chatMemory.ts`).
- **FSRS v5 scheduling** — `services/study/fsrs.ts` (free-spaced-repetition-scheduler port).
- **Offline study** — PWA service worker + IndexedDB offline review queueing.

© CogniVect, Inc. All rights reserved.
