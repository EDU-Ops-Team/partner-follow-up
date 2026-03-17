# Email Agent Consolidation — Project Plan

**Last updated:** March 16, 2026
**Source document:** `email-agent-consolidation.docx`
**Contributors:** Greg Foote, Andrea Ewalefo, Robbie Forrest, Devin Bates

---

## Status Summary

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Foundation — schema, classifier, Gmail polling, auth | Built |
| Phase 2 | Decision trees, templates, execute decisions cron | Built |
| Frontend | Dashboard, review queue, vendor directory | Built |
| Infra | Credential rotation, Gmail consolidation, site dedup, send pipeline | **Done (March 16)** |
| Phase 3 | Escalation crons, draft digest, LLM drafts | Not started |
| Phase 4 | Diff analysis, learning loop, gate evaluation | Not started |
| Phase 5 | Graduated auto-send | Not started |

**Deployed to prod.** Agent Gmail credentials set for `edu.ops@trilogy.com`. All crons currently disabled pending final validation.

---

## Blocking Items

| Item | Owner | Status | Needed For |
|------|-------|--------|------------|
| `edu.ops@trilogy.com` Google Workspace account | IT team | **Done** | Gmail polling, sending |
| Agent Gmail OAuth credentials | Greg | **Done** | Convex env vars `AGENT_GMAIL_*` |
| Google OAuth web client for dashboard sign-in | Greg | **Done** | `.env.local` vars `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` |
| `AUTH_SECRET` (NextAuth session key) | Greg | **Done** | Session encryption |
| Credential rotation (service account + OAuth secret) | Greg | **Done** | Security — old keys revoked |
| Zack redirects trigger emails to edu.ops | Zack | **Pending** | checkEmail cron needs emails in edu.ops inbox |

### To re-enable system:
1. Confirm Zack has redirected trigger emails to `edu.ops@trilogy.com`
2. Uncomment crons in `convex/crons.ts`
3. Re-enable Google Chat (`convex/services/googleChat.ts` — remove early return)
4. Run `npx convex deploy`

---

## Key Decisions (Confirmed March 13, 2026)

- **Agent email**: `edu.ops@trilogy.com` with delegated Gmail API access
- **Site model**: Unified — `sites` table serves both legacy LiDAR/Inspection workflow and new email agent
- **Thread management**: Explicit `emailThreads` table keyed by Gmail `threadId`
- **Decision trees**: Static TypeScript files in `convex/data/decisionTrees/` for Phases 1-3; database-backed with approval queue in Phase 4+
- **Template variables**: All external data synced into Convex; template engine reads from Convex only, no live API calls
- **Gate threshold**: 0.98 Levenshtein similarity = pass; CC-only changes excluded from edit distance
- **Multi-site emails**: `matchedSiteIds` is an array on classifications
- **LLM**: Claude Sonnet 4.6 for classification fallback and diff analysis
- **Auth**: Google OAuth via next-auth for dashboard reviewers
- **Notifications**: Google Chat webhook for draft digests
- **Signature**: All emails signed as "EDU Ops Team"
- **Reviewer routing**: No domain-based routing — any reviewer can review any draft; log who reviewed
- **Zoning/CUP/Escalation**: Classify but take no action — deferred to human handling
- **Follow-up SLA**: Every 2 business days until scheduled; day after due date then every 2 business days
- **T-01 Landlord Questionnaire**: Tier 1 (auto-send) — same content every time, goes to site POC
- **Inspection scheduling**: Moving to agent using current Worksmith process
- **Calendar access**: Agent needs read access to DRI's Google Calendar for reschedule proposals (G-07); DRI is one of 7 team members, looked up via `assignedDRI` field
- **E-04 dropped**: General report reminder to responsible party removed (E-03 to inspection contact is sufficient)

---

## Changes — March 16, 2026

### Infrastructure & Security
- **Credential rotation:** Revoked and regenerated Google service account key + OAuth client secret. Updated all Convex env vars.
- **Gmail consolidation:** All actions (`checkEmail`, `checkScheduling`, `checkCompletion`, `checkReplies`) migrated from legacy `gmail.ts` to `agentGmail.ts`. Single set of credentials (`AGENT_GMAIL_*`) for `edu.ops@trilogy.com`.
- **Crons disabled:** All 6 crons commented out pending validation and Zack's email redirect.

