import { format } from "date-fns";
import { Doc } from "../_generated/dataModel";

type Site = Doc<"sites">;

export function schedulingReminderChat(site: Site, daysSinceTrigger: number): string {
  return [
    `*Scheduling Reminder - ${site.siteAddress}*`,
    "",
    `It has been *${daysSinceTrigger} business days* since this site was triggered and scheduling is still incomplete:`,
    `- LiDAR Scheduled: ${site.lidarScheduled ? "Yes" : "No"}`,
    `- Building Inspection Scheduled: ${site.inspectionScheduled ? "Yes" : "No"}`,
    "",
    `Responsible Party: ${site.responsiblePartyName ?? "N/A"} (${site.responsiblePartyEmail})`,
    `Reminder #${site.schedulingReminderCount + 1}`,
  ].join("\n");
}

export function bothScheduledChat(site: Site): string {
  return [
    `*Both Scheduled - ${site.siteAddress}*`,
    "",
    "LiDAR and Building Inspection have both been scheduled:",
    `- LiDAR: ${site.lidarScheduledDatetime ? format(new Date(site.lidarScheduledDatetime), "MMM d, yyyy h:mm a") : "Scheduled (date TBD)"}`,
    `- Inspection: ${site.inspectionDate ?? "Date TBD"}${site.inspectionTime ? ` at ${site.inspectionTime}` : ""}`,
    "",
    "Moving to completion monitoring phase.",
  ].join("\n");
}

export function lidarCompleteChat(site: Site): string {
  return [
    `*LiDAR Scan Complete - ${site.siteAddress}*`,
    "",
    "The LiDAR scan has been completed.",
    `Job Status: ${site.lidarJobStatus ?? "Complete"}`,
    "",
    "Waiting for Building Inspection report.",
  ].join("\n");
}

export function reportReminderChat(site: Site): string {
  return [
    `*Report Reminder - ${site.siteAddress}*`,
    "",
    "The Building Inspection report has not yet been received.",
    site.reportDueDate ? `Due Date: ${site.reportDueDate}` : "",
    `Reminder #${site.reportReminderCount + 1}`,
    "",
    `Responsible Party: ${site.responsiblePartyName ?? "N/A"} (${site.responsiblePartyEmail})`,
  ].filter(Boolean).join("\n");
}

export function reportReceivedChat(site: Site, reportLink?: string): string {
  const link = reportLink ?? site.reportLink;
  return [
    `*Report Received - ${site.siteAddress}*`,
    "",
    "The Building Inspection report has been received.",
    link ? `Report Link: ${link}` : "",
    "",
    "This site is now fully resolved.",
  ].filter(Boolean).join("\n");
}

export function siteResolvedChat(site: Site): string {
  return [
    `*Site Resolved - ${site.siteAddress}*`,
    "",
    "All items complete:",
    "- LiDAR: Complete",
    "- Building Inspection: Complete",
    `- Report: Received${site.reportLink ? ` (${site.reportLink})` : ""}`,
  ].join("\n");
}

export function llmResponseSentChat(site: Site, recipientEmail: string, responseSummary: string): string {
  return [
    `*Auto-Reply Sent - ${site.siteAddress}*`,
    "",
    `To: ${recipientEmail}`,
    `Response: ${responseSummary}`,
  ].join("\n");
}

export function schedulingReminderEmail(
  site: Site,
  daysSinceTrigger: number
): { subject: string; html: string; cc: string } {
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
    cc: "edu.ops@trilogy.com",
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
