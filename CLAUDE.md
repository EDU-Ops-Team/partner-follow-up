# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vendor Follow Up — an automated agent that monitors LiDAR & Building Inspection scheduling/completion for Alpha Schools sites. Triggered by emails from `zack.lamb@2hourlearning.com`, it checks Airtable (LiDAR) + Google Sheets (Building Inspection) on a 2-business-day cycle, posts updates to Google Chat, and sends follow-up emails until all items are resolved.

## Commands

```bash
npm run dev              # Next.js dev server (frontend + admin API)
npx convex dev           # Convex backend dev (must run alongside Next.js)
npm run build            # Production build
npm run test:run         # Run all tests once
npx vitest run tests/unit/business-days.test.ts  # Run a single test file
npm run lint             # ESLint
npx convex deploy        # Deploy Convex to production
```

Both `npm run dev` and `npx convex dev` must be running during development.

## Architecture

**Stack:** Next.js 15 (App Router) + Convex (database, crons, server actions) + TypeScript

**Two codebases in one repo:**
- `convex/` — Backend: database schema, cron jobs, server actions, all business logic
- `src/` — Frontend: React dashboard (client component with Convex `useQuery`), admin API routes (using `ConvexHttpClient`)

### Convex Backend (`convex/`)

**Cron-driven automation** (defined in `convex/crons.ts`):
- `checkEmail` (every 15m) — polls Gmail for trigger emails, creates site records
- `checkScheduling` (every 30m) — checks Airtable + Sheets for scheduling updates, sends reminders
- `checkCompletion` (every 30m) — monitors LiDAR completion + report status, resolves sites
- `checkReplies` (every 15m) — processes vendor replies on active threads, saves attachments to Drive
- `classifyInbound` (every 15m) — classifies inbound emails via rules/LLM, creates email thread records
- `executeDecisions` (every 15m) — runs decision trees on classified emails, creates draft replies

**Function types:**
- Public queries/mutations (`query`, `mutation`) — called from React frontend or admin API
- Internal queries/mutations (`internalQuery`, `internalMutation`) — called only from actions
- Internal actions (`internalAction`) — cron handlers that call external APIs

**`"use node"` directive** is required on any file that imports Node.js packages (`googleapis`, `csv-parse`, `Buffer`). This includes all files in `convex/services/` and the six action files.

**Site lifecycle:** `scheduling` → `completion` → `resolved`

### Data Flow

```
Gmail trigger email
  → checkEmail action → creates site (phase=scheduling)
  → checkScheduling action → matches address in Airtable/Sheets
    → if both scheduled → advance to phase=completion
    → if not → send reminder (Chat + Email), reschedule next check
  → checkCompletion action → checks LiDAR complete + report received
    → if all done → phase=resolved
    → if not → send reminder, reschedule
```

### Key Patterns

- **Address matching**: `convex/lib/addressNormalizer.ts` normalizes addresses then uses Levenshtein distance (threshold 0.85) to fuzzy-match against Airtable/Sheets data
- **Business days**: `convex/lib/businessDays.ts` handles weekend + US holiday skipping for check intervals
- **Audit logging**: All state changes logged to `auditLogs` table via `internal.auditLogs.create`
- **Idempotent notifications**: Boolean flags (`bothScheduledNotified`, `lidarCompleteNotified`, `reportLinkNotified`) prevent duplicate notifications on re-runs

## Environment Variables

**In `.env.local` (Next.js):**
- `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOYMENT`, `ADMIN_API_KEY`

**In Convex dashboard (Settings → Environment Variables):**
- `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_SEND_AS`
- `GOOGLE_SERVICE_ACCOUNT_KEY` (base64-encoded full JSON file)
- `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_RANGE`, `GOOGLE_CHAT_WEBHOOK_URL`
- `AIRTABLE_SHARED_VIEW_URL`
- `AGENT_GMAIL_CLIENT_ID`, `AGENT_GMAIL_CLIENT_SECRET`, `AGENT_GMAIL_REFRESH_TOKEN` — OAuth for email agent inbox
- `AGENT_GMAIL_SEND_AS` — sender address for agent emails (defaults to `edu.ops@trilogy.com`)
- `ANTHROPIC_API_KEY` — Claude API key for LLM classification
- `ANTHROPIC_MODEL` — optional model override (defaults to `claude-sonnet-4-6`)

**In `.env.local` (Next.js, for auth dashboard):**
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` — Google OAuth for reviewer sign-in
- `AUTH_SECRET` — NextAuth session encryption secret

## Testing

Tests live in `tests/unit/` and import directly from `convex/lib/` and `convex/services/` using relative paths. Vitest config maps `@/` to `./src/` and `convex/` to `./convex/`. Tests cover utilities and services only — Convex functions are not unit tested (they require a running Convex instance).

## Database

Ten Convex tables defined in `convex/schema.ts`: `sites` (main tracking), `auditLogs` (action history), `gmailSyncState` (Gmail poll cursor), `holidays` (US federal holidays, seeded via `holidays.seed` mutation), `emailClassifications` (inbound email classification results), `emailThreads` (thread state tracking), `vendors` (vendor contacts & categories), `jurisdictions` (government entities), `draftEmails` (generated reply drafts for review), `decisionLogs` (decision tree audit trail), `classificationGates` (learning loop metrics), `reviewers` (OAuth-authenticated reviewers).
