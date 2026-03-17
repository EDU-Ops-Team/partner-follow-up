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

// ── Email Agent Constants ──

/** Agent email address */
export const AGENT_EMAIL = "edu.ops@trilogy.com";

/** Gmail query for agent inbound */
export const AGENT_GMAIL_QUERY = "is:unread";

/** Agent email signature */
export const AGENT_SIGNATURE = "EDU Ops Team";

/** Classification confidence threshold for rule-based (above this = no LLM needed) */
export const CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.9;

/** Internal email domains (classified as internal, not processed for replies) */
export const INTERNAL_DOMAINS = ["trilogy.com", "2hourlearning.com", "alpha.school"];

/** Automated sender domains/addresses to skip entirely (never classify) */
export const SKIP_SENDERS = [
  // Google Workspace notifications
  "noreply@google.com",
  "calendar-notification@google.com",
  "comments-noreply@docs.google.com",
  "drive-shares-dm-noreply@google.com",
  "drive-shares-noreply@google.com",
  "no-reply@accounts.google.com",
  // Other automated systems
  "noreply@",
  "no-reply@",
  "mailer-daemon@",
  "postmaster@",
  "notifications@",
  "notify@",
  "donotreply@",
  "do-not-reply@",
];

/** Subject patterns that indicate automated/system emails */
export const SKIP_SUBJECT_PATTERNS = [
  /you've been (invited|granted) .* (document|file|folder|spreadsheet|form)/i,
  /shared .* with you/i,
  /new comment on/i,
  /suggested edit/i,
  /action items from/i,
  /invitation:.*@/i,
  /accepted:.*@/i,
  /declined:.*@/i,
  /updated invitation/i,
  /canceled event/i,
];

/** Gate mechanism thresholds */
export const GATE_PASS_THRESHOLD = 0.98;
export const GATE_GRADUATION_PASS_RATE = 0.95;
export const GATE_MIN_REVIEWS = 20;
export const GATE_ROLLING_WINDOW_DAYS = 30;
export const GATE_REGRESSION_THRESHOLD = 0.90;
export const GATE_SAMPLING_RATE = 0.2;

/** Follow-up SLA (business days) */
export const FOLLOWUP_INTERVAL_DAYS = 2;

/** Max messages to fetch per classification poll */
export const AGENT_POLL_BATCH_SIZE = 50;

/** Body preview length for classifications */
export const BODY_PREVIEW_LENGTH = 500;
