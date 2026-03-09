export type SitePhase = "scheduling" | "completion" | "resolved";

export type AuditLevel = "info" | "warn" | "error";

export interface ParsedEmail {
  messageId: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  date: Date;
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
