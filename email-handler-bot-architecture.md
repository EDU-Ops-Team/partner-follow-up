# EDU Ops Agent: Current-State Architecture

> Updated for the live Partner Follow Up system
> Date: 2026-03-20

---

## Executive Summary

The EDU Ops agent should be powered by the architecture already taking shape in this repo:

- **single-agent-first**
- **event-driven processing**
- **Convex as the canonical state store**
- **human review gates for external actions and uncertain inferences**
- **structured feedback loops to improve the system over time**

The right architecture for this product is **not** a filesystem-based email bot with markdown task files as runtime state. That pattern is useful as inspiration, but this system already has a stronger foundation:

- structured task state
- site records
- task-event history
- review queues
- learning insights
- archive backfill
- admin controls

So the correct direction is to formalize the current system, not replace it.

---

## Why This Architecture Fits

This product is:

- **event-driven**: inbound email and tracking refreshes create work
- **stateful**: sites, tasks, threads, and drafts persist over time
- **branching**: different classes of email and task evidence follow different paths
- **human-supervised**: replies and historical state transitions still need review
- **incrementally autonomous**: the goal is to widen autonomy only where measured quality justifies it

That makes the best-fit architecture:

1. **Thin orchestration**
2. **One main reasoning agent**
3. **Convex-backed canonical state**
4. **Specialized processors and prompts, not separate independent agents**

This matches what is already implemented.

---

## Canonical Sources Of Truth

### 1. Convex database

Convex is the runtime source of truth for:

- sites
- tasks
- task events
- email classifications
- email threads
- draft emails
- archive threads and messages
- task signals
- reviewer records
- learning metrics

This is the correct place for mutable operational state because it is:

- shared by backend and frontend
- queryable
- versioned by schema
- compatible with admin workflows and review UI

### 2. External operational sources

Convex stores the normalized operating state, but some facts are refreshed from external systems:

- **Airtable shared view** for LiDAR tracking
- **Google Sheets** for inspection/report tracking
- **Gmail / Google Groups** for email data

These are source systems for facts, not the place where workflow state should live.

### 3. Prompt sources in Git

Prompt content lives in markdown under `prompt-sources/`, then compiles into generated TypeScript.

That is the right pattern for prompt control because it gives:

- plain-language editing
- Git reviewability
- deploy-safe runtime loading

---

## Core Runtime Model

## 1. Site-centric operations

The top-level operating object is a **site**.

A site contains:

- address and contact context
- external tracking fields
- current phase
- freshness timestamps
- record-review disposition

But the site is no longer the only logic carrier. The site is now the container for the task model.

## 2. Task-centric progress

Each site has a standard M1 task set:

- `sir`
- `lidar_scan`
- `building_inspection`

Each task moves through a shared state model:

- `requested`
- `scheduled`
- `in_progress`
- `in_review`
- `completed`
- `blocked`
- `not_needed`

Site progress is derived from task states, not from a one-off badge.

This is important because it lets the system:

- absorb new task types later
- show consistent progress
- support historical task-event learning
- reason about completion more structurally

## 3. Thread-aware email processing

Email is not handled as isolated messages only. The system uses:

- message-level classification
- thread-level state
- site linkage
- partner linkage
- task context where available

That keeps drafts and decisions grounded in the actual operating context.

---

## Processing Pipelines

## A. Live inbound pipeline

This is the production email-response path.

### Step 1: capture

Unread inbound messages to the EDU Ops mailbox are fetched and parsed.

### Step 2: context resolution

The system tries to resolve:

- site match
- partner match
- thread context
- extracted entities

### Step 3: classification

Messages are classified into operational types such as:

- partner scheduling
- partner completion
- partner question
- partner invoice
- internal action needed
- internal FYI
- unknown

### Step 4: decision execution

Decision trees determine whether to:

- draft a reply
- use a template
- escalate
- archive
- take no external action

### Step 5: human review

Drafts enter a review queue where humans:

- approve and send
- edit and send
- reject

### Step 6: learning capture

The system stores:

- final outcome
- edit distance
- edit categories
- feedback reasons

This is the live supervised-learning loop for outbound communication.

---

## B. Tracker refresh pipeline

This is the operational site-tracking path.

### Scheduling refresh

The system checks:

- LiDAR scheduling from Airtable
- inspection scheduling from Google Sheets

### Completion refresh

The system checks:

- LiDAR job completion
- inspection/report completion

### Derived effects

Tracker refresh updates:

- site tracking fields
- freshness timestamps
- task states for LiDAR and Building Inspection
- dashboard progress

