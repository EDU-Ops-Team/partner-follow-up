/**
 * Email Agent Templates
 *
 * Each template has:
 * - id: unique identifier referenced by decision trees
 * - name: human-readable name
 * - tier: 1 (auto-send eligible) or 2 (requires human review)
 * - subject: email subject with {{variable}} placeholders
 * - body: HTML email body with {{variable}} placeholders
 * - defaultTo: who receives this (can be overridden by decision engine)
 * - defaultCc: default CC list
 *
 * Available variables:
 * - {{site.address}}, {{site.fullAddress}}, {{site.phase}}
 * - {{site.responsiblePartyName}}, {{site.responsiblePartyEmail}}
 * - {{site.inspectionDate}}, {{site.inspectionTime}}, {{site.reportDueDate}}
 * - {{site.lidarJobStatus}}, {{site.lidarScheduledStatus}}
 * - {{site.assignedDRI}}
 * - {{vendor.name}}, {{vendor.contactName}}, {{vendor.contactEmail}}
 * - {{email.from}}, {{email.subject}}, {{email.bodyPreview}}
 * - {{reminderCount}}, {{daysSinceTrigger}}, {{businessDaysSince}}
 */

export interface EmailTemplate {
  id: string;
  name: string;
  tier: 1 | 2;
  subject: string;
  body: string;
  defaultTo?: string;
  defaultCc?: string[];
  category: "outbound" | "inbound_response" | "internal" | "follow_up";
}

// ── Existing Templates (migrated from legacy crons) ──

export const E01_SCHEDULING_REMINDER: EmailTemplate = {
  id: "e01_scheduling_reminder",
  name: "Scheduling Reminder",
  tier: 1,
  category: "follow_up",
  subject: "Scheduling Reminder: {{site.address}} (Reminder #{{reminderCount}})",
  defaultCc: ["auth.permitting@trilogy.com"],
  body: `
    <p>Hello {{site.responsiblePartyName}},</p>
    <p>This is a friendly reminder that scheduling is still incomplete for <strong>{{site.address}}</strong>.</p>
    <p>It has been <strong>{{businessDaysSince}} business days</strong> since this site was triggered.</p>
    <ul>
      <li>LiDAR Scheduled: {{site.lidarScheduledStatus}}</li>
      <li>Building Inspection Scheduled: {{site.inspectionScheduledStatus}}</li>
    </ul>
    <p>Could you please give this your attention and schedule the outstanding items as soon as possible?</p>
    <p>Thank you,<br>EDU Ops Team</p>
  `.trim(),
};

export const E02_LIDAR_COMPLETION_REMINDER: EmailTemplate = {
  id: "e02_lidar_completion_reminder",
  name: "LiDAR Completion Reminder",
  tier: 1,
  category: "follow_up",
  subject: "LiDAR Completion Reminder: {{site.address}}",
  defaultCc: ["auth.permitting@trilogy.com"],
  body: `
    <p>Hello {{site.responsiblePartyName}},</p>
    <p>This is a reminder that the LiDAR scan for <strong>{{site.address}}</strong> has not yet been completed.</p>
    <p>Job Status: <strong>{{site.lidarJobStatus}}</strong></p>
    <p>Please follow up to ensure the LiDAR scan is completed as soon as possible.</p>
    <p>Thank you,<br>EDU Ops Team</p>
  `.trim(),
};

export const E03_INSPECTION_REPORT_REMINDER: EmailTemplate = {
  id: "e03_inspection_report_reminder",
  name: "Inspection Report Reminder",
  tier: 1,
  category: "follow_up",
  subject: "Inspection Report Reminder: {{site.address}} (Reminder #{{reminderCount}})",
  defaultTo: "alpha@worksmith.com",
  defaultCc: ["auth.permitting@trilogy.com"],
  body: `
    <p>Hello {{site.inspectionContactName}},</p>
    <p>This is a polite reminder that the Building Inspection report for <strong>{{site.address}}</strong> is past due and has not yet been received.</p>
    {{#if site.reportDueDate}}<p>Due Date: <strong>{{site.reportDueDate}}</strong></p>{{/if}}
    <p>Could you let us know the expected delivery date?</p>
    <p>Thank you,<br>EDU Ops Team</p>
  `.trim(),
};

