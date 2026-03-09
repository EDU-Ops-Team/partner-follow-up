# Vendor Follow Up — How It Works

## What It Does

Vendor Follow Up is an automated agent that monitors LiDAR scanning and Building Inspection scheduling for Alpha Schools sites. When a trigger email arrives, the system tracks the site through three phases — scheduling, completion, and resolution — sending reminders via Google Chat and email to the right people until everything is done.

## The Three Phases

### Phase 1: Scheduling

A trigger email from `zack.lamb@2hourlearning.com` kicks things off. The system extracts the site address and responsible party from the email, creates a tracking record, and starts checking every 2 business days whether:

- **LiDAR** has been scheduled (checked against Airtable)
- **Building Inspection** has been scheduled (checked against Google Sheets)

If either is missing, the system sends a reminder to Google Chat and emails the responsible party. Once both are scheduled, the site advances to the completion phase and a confirmation is posted to Chat.

When an inspection date is found, **Steve Hehl (shehl@worksmith.com)** is automatically assigned as the inspection contact for report follow-ups.

### Phase 2: Completion

Now the system monitors whether the work is actually done:

- **LiDAR scan** — Has the job status changed to "complete" in Airtable?
- **Inspection report** — Has the report been received in Google Sheets?

Each milestone triggers a Chat notification. Follow-up reminders are **routed to the right person**:

- **LiDAR not complete** — reminder email sent to the original responsible party
- **Inspection report overdue** — reminder email sent to Steve Hehl (Worksmith) only, and only after the report due date has passed
- If both are pending, each person gets their own targeted email

Report reminders are **not sent before the due date** — the system monitors silently until the deadline passes, then begins follow-ups every 2 business days.

Once both the LiDAR scan is complete and the report is received, the site is resolved.

### Phase 3: Resolved

The site is marked resolved with a timestamp. A final notification is posted to Google Chat. No further checks or reminders are sent.

## How Checks Run

Three cron jobs run continuously on the Convex backend:

| Job | Frequency | What It Does |
|-----|-----------|-------------|
| **Check Email** | Every 15 minutes | Polls Gmail for new trigger emails, creates site records |
| **Check Scheduling** | Every 30 minutes | Looks up LiDAR + Inspection status, sends scheduling reminders |
| **Check Completion** | Every 30 minutes | Monitors LiDAR completion + report receipt, resolves sites |

All intervals between reminders are calculated in **business days** (skipping weekends and US federal holidays). The default check interval is 2 business days.

On every check cycle, the system refreshes LiDAR job status and "Data as of" date from Airtable, so the dashboard always reflects the latest information.

## How Address Matching Works

Site addresses from trigger emails are matched against Airtable and Google Sheets data using fuzzy matching. Addresses are first normalized (abbreviating "Street" to "St", "Avenue" to "Ave", etc.) and then compared using Levenshtein distance. A match requires 85% similarity or higher, which handles minor typos and formatting differences.

## Where Data Lives

| Data Source | What It Provides |
|-------------|-----------------|
| **Gmail** | Trigger emails that start tracking, outbound reminders |
| **Airtable** (shared view) | LiDAR scheduling dates, job status, data-as-of date |
| **Google Sheets** | Building Inspection dates, report due dates, report receipt status |
| **Google Chat** (webhook) | All status notifications posted to a team space |
| **Convex database** | Site tracking records, audit logs, sync state |

## Who Gets Notified

Reminders are routed based on responsibility:

| Scenario | Email Recipient | Chat |
|----------|----------------|------|
| LiDAR or Inspection not scheduled | Original responsible party | Combined message |
| LiDAR scan not complete | Original responsible party | Combined message |
| Inspection report overdue (past due date) | Steve Hehl (Worksmith) | Combined message |
| Both LiDAR incomplete + report overdue | Each gets their own email | Combined message |

Google Chat always receives a single combined message for team visibility. Emails are targeted to the person responsible for that specific item.

### Chat Notifications
- **Scheduling Reminder** — Lists which items are still unscheduled, days since trigger, reminder count
- **Both Scheduled** — Confirms LiDAR and Inspection dates, announces move to completion phase
- **LiDAR Complete** — Confirms scan is done, waiting for report
- **Report Reminder** — Report not yet received, shows due date if available
- **Report Received** — Confirms report with link if available
- **Site Resolved** — All items complete, site closed

### Email Notifications
- **Scheduling Reminder** — Sent to responsible party listing which items need scheduling
- **LiDAR Completion Reminder** — Sent to responsible party when LiDAR scan is still pending
- **Inspection Report Reminder** — Sent to Steve Hehl when report is past due date

## Dashboard

A web dashboard at the Vercel deployment URL shows each tracked site as a card with three sections:

**LiDAR**
- Status (Scheduled / Complete / Not scheduled)
- Scheduled date and time
- Job status (from Airtable, refreshed every check cycle)
- Data as of (from Airtable)

**Building Inspection**
- Status (Scheduled / Not scheduled)
- Inspection date and time
- Report due date
- Report status (Received with link / Pending)

**Tracking**
- Responsible party (original, for LiDAR)
- Inspection contact (Steve Hehl, for report follow-ups — shown when set)
- Trigger date
- Last outreach date
- Total reminders sent
- Next check date (or "Resolved")

## Safeguards

- **Duplicate prevention** — Trigger emails are deduplicated by message ID; notification flags prevent repeat alerts
- **Audit logging** — Every state change is recorded with timestamp and details
- **Retry with backoff** — External API calls (Gmail, Airtable, Sheets, Chat) retry up to 3 times with exponential backoff
- **Graceful failures** — If one external service is down, other checks still proceed
- **Reminder limits** — Up to 10 scheduling reminders and 10 report reminders per site
- **Due date gating** — Report reminders only fire after the due date passes, not before

## Infrastructure

- **Backend**: Convex (database, cron jobs, server actions)
- **Frontend**: Next.js 15 on Vercel
- **No external orchestration** — Convex's native cron engine handles all scheduling