### Code Review Fixes
- **C2: `adminUpdate` hardened** — Replaced `v.any()` with explicit typed field validators in `convex/sites.ts`
- **C3: JSON.parse error handling** — Added try-catch to `emailClassifier.ts`, `googleDrive.ts`, `googleSheets.ts`
- **I5: Model ID** — Changed hardcoded `claude-sonnet-4-6-20250514` to stable alias `claude-sonnet-4-6`
- **I6: CLAUDE.md updated** — Added all 6 crons, email agent env vars, 12-table database section

### Send Pipeline (Phase 3 partial)
- **Reviewer sync wired** — `reviewers.syncFromOAuth` public mutation called from NextAuth `signIn` callback. Reviewers auto-created/updated on Google sign-in.
- **Approve/Edit/Reject mutations** — `draftEmails.approve`, `draftEmails.editAndSend`, `draftEmails.reject` public mutations with reviewer lookup
- **Send action** — `sendDraftEmail.sendApproved` internal action sends via `agentGmail.sendEmail()` with thread context, audit logged
- **Review page wired** — Buttons call real mutations, show loading/error states, redirect on success

### Site Data Model Redesign
- **One site per address** — Added `triggerEmails` array field to track multiple trigger emails per site
- **Address-based dedup** — New `sites.findOrCreateByAddress` mutation: exact match on `normalizedAddress` index → prefix match → fuzzy match (0.85 threshold) → create new
- **checkEmail migrated** — Uses `findOrCreateByAddress` + `processedMessages` dedup (replaces `getByTriggerEmailId`)
- **checkReplies migrated** — Iterates all trigger threads per site (from `triggerEmails[]`)
- **checkScheduling/checkCompletion** — Thread opts use latest trigger email
- **Migration run** — `migrateSites.run` merged duplicates in prod, rewrote foreign keys
- **Dashboard dedup removed** — No longer needed; one record per address in the database

---

## What's Built

### Phase 1: Foundation

**Schema** (`convex/schema.ts`):
- 8 new tables: `emailClassifications`, `emailThreads`, `vendors`, `jurisdictions`, `draftEmails`, `decisionLogs`, `classificationGates`, `reviewers`
- Expanded `sites` table with 9 optional fields for unified site model (siteType, lifecycle, city, state, zipCode, vendorIds, assignedDRI, notes, tags)
- All new fields are `v.optional()` — no migration needed, legacy crons untouched

**Services** (`convex/services/`):
- `agentGmail.ts` — Separate Gmail client for `edu.ops@trilogy.com` using `AGENT_GMAIL_*` env vars
- `emailClassifier.ts` — Rule-based classification with LLM fallback (Claude Sonnet 4.6)
- `contextResolver.ts` — Maps emails to sites (address matching) and vendors (contact email lookup)

**Cron** (`convex/classifyInbound.ts`):
- Polls agent mailbox every 15 min, classifies each email, creates/updates thread records, links to sites/vendors, audit logs everything

**Table CRUD files**: `emailClassifications.ts`, `emailThreads.ts`, `vendors.ts`, `jurisdictions.ts`, `reviewers.ts`, `draftEmails.ts`, `decisionLogs.ts`, `classificationGates.ts`

**Types & Constants**: New types in `convex/lib/types.ts`, agent constants in `convex/lib/constants.ts`

### Phase 2: Decision Trees + Templates

**Templates** (`convex/data/templates/index.ts`):
- 12 templates encoded: E-01 through E-03 (migrated from legacy), T-01 through T-08 (from team review), G-05 (invoice hold)
- T-01 Landlord Questionnaire with 6 landlord questions (Tier 1)
- Variable placeholders with `{{#if}}` conditional blocks

**Decision Trees** (`convex/data/decisionTrees/index.ts`):
- `email-triage` — Routes all classification types to actions
- `followup-timer` — Standard follow-up at 2 days, escalated at 5+ days

