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
  modelUrl?: string;
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

// ── Email Agent Types ──

export type ClassificationType =
  | "vendor_scheduling"
  | "vendor_completion"
  | "vendor_question"
  | "vendor_invoice"
  | "government_permit"
  | "government_zoning"
  | "inspection_report"
  | "internal_fyi"
  | "internal_action_needed"
  | "auto_reply"
  | "unknown";

export type ClassificationMethod = "rule" | "llm";

export type EmailThreadState =
  | "active"
  | "waiting_vendor"
  | "waiting_human"
  | "escalated"
  | "resolved"
  | "archived";

export type ClassificationStatus =
  | "classified"
  | "action_pending"
  | "action_taken"
  | "escalated"
  | "archived";

export type DraftStatus =
  | "pending"
  | "approved"
  | "edited"
  | "saved"
  | "rejected"
  | "auto_sent"
  | "expired";

export type GateMode = "supervised" | "graduated" | "autonomous";

export type VendorCategory =
  | "lidar"
  | "inspection"
  | "permitting"
  | "zoning"
  | "construction"
  | "it_cabling"
  | "architecture"
  | "legal"
  | "insurance"
  | "other";

export type JurisdictionType = "city" | "county" | "state" | "federal";

export type ReviewerRole = "admin" | "reviewer";

export interface ExtractedEntities {
  siteAddress?: string;
  vendorName?: string;
  dates?: string[];
  permitNumber?: string;
  attachmentTypes?: string[];
}

export interface ClassificationResult {
  classificationType: ClassificationType;
  classificationMethod: ClassificationMethod;
  confidence: number;
  extractedEntities: ExtractedEntities;
}

export interface ContextResolution {
  matchedSiteIds: string[];
  matchedVendorId?: string;
  extractedEntities: ExtractedEntities;
}
