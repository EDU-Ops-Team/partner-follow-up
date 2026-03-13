# Email Agent — Template Inventory for Team Review

**Date:** March 13, 2026 **Purpose:** Complete inventory of all existing templates, proposed templates from the consolidation doc, and identified gaps. Team should review and decide what to keep, modify, or add.

---

## Section 1: Existing Templates in Codebase

These are currently in `convex/lib/templates.ts` and used by the existing automation.

### Email Templates (Outbound)

| ID | Name | Trigger | Recipient | Content Summary |
| :---- | :---- | :---- | :---- | :---- |
| E-01 | Scheduling Reminder | Site triggered, LiDAR or inspection not yet scheduled | Responsible party (vendor/POC) | Reminder that scheduling is incomplete. Lists LiDAR and Inspection status. Politely asks for their attention and to schedule as soon as possible. |
| E-02 | LiDAR Completion Reminder | LiDAR scan not completed | Responsible party | Reminder that LiDAR scan is pending. Shows current job status. |
| E-03 | Inspection Report Reminder | Report past due date | Inspection contact (Steve Hehl / Worksmith) | Politely reminds the inspection report is overdue and asks for expected delivery date.  |
| ~~E-04~~ | ~~Report Reminder (General)~~ | ~~Report not received~~ | ~~Responsible party~~ | ~~Similar to E-03 but sent to the responsible party rather than the inspection contact.~~ |

### Chat Notification Templates (Internal — Google Chat)

| ID | Name | Trigger | Content Summary |
| :---- | :---- | :---- | :---- |
| C-01 | Scheduling Reminder | Same as E-01 | LiDAR/Inspection status, responsible party, reminder count |
| C-02 | Both Scheduled | LiDAR and inspection both confirmed scheduled | Scheduled dates, transition to completion phase |
| C-03 | LiDAR Complete | LiDAR scan marked complete in Airtable | Job status confirmation |
| C-04 | Report Reminder | Report overdue | Due date, reminder count |
| C-05 | Report Received | Report received in Sheets | Report link if available, site resolved |
| C-06 | Site Resolved | Both LiDAR and inspection complete | Final status summary |
| C-07 | Import — Missing Responsible Party | Manual import missing POC | Address, subject, message ID |
| C-08 | Import — No Address Found | Manual import missing address | Subject, message ID |
| C-09 | Import — Site Created | Manual import succeeded | Address, responsible party, source |
| C-10 | Reply Received | Vendor replied to thread | Sender, summary of reply |
| C-11 | Attachment Saved | Vendor attachment saved to Drive | Filename, Drive link |
| C-12 | Status Updated from Reply | Vendor reply triggered status change | Field changed, new value |
| C-13 | Auto-Reply Sent | LLM response sent to vendor | Recipient, response summary |
| C-14 | Needs Human Review | LLM flagged \[UNCERTAIN\] | Sender, message excerpt, holding response note |
| C-15 | Holding Response Sent | Holding reply sent pending review | Sender info |

---

## Section 2: Proposed Templates from Consolidation Doc

These are referenced in the consolidation document from the four contributors (Greg, Andrea, Robbie, Devin). They are NOT yet in the codebase. Each needs team review to decide: keep as-is, modify, or drop.

### Outbound Email Templates (Vendor/External)

| ID | Name | Source | Trigger | Recipient | Content Summary |
| :---- | :---- | :---- | :---- | :---- | :---- |
| T-01 | Land Lord/Owner Questionnaire Follow up | Team | New Site Email | Broker/POC | Friendly introduction followed a friendly reminder to schedule LiDAR and Inspection if not done so already. Then politely ask for their attention to the following questions.Do you have shell drawings or any as-builts plans of the existing space? Are there any Landlord Signage/Design Guidelines? Are there any Landlord Construction Rules and Regulations? Are there any Landlord Required Subcontractors (Roofing, Sprinkler, Alarm, etc.)? What is the Landlord entity name that should be listed as additionally insured on the contractor's insurance? Will we need to move utilities into our name, or is everything sub-metered? Please provide any prior utility bills for utilities that need to be put into our name, if possible. |
| T-02 | Vendor Follow-up — Non-Critical | Robbie | Vendor non-responsive 2+ biz days | Vendor contact | Professional follow-up requesting status update. Reference original request. |
| T-03 | Vendor Follow-up — Escalated | Robbie | Vendor non-responsive 5+ biz days | Vendor contact | Stronger follow-up. Note urgency. Mention escalation path if no response. |
| T-04 | Document Request to Landlord/Broker | Devin | Missing lease/property docs | Landlord or broker | Request for specific documents needed for due diligence. CC auth.permitting. |
| T-05 | Inspection Report Received — No Red Flags | Devin | Report received, no issues | Internal distribution | Summary of inspection results. Distribute report \+ photos to site Drive folder \+ tracking sheet. |