**Decision Engine** (`convex/services/decisionEngine.ts`):
- Traverses trees, evaluates conditions, logs every step to `decisionLogs`

**Template Engine** (`convex/services/templateEngine.ts`):
- Populates templates from Convex-only data (site, vendor, email context)

**Cron** (`convex/executeDecisions.ts`):
- Runs every 15 min, processes classified emails through triage tree, creates `draftEmails` records

### Frontend

**Auth**: Google OAuth via next-auth v5 (`src/lib/auth.ts`, `src/middleware.ts`)

**Navigation**: Global nav bar with Dashboard, Review Queue, Vendors links (`src/components/Nav.tsx`)

**Dashboard** (`/`): Three-tab layout — Inbound Feed, Threads, Sites

**Review Queue** (`/review`): Lists all drafts with status/tier badges, pending count

**Draft Review** (`/review/[id]`): Original email context panel + agent draft with Approve/Edit/Reject buttons (send pipeline placeholder — wired in Phase 3)

**Vendor Directory** (`/vendors`): List all vendors with CRUD, add vendor form

**Sign-in** (`/auth/signin`): Google OAuth sign-in page

### Tests

151 total tests passing across 14 files:
- `email-classifier.test.ts` (12 tests) — rule-based classification
- `context-resolver.test.ts` (8 tests) — email-to-site/vendor matching
- `decision-engine.test.ts` (13 tests) — tree traversal and routing
- `template-engine.test.ts` (9 tests) — variable population and conditionals
- Plus 109 existing tests (address normalizer, business days, email parser, etc.)

---

## Next Up (Priority Order)

### Immediate — Before Re-enabling Crons
1. **Zack email redirect** — Confirm trigger emails now go to `edu.ops@trilogy.com`
2. **Re-enable Google Chat** — Remove early return in `googleChat.ts`
3. **Re-enable crons** — Uncomment in `crons.ts`, deploy
4. **End-to-end validation** — Send a test trigger email, verify site creation, scheduling check, and Chat notification

### Short-term — Complete Phase 3
5. **Edit distance tracking** — Compute Levenshtein distance between original and edited draft body on `editAndSend`
6. **LLM draft generator** — For `vendor_scheduling`, `vendor_completion`, `vendor_question` classifications that don't have fixed templates
7. **Follow-up timer logic** — Set `timerDeadline` on email threads based on SLA rules
8. **`checkEscalations` cron** — Fire follow-up templates when thread timers expire
9. **`draftDigest` cron** — Post pending draft summary to Google Chat every 4 hours

### Medium-term — Schema Cleanup
10. **Remove legacy trigger fields** — Drop `triggerEmailId`, `triggerThreadId`, `triggerMessageId` from schema and remove `by_triggerEmailId`/`by_triggerThreadId` indexes
11. **Remove legacy `gmail.ts`** — Dead code, no longer imported
12. **Refactor `checkReplies.ts`** — 277-line function → extract helpers (from code review I3)

---

## What's Left

### Phase 3: Send Pipeline + Escalation Crons

- [x] Wire review dashboard Approve/Edit/Reject buttons to Convex mutations + `agentGmail.sendEmail()`
- [x] Populate `sentBody`/`sentTo`/`sentCc` on `draftEmails` after send
- [ ] Compute `editsMade` and `editDistance` on edited drafts
- [ ] LLM draft generator for classifications without fixed templates (vendor_scheduling, vendor_completion, vendor_question)
- [ ] `checkEscalations` cron (1h) — fire follow-up templates when thread timers expire
- [ ] `draftDigest` cron (4h) — post pending draft summary to Google Chat webhook
- [ ] Follow-up timer logic: set `timerDeadline` on threads based on SLA (2 biz days pre-scheduled, day after due date post-scheduled)
- [ ] Google Calendar read integration for DRI calendar availability (G-07 reschedules)

### Phase 4: Diff Analysis + Learning Loop

