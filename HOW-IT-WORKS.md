# Partner Follow Up - How It Works

## What It Does

Partner Follow Up is an operations system for EDU Ops. It does three related jobs:

1. Tracks site work across standard partner tasks such as SIR, LiDAR Scan, and Building Inspection.
2. Watches live inbound email involving `edu.ops@trilogy.com`, classifies it, and drafts replies for human review.
3. Backfills historical Google Groups mail into a supervised archive so old threads can improve task history and detection quality over time.

The system is no longer just a reminder bot for LiDAR and inspection. It is now a combined site tracker, supervised reply assistant, and learning loop.

## The Main Operating Model

### Site records

Each site is a tracked operating record in Convex. A site still has core tracking fields like:

- LiDAR scheduling and job status
- inspection scheduling and report due dates
- responsible party and inspection contact
- reminder counters and next-check timing

But the primary site summary is now task-based instead of relying only on those raw fields.

### Task model

Each site carries a standard phase-one task set:

- `SIR`
- `LiDAR Scan`
- `Building Inspection`

New sites seed these tasks automatically in the `requested` state because the kickoff email already implies that the work has been requested.

The supported task states are:

- `requested`
- `scheduled`
- `in_progress`
- `in_review`
- `completed`
- `blocked`
- `not_needed`

Site progress is calculated from task states, not from a single lifecycle badge. The dashboard progress bar is the average weighted progress across active tasks.

## How A Site Gets Created

There are now two main creation paths.

### 1. Live inbound trigger flow

For live operations, inbound email is processed and linked into the system. When a message contains a strong site address and enough context, the system creates or updates the matching site record.

### 2. Archive discovery flow

For historical Google Groups mail, the system first stores raw archived messages. If task-signal diagnostics show many `no_site_match` outcomes, admins can run archive-driven site discovery. That process:

- scans archived messages that look operationally relevant
- extracts strong address candidates
- creates missing site records when the address looks valid
- seeds the standard M1 tasks for the new site
- reruns task signal extraction against the expanded site list

This is how the system can learn from older group-inbox history without requiring everything to have been captured in the original live flow.

## How Live Email Works

The live email path is now a supervised reply workflow.

### Step 1: Inbound capture

The system watches inbound mail where EDU Ops is involved and stores the message with thread context.

### Step 2: Classification

Each message is classified into an operational type such as:

- partner scheduling
- partner completion
- partner question
- partner invoice
- internal action needed
- internal FYI
- unknown

### Step 3: Decisioning

Decision trees decide what should happen next:

- generate a draft reply
- wait for more information
- escalate to a human
- track context only

### Step 4: Human review

Draft replies go to the review queue. Reviewers can:

- approve and send
- edit and send
- reject

The system stores the final outcome, edit distance, edit categories, and reviewer feedback reasons.

### Step 5: Learning

Review outcomes roll up into insights so the team can measure:

- pass rate by classification type
- average edit distance
- common edit categories
- reviewed examples behind each class

This is the core supervised-learning loop for partner-facing replies.

## How Historical Email Backfill Works

Google Groups history is handled as a separate supervised pipeline.

### Raw archive first

Historical threads and messages are scraped from the Google Groups interface and stored as raw archive records.

The system does not write directly from scraped history into live task state.

### Task signal extraction second

Archived messages are scanned for supported task signals. A task signal is a proposed state transition inferred from message evidence, for example:

- a LiDAR job being scheduled
- an inspection report being delivered
- an SIR being sent

Signals are attached to:

- site
- task type
- proposed state
- confidence
- evidence snippet

### Human review before apply

Task signals appear on the `Task Signals` page for review. Reviewers can apply or reject them before they change live task history.

This prevents noisy historical email from silently corrupting the task timeline.

### Diagnostics

The diagnostics table shows why a message did not become a signal. Common outcomes are:

- `no_task_type`
- `no_site_match`
- `no_state`

That table is used to improve detection rules instead of guessing where the detector is weak.

## How Tracker Data Works

The system still uses external operational sources for current site status.

### LiDAR source

LiDAR data comes from an Airtable shared view. The production path now reads the shared-view data directly instead of depending on private Airtable API access.

The site tracker uses that source for fields like:

- scheduled date and time
- job status
- data-as-of timestamp
- model URL when available

### Building Inspection source

Inspection and report data comes from Google Sheets. The tracker continues to read:

- inspection date
- inspection time
- report due date
- report received status
- report link

### Freshness

The dashboard now shows when tracking data was last pulled so reviewers can tell whether they are looking at fresh source-backed data or something that may be behind.

Key freshness fields:

- `trackingUpdatedAt`
- `lidarLastCheckedAt`
- `inspectionLastCheckedAt`

## What The Dashboard Shows

Each site card now has four important layers.

### 1. Progress bar

The top progress bar reflects weighted task completion across the site's active tasks.

### 2. Task checklist

Each site shows its current task states for:

- `SIR`
- `LiDAR Scan`
- `Building Inspection`

### 3. Tracking facts

The tracker section still shows source-backed operational facts such as:

- LiDAR status and scheduled time
- inspection date and report due date
- responsible party and inspection contact
- source freshness timestamps

### 4. Record Disposition

Expanded site cards now include a site-record review control. Reviewers can mark a site as:

- `Unreviewed`
- `Confirmed`
- `Needs review`
- `Invalid`

They can also leave a note.

This feedback is specifically about whether the site record itself was created correctly from the email thread. It is separate from reply review and separate from task-signal review.

## What Reviewers Are Teaching The System

There are now three major human feedback surfaces.

### 1. Draft review

Reviewers teach the reply system whether the drafted email was good enough to send.

### 2. Task signal review

Reviewers teach the archive detector whether a historical message really implies a task transition.

### 3. Site record disposition

Reviewers teach the site-creation logic whether the system created the right record from the source thread.

Together, these three feedback loops give the system the data needed to improve:

- response quality
- task-state inference quality
- site creation quality

## Admin Controls

Admins can run operational jobs manually instead of waiting for cron windows.

Current admin-triggered flows include:

- scheduling refresh
- completion refresh
- full tracking refresh
- task backfill
- task signal extraction
- archive-driven site discovery plus signal rerun

These are intended for testing, cleanup, and controlled replay.

## Prompt Management

Prompt content now lives in markdown under `prompt-sources/`.

The current model is:

- humans edit markdown prompt files in team Git
- `npm run prompts:sync` generates the deploy-safe TypeScript prompt library
- Vercel and Convex deploy from the generated prompt code, not the markdown files directly

This keeps prompt changes:

- versioned
- reviewable
- easy for approved users to edit
- safe for deployment

## Safeguards

The system now has several layered safeguards.

- Human review remains in the loop for draft replies and task-signal application.
- Site record disposition provides direct quality feedback on record creation.
- Raw archive is stored before any historical message can affect live tasks.
- Audit logs record major state changes and errors.
- Tracking jobs now persist site updates before downstream side effects so source refresh is not lost if a notification step fails.
- Source freshness timestamps make stale tracking visible.
- Old or stale task signals are prevented from silently overwriting newer task state.

## Infrastructure

- Backend: Convex
- Frontend: Next.js 15 on Vercel
- Auth: Google OAuth via Auth.js
- Live operational sources: Airtable shared view and Google Sheets
- Historical source: Google Groups browser backfill

## Current Reality

The current system is best understood as:

- a live site tracker
- a supervised partner-reply assistant
- a historical message backfill pipeline
- a feedback collection system for improving all three

It is not fully autonomous. The point of the current design is to capture high-quality human feedback so the system can improve safely before more autonomy is allowed.
