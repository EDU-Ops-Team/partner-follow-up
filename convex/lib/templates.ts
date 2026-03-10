import { format } from "date-fns";
import { Doc } from "../_generated/dataModel";

type Site = Doc<"sites">;

// ── Chat Templates ──

export function schedulingReminderChat(site: Site, daysSinceTrigger: number): string {
  return [
    `*Scheduling Reminder — ${site.siteAddress}*`,
    "",
    `It has been *${daysSinceTrigger} business days* since this site was triggered and scheduling is still incomplete:`,
    `• LiDAR Scheduled: ${site.lidarScheduled ? "Yes" : "No"}`,
    `• Building Inspection Scheduled: ${site.inspectionScheduled ? "Yes" : "No"}`,
    "",
    `Responsible Party: ${site.responsiblePartyName ?? "N/A"} (${site.responsiblePartyEmail})`,
    `Reminder #${site.schedulingReminderCount + 1}`,
  ].join("\n");
}

export function bothScheduledChat(site: Site): string {
  return [
    `*Both Scheduled — ${site.siteAddress}*`,
    "",
    `LiDAR and Building Inspection have both been scheduled:`,
    `• LiDAR: ${site.lidarScheduledDatetime ? format(new Date(site.lidarScheduledDatetime), "MMM d, yyyy h:mm a") : "Scheduled (date TBD)"}`,
    `• Inspection: ${site.inspectionDate ?? "Date TBD"}${site.inspectionTime ? ` at ${site.inspectionTime}` : ""}`,
    "",
    `Moving to completion monitoring phase.`,
  ].join("\n");
}

export function lidarCompleteChat(site: Site): string {
  return [
    `*LiDAR Scan Complete — ${site.siteAddress}*`,
    "",
    `The LiDAR scan has been completed.`,
    `Job Status: ${site.lidarJobStatus ?? "Complete"}`,
    "",
    `Waiting for Building Inspection report.`,
  ].join("\n");
}

export function reportReminderChat(site: Site): string {
  return [
    `*Report Reminder — ${site.siteAddress}*`,
    "",
    `The Building Inspection report has not yet been received.`,
    site.reportDueDate ? `Due Date: ${site.reportDueDate}` : "",
    `Reminder #${site.reportReminderCount + 1}`,
    "",
    `Responsible Party: ${site.responsiblePartyName ?? "N/A"} (${site.responsiblePartyEmail})`,
  ].filter(Boolean).join("\n");
}

export function reportReceivedChat(site: Site, reportLink?: string): string {
  const link = reportLink ?? site.reportLink;
  return [
    `*Report Received — ${site.siteAddress}*`,
    "",
    `The Building Inspection report has been received.`,
    link ? `Report Link: ${link}` : "",
    "",
    `This site is now fully resolved.`,
  ].filter(Boolean).join("\n");
}

export function siteResolvedChat(site: Site): string {
  return [
    `*Site Resolved — ${site.siteAddress}*`,
    "",
    `All items complete:`,
    `• LiDAR: Complete`,
    `• Building Inspection: Complete`,
    `• Report: Received${site.reportLink ? ` (${site.reportLink})` : ""}`,
  ].join("\n");
}

export function importMissingResponsiblePartyChat(
  address: string,
  subject: string,
  messageId: string
): string {
  return [
    `*⚠ Import Issue — Missing Responsible Party*`,
    "",
    `An email labeled \`vendor-import\` was found but no responsible party could be determined:`,
    `• Address: ${address}`,
    `• Subject: ${subject}`,
    `• Message ID: ${messageId}`,
    "",
    `Please assign a responsible party manually via the dashboard or re-forward the email with the vendor in To/Cc.`,
  ].join("\n");
}

export function importNoAddressChat(subject: string, messageId: string): string {
  return [
    `*⚠ Import Issue — No Address Found*`,
    "",
    `An email labeled \`vendor-import\` could not be imported — no site address was found:`,
    `• Subject: ${subject}`,
    `• Message ID: ${messageId}`,
  ].join("\n");
}

export function importSiteCreatedChat(address: string, responsibleParty: string, source: string): string {
  return [
    `*Site Imported — ${address}*`,
    "",
    `A new site has been created from a labeled email:`,
    `• Responsible Party: ${responsibleParty}`,
    `• Source: ${source}`,
  ].join("\n");
}

export function replyReceivedChat(site: Site, senderEmail: string, summary: string): string {
  return [
    `*Reply Received — ${site.siteAddress}*`,
    "",
    `From: ${senderEmail}`,
    `Summary: ${summary}`,
  ].join("\n");
}