- [ ] `diffAnalyzer.ts` service — Levenshtein similarity + Anthropic API semantic categorization
- [ ] `analyzeDiffs` cron (6h) — process sent drafts through diff analyzer
- [ ] `evaluateGates` cron (daily) — recalculate per-type pass rates on 30-day rolling window
- [ ] `generatePatternReport` cron (weekly) — aggregate edit categories, post to Chat
- [ ] Dashboard insights view: pass rates by type, common edit categories, trends
- [ ] Gate logic in `executeDecisions`: check mode before auto-sending

### Phase 5: Graduated Auto-Send

- [ ] Types hitting 95% pass rate with 20+ reviews graduate to `auto_send_with_sampling`
- [ ] 1-in-5 sampling: randomly hold back 20% for review
- [ ] Regression detection: if sampled pass rate drops below 90%, revert to supervised
- [ ] Instruction improvement: Claude proposes template/tree changes, human approves via dashboard

### Future / Deferred

- [ ] Zoning and CUP decision trees (deferred — humans handle)
- [ ] Escalation routing table (permitting → Greg, buildout → Andrea, deal/legal → Robbie)
- [ ] Expand vendor directory to 80+ records
- [ ] Move decision trees from static files to Convex table (Phase 4+)
- [ ] Site detail page (`/sites/[id]`) with full thread history

---

## Environment Variables Reference

### Convex Dashboard (existing)
- `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` — legacy email polling
- `GOOGLE_SERVICE_ACCOUNT_KEY` — Sheets + Drive access
- `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_RANGE`
- `GOOGLE_CHAT_WEBHOOK_URL`
- `AIRTABLE_API_TOKEN`, `AIRTABLE_SHARED_VIEW_URL`
- `ANTHROPIC_API_KEY`

### Convex Dashboard (new — needed for deploy)
- `AGENT_GMAIL_CLIENT_ID` — OAuth client ID for `edu.ops@trilogy.com`
- `AGENT_GMAIL_CLIENT_SECRET` — OAuth client secret
- `AGENT_GMAIL_REFRESH_TOKEN` — OAuth refresh token

### `.env.local` (existing)
- `NEXT_PUBLIC_CONVEX_URL`
- `ADMIN_API_KEY`
- `ANTHROPIC_API_KEY`

### `.env.local` (new — needed for auth)
- `AUTH_GOOGLE_ID` — Google OAuth web client ID (for sign-in button)
- `AUTH_GOOGLE_SECRET` — Google OAuth web client secret
- `AUTH_SECRET` — NextAuth session encryption key

---

## File Structure (new files)

```
convex/
  classifyInbound.ts              # Cron: classify inbound emails
  executeDecisions.ts             # Cron: run decision trees on classifications
  emailClassifications.ts         # Table CRUD
  emailThreads.ts                 # Table CRUD
  vendors.ts                      # Table CRUD + seed
  jurisdictions.ts                # Table CRUD
  reviewers.ts                    # Table CRUD
  draftEmails.ts                  # Table CRUD
  decisionLogs.ts                 # Table CRUD
  classificationGates.ts          # Table CRUD
  services/
    agentGmail.ts                 # Gmail client for edu.ops@trilogy.com
    emailClassifier.ts            # Rule-based + LLM classification
    contextResolver.ts            # Email → site/vendor linking
    decisionEngine.ts             # Decision tree traversal
    templateEngine.ts             # Template variable population
  data/
    decisionTrees/index.ts        # Email triage + follow-up timer trees
    templates/index.ts            # 12 email templates
    vendorsSeed.ts                # Initial vendor directory (11 vendors)
src/
  components/Nav.tsx              # Global navigation bar
  lib/auth.ts                     # NextAuth Google OAuth config
  middleware.ts                   # Route protection
  app/
    NavWrapper.tsx                # Client wrapper for nav
    api/auth/[...nextauth]/route.ts  # NextAuth handler
    auth/signin/page.tsx          # Sign-in page
    review/page.tsx               # Review queue
    review/[id]/page.tsx          # Individual draft review
    vendors/page.tsx              # Vendor directory
tests/unit/
  email-classifier.test.ts       # 12 tests
  context-resolver.test.ts       # 8 tests
  decision-engine.test.ts        # 13 tests
  template-engine.test.ts        # 9 tests
```