// ── New Templates from Team Review ──

export const T01_LANDLORD_QUESTIONNAIRE: EmailTemplate = {
  id: "t01_landlord_questionnaire",
  name: "Landlord/Owner Questionnaire Follow-up",
  tier: 1,
  category: "outbound",
  subject: "{{site.address}} — Introduction & Checklist",
  defaultCc: ["edu.ops@trilogy.com"],
  body: `
    <p>Hello {{site.responsiblePartyName}},</p>
    <p>I'm reaching out from the EDU Ops team. We're excited to be moving forward with the space at <strong>{{site.address}}</strong>.</p>
    <p>Thank you for your attention to getting the Matterport 3D scan and Building Inspection scheduled. In the meantime, it would be a big help if you (or the property manager/owner) could answer a few quick due-diligence questions:</p>
    <ol>
      <li>Do you have shell drawings or any as-built plans of the existing space?</li>
      <li>Are there any Landlord Signage/Design Guidelines?</li>
      <li>Are there any Landlord Construction Rules and Regulations?</li>
      <li>Are there any Landlord Required Subcontractors (Roofing, Sprinkler, Alarm, etc.)?</li>
      <li>What is the Landlord entity name that should be listed as additionally insured on the contractor's insurance?</li>
      <li>Will we need to move utilities into our name, or is everything sub-metered? Please provide any prior utility bills for utilities that need to be put into our name, if possible.</li>
    </ol>
    <p>If you are not the best person to answer these, please feel free to relay to the property owner or manager.</p>
    <p>Thank you,<br>EDU Ops Team</p>
  `.trim(),
};

export const T02_VENDOR_FOLLOWUP_NONCRITICAL: EmailTemplate = {
  id: "t02_vendor_followup_noncritical",
  name: "Vendor Follow-up — Non-Critical",
  tier: 1,
  category: "follow_up",
  subject: "Re: {{email.subject}}",
  body: `
    <p>Hello {{vendor.contactName}},</p>
    <p>I wanted to follow up on our previous correspondence regarding <strong>{{site.address}}</strong>. We haven't received an update yet and wanted to check on the status.</p>
    <p>Could you please provide an update at your earliest convenience?</p>
    <p>Thank you,<br>EDU Ops Team</p>
  `.trim(),
};

export const T03_VENDOR_FOLLOWUP_ESCALATED: EmailTemplate = {
  id: "t03_vendor_followup_escalated",
  name: "Vendor Follow-up — Escalated",
  tier: 2,
  category: "follow_up",
  subject: "Re: {{email.subject}} — Follow-up Required",
  body: `
    <p>Hello {{vendor.contactName}},</p>
    <p>We are following up again regarding <strong>{{site.address}}</strong>. It has been {{businessDaysSince}} business days since our last outreach and we have not yet received a response.</p>
    <p>This item is becoming urgent and we need an update as soon as possible. If there are any blockers, please let us know so we can work together to resolve them.</p>
    <p>Thank you,<br>EDU Ops Team</p>
  `.trim(),
};

export const T04_DOCUMENT_REQUEST: EmailTemplate = {
  id: "t04_document_request",
  name: "Document Request to Landlord/Broker",
  tier: 2,
  category: "outbound",
  subject: "Document Request: {{site.address}}",
  defaultCc: ["auth.permitting@trilogy.com"],
  body: `
    <p>Hello {{site.responsiblePartyName}},</p>
    <p>As part of our due diligence for <strong>{{site.address}}</strong>, we need the following documents:</p>
    <p>{{requestedDocuments}}</p>
    <p>Please provide these at your earliest convenience. If you have any questions about what is needed, don't hesitate to reach out.</p>
    <p>Thank you,<br>EDU Ops Team</p>
  `.trim(),
};

