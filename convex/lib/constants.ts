/** Email sender that triggers new site monitoring */
export const TRIGGER_EMAIL_SENDER = "zack.lamb@2hourlearning.com";

/** Gmail query for trigger emails */
export const GMAIL_QUERY = `from:${TRIGGER_EMAIL_SENDER} is:unread`;

/** Gmail label for manual import */
export const IMPORT_LABEL_NAME = "vendor-import";
export const IMPORT_GMAIL_QUERY = `label:vendor-import`;

/** Business days between scheduling check reminders */
export const SCHEDULING_CHECK_INTERVAL_DAYS = 2;

/** Business days between report follow-up reminders */
export const REPORT_REMINDER_INTERVAL_DAYS = 2;

/** Max reminders before escalation */
export const MAX_SCHEDULING_REMINDERS = 10;
export const MAX_REPORT_REMINDERS = 10;

/** Address matching threshold (0-1, Levenshtein similarity) */
export const ADDRESS_MATCH_THRESHOLD = 0.85;

/** Retry config */
export const MAX_RETRIES = 3;
export const RETRY_BASE_DELAY_MS = 1000;

/** Google Drive parent folder for site attachments */
export const GOOGLE_DRIVE_PARENT_FOLDER_ID = "1RqwLyx0duTeWQPJWu7-HOpfQNlbe5jzQ";

/** Inspection report contact (Steve Hehl at Worksmith) */
export const INSPECTION_CONTACT_EMAIL = "shehl@worksmith.com";
export const INSPECTION_CONTACT_NAME = "Steve Hehl";