export function attachmentSavedChat(site: Site, filename: string, driveLink: string): string {
  return [
    `*Attachment Saved — ${site.siteAddress}*`,
    "",
    `File: ${filename}`,
    driveLink ? `Link: ${driveLink}` : "",
  ].filter(Boolean).join("\n");
}

export function statusUpdatedFromReplyChat(site: Site, field: string, newValue: string): string {
  return [
    `*Status Updated from Reply — ${site.siteAddress}*`,
    "",
    `${field}: ${newValue}`,
  ].join("\n");
}

export function llmResponseSentChat(site: Site, recipientEmail: string, responseSummary: string): string {
  return [
    `*Auto-Reply Sent — ${site.siteAddress}*`,
    "",
    `To: ${recipientEmail}`,
    `Response: ${responseSummary}`,
  ].join("\n");
}

export function llmNeedsReviewChat(site: Site, senderEmail: string, vendorBody: string): string {
  return [
    `*⚠ Needs Human Review — ${site.siteAddress}*`,
    "",
    `A vendor reply could not be confidently answered by the agent:`,
    `• From: ${senderEmail}`,
    `• Message: ${vendorBody.length > 300 ? vendorBody.slice(0, 297) + "..." : vendorBody}`,
    "",
    `A holding response has been sent. Please review and follow up manually.`,
  ].join("\n");
}

export function holdingResponseSentChat(site: Site, senderEmail: string): string {
  return [
    `*Holding Response Sent — ${site.siteAddress}*`,
    "",
    `A holding response was sent to ${senderEmail} while the team reviews their message.`,
  ].join("\n");
}

// ── Email Templates ──

export function schedulingReminderEmail(
  site: Site,
  daysSinceTrigger: number
): { subject: string; html: string } {
  return {
    subject: `Scheduling Reminder: ${site.siteAddress} (Reminder #${site.schedulingReminderCount + 1})`,
    html: `
      <p>Hello ${site.responsiblePartyName || ""},</p>
      <p>This is a reminder that scheduling is still incomplete for <strong>${site.siteAddress}</strong>.</p>
      <p>It has been <strong>${daysSinceTrigger} business days</strong> since this site was triggered.</p>
      <ul>
        <li>LiDAR Scheduled: ${site.lidarScheduled ? "Yes" : "<strong>No</strong>"}</li>
        <li>Building Inspection Scheduled: ${site.inspectionScheduled ? "Yes" : "<strong>No</strong>"}</li>
      </ul>
      <p>Please schedule the outstanding items as soon as possible.</p>
      <p>Thank you,<br>EDU Ops Team</p>
    `.trim(),
  };
}

export function lidarCompletionReminderEmail(site: Site): { subject: string; html: string } {
  return {
    subject: `LiDAR Completion Reminder: ${site.siteAddress}`,
    html: `
      <p>Hello ${site.responsiblePartyName || ""},</p>
      <p>This is a reminder that the LiDAR scan for <strong>${site.siteAddress}</strong> has not yet been completed.</p>
      <p>Job Status: <strong>${site.lidarJobStatus ?? "Pending"}</strong></p>
      <p>Please follow up to ensure the LiDAR scan is completed as soon as possible.</p>
      <p>Thank you,<br>EDU Ops Team</p>
    `.trim(),
  };
}

export function inspectionReportReminderEmail(site: Site): { subject: string; html: string } {
  const contactName = site.inspectionContactName || "Steve";
  return {
    subject: `Inspection Report Reminder: ${site.siteAddress} (Reminder #${site.reportReminderCount + 1})`,
    html: `
      <p>Hello ${contactName},</p>
      <p>This is a reminder that the Building Inspection report for <strong>${site.siteAddress}</strong> is past due and has not yet been received.</p>
      ${site.reportDueDate ? `<p>Due Date: <strong>${site.reportDueDate}</strong></p>` : ""}
      <p>Please provide the report as soon as possible.</p>
      <p>Thank you,<br>EDU Ops Team</p>
    `.trim(),
  };
}

export function reportReminderEmail(site: Site): { subject: string; html: string } {
  return {
    subject: `Report Reminder: ${site.siteAddress} (Reminder #${site.reportReminderCount + 1})`,
    html: `
      <p>Hello ${site.responsiblePartyName || ""},</p>
      <p>This is a reminder that the Building Inspection report for <strong>${site.siteAddress}</strong> has not yet been received.</p>
      ${site.reportDueDate ? `<p>Due Date: <strong>${site.reportDueDate}</strong></p>` : ""}
      <p>Please provide the report as soon as possible.</p>
      <p>Thank you,<br>EDU Ops Team</p>
    `.trim(),
  };
}