export const T05_INSPECTION_REPORT_NO_RED_FLAGS: EmailTemplate = {
  id: "t05_inspection_report_clean",
  name: "Inspection Report Received — No Red Flags",
  tier: 1,
  category: "internal",
  subject: "Inspection Report Received: {{site.address}} — No Red Flags",
  body: `
    <p>The Building Inspection report for <strong>{{site.address}}</strong> has been received and reviewed. No red flags were identified.</p>
    <p>The report and any photos have been saved to the site's Google Drive folder.</p>
    {{#if site.reportLink}}<p>Report Link: <a href="{{site.reportLink}}">{{site.reportLink}}</a></p>{{/if}}
    <p>EDU Ops Team</p>
  `.trim(),
};

// ── Inbound Response Templates ──

export const T06_TAX_EXEMPT: EmailTemplate = {
  id: "t06_tax_exempt",
  name: "Tax Exempt Question Response",
  tier: 1,
  category: "inbound_response",
  subject: "Re: {{email.subject}}",
  body: `
    <p>Hello,</p>
    <p>Thank you for reaching out. To confirm, Alpha is <strong>not tax exempt</strong>.</p>
    <p>Please let us know if you have any other questions.</p>
    <p>Thank you,<br>EDU Ops Team</p>
  `.trim(),
};

export const T07_ENTITY_NAME: EmailTemplate = {
  id: "t07_entity_name",
  name: "Entity Name Confirmation",
  tier: 1,
  category: "inbound_response",
  subject: "Re: {{email.subject}}",
  body: `
    <p>Hello,</p>
    <p>The entity name is: <strong>Alpha School {{site.zipCode}}, LLC</strong></p>
    <p>Please note there is no 's' — it is "Alpha School" not "Alpha Schools."</p>
    <p>Let us know if you need anything else.</p>
    <p>Thank you,<br>EDU Ops Team</p>
  `.trim(),
};

export const T08_HOLDING_RESPONSE: EmailTemplate = {
  id: "t08_holding_response",
  name: "Holding Response — Needs Review",
  tier: 1,
  category: "inbound_response",
  subject: "Re: {{email.subject}}",
  body: `
    <p>Hello,</p>
    <p>We received your message and our team will review and follow up shortly.</p>
    <p>Thank you,<br>EDU Ops Team</p>
  `.trim(),
};

// ── Gap Templates (from Section 3 review) ──

export const G05_INVOICE_NO_APPROVAL: EmailTemplate = {
  id: "g05_invoice_no_approval",
  name: "Invoice Received Without Prior Approval",
  tier: 2,
  category: "inbound_response",
  subject: "Re: {{email.subject}}",
  body: `
    <p>Hello,</p>
    <p>Thank you for sending this invoice. Our team needs to review this before processing. We'll follow up shortly.</p>
    <p>Thank you,<br>EDU Ops Team</p>
  `.trim(),
};

// ── Template Registry ──

export const ALL_TEMPLATES: EmailTemplate[] = [
  E01_SCHEDULING_REMINDER,
  E02_LIDAR_COMPLETION_REMINDER,
  E03_INSPECTION_REPORT_REMINDER,
  T01_LANDLORD_QUESTIONNAIRE,
  T02_VENDOR_FOLLOWUP_NONCRITICAL,
  T03_VENDOR_FOLLOWUP_ESCALATED,
  T04_DOCUMENT_REQUEST,
  T05_INSPECTION_REPORT_NO_RED_FLAGS,
  T06_TAX_EXEMPT,
  T07_ENTITY_NAME,
  T08_HOLDING_RESPONSE,
  G05_INVOICE_NO_APPROVAL,
];

export function getTemplateById(id: string): EmailTemplate | undefined {
  return ALL_TEMPLATES.find((t) => t.id === id);
}