### Inbound Response Templates (Responding to emails we receive)

| ID | Name | Source | Trigger | Content Summary |
| :---- | :---- | :---- | :---- | :---- |
| T-06 | Tax Exempt Question Response | Andrea | Vendor asks if Alpha is tax exempt | Standard reply: "Alpha is not tax exempt." |
| T-07 | Entity Name Confirmation | Andrea | Vendor asks for legal entity name | "Alpha School \[Zip Code\], LLC" (no 's'). Format rule from Andrea's Confidence Boosters. |
| T-08 | Holding Response — Needs Review | Codebase (existing) | LLM flagged uncertain | "We received your message. Our team will review and follow up shortly." |

---

## Section 3: Identified Gaps — Templates Needed But Not Yet Written

These scenarios were identified in the consolidation doc (Section 4\) as missing. The team needs to decide content and tone for each.

| \# | Scenario | Why It's Needed | Suggested Approach |
| :---- | :---- | :---- | :---- |
| G-01 | **Vendor asks a question** | Vendors email asking about timeline, scope, process, or access details. Currently no standard response. | Agent should answer if the info is available in site context (e.g., "inspection is scheduled for March 20"). If not available, acknowledge and flag for human. |
| G-02 | **Landlord pushes back on timing** | Landlord says proposed date doesn't work, access can't be granted yet, or delays the process. | Acknowledge, offer alternative dates if possible, escalate to DRI if it blocks the timeline. Tone: professional, accommodating but firm on urgency. |
| G-03 | **City/jurisdiction requests additional documents** | City sends email requesting additional documentation for permit, zoning, or inspection. | Acknowledge receipt, identify which documents are requested, flag for the team to gather docs. Do NOT commit to a timeline for providing them. |
| G-04 | **Vendor delivers incorrect or incomplete work** | Inspection report is missing sections, LiDAR data is wrong address, contractor work doesn't match spec. | Acknowledge receipt, identify the specific issue, request correction with specifics. CC appropriate internal contact based on vendor type. |
| G-05 | **Invoice received without prior approval** | Andrea's unique workflow: vendor sends invoice that hasn't been pre-approved. | Do NOT process. Flag for Andrea. Template: "Thank you for sending this invoice. Our team needs to review this before processing. We'll follow up shortly." |
| G-06 | **Vendor introduces new contact or transfers ownership** | Vendor says "I'm no longer handling this, contact \[new person\]" or "Meet my colleague who's taking over." | Acknowledge, update vendor contact record, send introductory email to new contact with current status summary. |
| G-07 | **Scheduling conflict / reschedule request** | Vendor or site contact says the scheduled date no longer works. | Acknowledge, propose next available date using business day logic and reviewing P1 Accountable’s calendar, update tracking. If critical-path item, flag for DRI. |

---

## Decision Guide for Team Review

For each template above, the team should decide:

1. **Keep / Modify / Drop** — Is this template needed? Does the content need changes?  
2. **Tier assignment** — Should the agent:  
   - **Tier 1**: Send autonomously (no human review needed)?  
   - **Tier 2**: Draft and flag for human review before sending?  
   - **Tier 3**: Do NOT draft — just escalate to human?  
3. **CC rules** — Who should be CC'd on each template type?  
4. **Tone** — Any tone adjustments? (The default is professional, direct, concise.)

---

## Hard-Coded Rules (Apply to ALL Templates)

From the consolidation doc — these are non-negotiable:

- ALWAYS CC [auth.permitting@trilogy.com](mailto:auth.permitting@trilogy.com) on any permitting, zoning, or inspection email  
- New inspections ALWAYS go to [alpha@worksmith.com](mailto:alpha@worksmith.com), not individual emails  
- Billing questions ALWAYS route to [billing@alpha.school](mailto:billing@alpha.school)  
- NEVER identify Alpha by name when contacting city/jurisdiction initially  
- NEVER acknowledge lease terms, sign documents, or commit to financial terms  
- Entity name is always "Alpha School \[Zip Code\], LLC" (no 's')  
- Alpha is NOT tax exempt  
- Sign all emails as "EDU Ops Team"