The tracker pipeline should be treated as **fact synchronization**, not as the entire business workflow.

---

## C. Historical archive pipeline

This is the Google Groups backfill path.

### Step 1: raw archive ingestion

Historical Google Groups threads and messages are scraped and stored as raw records.

Important rule:

- **raw archive is stored first**
- **nothing writes directly from scraped history into live task state**

### Step 2: task signal extraction

Archived messages are scanned for:

- task type
- site match
- proposed state transition
- evidence snippet
- confidence

This creates **task signals**, not direct state changes.

### Step 3: site discovery

If archive diagnostics show many `no_site_match` results, admins can run site discovery from archived messages. That flow:

- extracts strong addresses
- creates missing site records
- seeds standard tasks
- reruns signal extraction

### Step 4: human apply/reject

Task signals are reviewed before they touch live tasks.

This allows the historical archive to improve the system without silently polluting state.

---

## Human Review Surfaces

The system now has three distinct feedback layers.

## 1. Draft review

Question answered:

- Was this outbound reply good enough?

Used to improve:

- prompts
- decision rules
- autonomy thresholds

## 2. Task signal review

Question answered:

- Did this archived message actually imply a valid task transition?

Used to improve:

- historical signal detection
- state inference quality
- site/task mapping quality

## 3. Site record disposition

Question answered:

- Was this site record created correctly from the message thread?

Disposition states:

- `unreviewed`
- `confirmed`
- `needs_review`
- `invalid`

Used to improve:

- site creation logic
- address extraction logic
- archive discovery quality

These three review surfaces are what make the architecture viable for gradual self-improvement.

---

## Recommended Agent Shape

## Single main agent, multiple structured tools

The right model is still **single-agent-first**.

Why:

- the system’s reasoning context is shared across classification, drafting, task inference, and state updates
- separate agents would create coordination overhead
- error propagation between agents would be worse than the benefits at current scale

What should vary is:

- context loaded
- prompt used
- tool path chosen

Not the number of independent agents.

So the architecture should remain:

- one main reasoning agent
- structured tools/services for classification, drafting, state detection, and tracker sync
- one canonical data model in Convex

---

## What Should Be Structured Config

These should live as structured config, code, or generated prompt sources:

- task-state weights
- task templates
- partner routing rules
- decision trees
- prompt sources
- autonomy gates
- review reason categories

These should **not** live as freeform operational prose only.

That is one useful lesson from the earlier reference architecture: specs belong in a machine-usable form.

---

## What Should Not Be Adopted

The following ideas from the earlier generic email-bot architecture should **not** be used as runtime architecture here.

## 1. Filesystem state as canonical runtime state

Do not use directories like:

- `state/tasks/`
- `state/threads/`
- `drafts/`
- `log/`

as the operating source of truth.

Why not:

- it duplicates Convex
- it creates split-brain state
- it does not fit the current web UI and reviewer flows
- it makes querying and cross-linking harder

## 2. Generic task-file schemas unrelated to the current model

Do not introduce a second task-state model like:

- `new`
- `waiting-on-others`
- `done`

The live system already has a task-state model connected to progress math and UI.

## 3. Human-send-only forever

The current supervised review model is correct today, but the architecture must support future graduated autonomy.

That means:

- drafts should be reviewable today
- but the state model should not assume human-send forever

---

## Autonomy Strategy

The right autonomy path is:

## Stage 1: supervised

- human review for all drafts
- human review for all task signals
- human review for site-record quality via disposition

## Stage 2: graduated

Allow bounded automation only for classes with:

- enough reviewed volume
- strong pass rates
- low-risk edit patterns
- clean routing behavior

## Stage 3: selective autonomy

Only enable auto-send or auto-apply for narrow, low-risk cases where metrics support it.

This architecture supports that path because the feedback loops are already structured.

---

## Observability

Good observability in this system should come from:

- audit logs
- task events
- draft review outcomes
- task signal diagnostics
- site record dispositions
- freshness timestamps
- learning insights

That is stronger than a flat text log directory because it is queryable and tied to the live state model.

---

## Final Recommendation

Use this architecture to power the agent:

- **single reasoning agent**
- **Convex-backed canonical state**
- **event-driven processing**
- **task-based site model**
- **review queues for external communication and uncertain inference**
- **archive backfill as raw data first, inferred state second**
- **site-record dispositions as a direct quality signal**

Do not use a filesystem-driven runtime architecture as the core system.

The right move is to keep evolving the current architecture by strengthening:

- site creation quality
- task-signal quality
- draft quality
- autonomy gates

not by replacing Convex with markdown state files.
