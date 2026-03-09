export type SitePhase = "scheduling" | "completion" | "resolved";

export type AuditLevel = "info" | "warn" | "error";

export interface AttachmentInfo {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface ParsedEmail {
  messageId: string;
  threadId?: string;
  gmailMessageId?: string;    // RFC 2822 Message-ID header
  inReplyTo?: string;
  references?: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  date: Date;
  attachments: AttachmentInfo[];
}

export interface ReplyIntent {
  type: "scheduling_update" | "completion_update" | "attachment_only" | "informational" | "unknown";
  extractedDate?: string;
  extractedStatus?: string;
  hasAttachments: boolean;
  summary: string;
}

export interface ExtractedSiteInfo {
  address: string;
  responsiblePartyEmail: string;
  responsiblePartyName: string;
}

export interface AirtableRow {
  address: string;
  scheduledDate?: string;
  scheduledTime?: string;
  jobStatus?: string;
  dataAsOf?: string;
  notes?: string;
}

export interface InspectionRow {
  address: string;
  inspectionDate?: string;
  inspectionTime?: string;
  reportDueDate?: string;
  reportReceived?: boolean;
  reportLink?: string;
}

export interface CronResult {
  success: boolean;
  processed: number;
  errors: string[];
}
