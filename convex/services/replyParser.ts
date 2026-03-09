import type { AttachmentInfo, ReplyIntent } from "../lib/types";

/**
 * Strips quoted text from an email reply body.
 * Removes lines after "On ... wrote:" markers and lines starting with ">".
 */
function stripQuotedText(body: string): string {
  const lines = body.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    // Stop at "On <date> <person> wrote:" quote markers
    if (/^On .+ wrote:\s*$/i.test(line.trim())) break;
    // Stop at "---------- Forwarded message ----------" markers
    if (/^-{3,}\s*(Forwarded|Original)\s+message/i.test(line.trim())) break;
    // Skip quoted lines
    if (line.trim().startsWith(">")) continue;
    result.push(line);
  }

  return result.join("\n").trim();
}

// Date patterns: "March 15", "3/15/2026", "3-15-26", "Mar 15, 2026"
const DATE_PATTERNS = [
  /(?:scheduled\s+(?:for|on)\s+)(.+?)(?:\.|,|\s*$)/i,
  /(?:date\s*(?:is|:)\s*)(.+?)(?:\.|,|\s*$)/i,
  /(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/,
  /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}(?:,?\s*\d{4})?)/i,
];

const SCHEDULING_KEYWORDS = [
  "scheduled", "booked", "confirmed", "set up", "arranged",
  "appointment", "reserved", "will be there",
];

const COMPLETION_KEYWORDS = [
  "complete", "completed", "done", "finished", "delivered",
  "wrapped up", "all done", "taken care of",
];

/**
 * Parses an email reply body to determine the sender's intent.
 */
export function parseReplyIntent(
  body: string,
  attachments: AttachmentInfo[]
): ReplyIntent {
  const cleanBody = stripQuotedText(body);
  const lower = cleanBody.toLowerCase();
  const hasAttachments = attachments.length > 0;

  // Try to extract a date
  let extractedDate: string | undefined;
  for (const pattern of DATE_PATTERNS) {
    const match = lower.match(pattern);
    if (match?.[1]) {
      extractedDate = match[1].trim();
      break;
    }
  }

  // Check for scheduling keywords
  const hasSchedulingKeyword = SCHEDULING_KEYWORDS.some((kw) => lower.includes(kw));

  // Check for completion keywords
  const hasCompletionKeyword = COMPLETION_KEYWORDS.some((kw) => lower.includes(kw));

  // Determine intent type
  if (hasCompletionKeyword) {
    return {
      type: "completion_update",
      extractedStatus: "complete",
      hasAttachments,
      summary: truncate(cleanBody, 200),
    };
  }

  if (hasSchedulingKeyword || extractedDate) {
    return {
      type: "scheduling_update",
      extractedDate,
      extractedStatus: "scheduled",
      hasAttachments,
      summary: truncate(cleanBody, 200),
    };
  }

  if (hasAttachments && cleanBody.length < 50) {
    // Short message with attachments — likely just sending docs
    return {
      type: "attachment_only",
      hasAttachments: true,
      summary: cleanBody || "Attachment(s) received",
    };
  }

  // Check if the message has any substantive content
  if (cleanBody.length < 10) {
    return {
      type: "unknown",
      hasAttachments,
      summary: cleanBody || "(empty reply)",
    };
  }

  return {
    type: "informational",
    hasAttachments,
    summary: truncate(cleanBody, 200),
  };
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

export { stripQuotedText };
