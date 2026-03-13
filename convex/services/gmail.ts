"use node";

import { google, gmail_v1 } from "googleapis";
import { logger } from "../lib/logger";
import type { ParsedEmail, AttachmentInfo } from "../lib/types";

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function getClient(): gmail_v1.Gmail {
  const auth = new google.auth.OAuth2(
    getEnv("GMAIL_CLIENT_ID"),
    getEnv("GMAIL_CLIENT_SECRET")
  );
  auth.setCredentials({ refresh_token: getEnv("GMAIL_REFRESH_TOKEN") });
  return google.gmail({ version: "v1", auth });
}

export async function listMessages(query: string, maxResults = 10): Promise<gmail_v1.Schema$Message[]> {
  const gmail = getClient();
  const res = await gmail.users.messages.list({ userId: "me", q: query, maxResults });
  return res.data.messages ?? [];
}

export async function getMessage(messageId: string): Promise<gmail_v1.Schema$Message> {
  const gmail = getClient();
  const res = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
  return res.data;
}

function extractAttachments(parts: gmail_v1.Schema$MessagePart[]): AttachmentInfo[] {
  const attachments: AttachmentInfo[] = [];
  for (const part of parts) {
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        attachmentId: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType ?? "application/octet-stream",
        size: part.body.size ?? 0,
      });
    }
    // Recurse into nested parts (multipart messages)
    if (part.parts) {
      attachments.push(...extractAttachments(part.parts));
    }
  }
  return attachments;
}

export function parseGmailMessage(message: gmail_v1.Schema$Message): ParsedEmail {
  const headers = message.payload?.headers ?? [];
  const getHeader = (name: string): string =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

  const from = getHeader("From");
  const to = getHeader("To").split(",").map((s) => s.trim()).filter(Boolean);
  const cc = getHeader("Cc").split(",").map((s) => s.trim()).filter(Boolean);
  const subject = getHeader("Subject");
  const dateStr = getHeader("Date");

  let body = "";
  const parts = message.payload?.parts ?? [];
  if (parts.length > 0) {
    const textPart = parts.find((p) => p.mimeType === "text/plain");
    if (textPart?.body?.data) {
      body = Buffer.from(textPart.body.data, "base64url").toString("utf-8");
    }
  } else if (message.payload?.body?.data) {
    body = Buffer.from(message.payload.body.data, "base64url").toString("utf-8");
  }

  const attachments = extractAttachments(parts);

  return {
    messageId: message.id ?? "",
    threadId: message.threadId ?? undefined,
    gmailMessageId: getHeader("Message-ID") || undefined,
    inReplyTo: getHeader("In-Reply-To") || undefined,
    references: getHeader("References") || undefined,
    from,
    to,
    cc,
    subject,
    body,
    date: dateStr ? new Date(dateStr) : new Date(),
    attachments,
  };
}

export async function markAsRead(messageId: string): Promise<void> {
  const gmail = getClient();
  await gmail.users.messages.modify({ userId: "me", id: messageId, requestBody: { removeLabelIds: ["UNREAD"] } });
}

export async function removeLabel(messageId: string, labelId: string): Promise<void> {
  const gmail = getClient();
  await gmail.users.messages.modify({ userId: "me", id: messageId, requestBody: { removeLabelIds: [labelId] } });
}

/**
 * Find a Gmail label ID by name. Returns null if not found.
 */
export async function getLabelId(labelName: string): Promise<string | null> {
  const gmail = getClient();
  const res = await gmail.users.labels.list({ userId: "me" });
  const label = (res.data.labels ?? []).find(
    (l) => l.name?.toLowerCase() === labelName.toLowerCase()
  );
  return label?.id ?? null;
}

export interface ThreadingOptions {
  threadId?: string;
  inReplyTo?: string;
  references?: string;
}

/**
 * Build the raw MIME message string (before base64 encoding).
 * Exported for testing.
 */
export function buildMimeMessage(
  from: string,
  to: string,
  subject: string,
  htmlBody: string,
  cc?: string,
  threading?: ThreadingOptions
): { mimeText: string; effectiveSubject: string } {
  // Prefix subject with Re: for threaded replies if not already present
  const effectiveSubject = threading?.inReplyTo && !subject.startsWith("Re: ")
    ? `Re: ${subject}`
    : subject;

  const messageParts = [
    `From: ${from}`, `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    `Subject: ${effectiveSubject}`,
    ...(threading?.inReplyTo ? [`In-Reply-To: ${threading.inReplyTo}`] : []),
    ...(threading?.references ? [`References: ${threading.references}`] : []),
    "Content-Type: text/html; charset=utf-8", "", htmlBody,
  ];

  return { mimeText: messageParts.join("\r\n"), effectiveSubject };
}

export async function sendEmail(
  to: string,
  subject: string,
  htmlBody: string,
  cc?: string,
  threading?: ThreadingOptions
): Promise<void> {
  // TEMPORARY: All outbound email disabled during reply system redevelopment
  console.log(`[EMAIL DISABLED] Would have sent to: ${to}, subject: ${subject}`);
  return;

  const gmail = getClient();
  const sendAs = process.env.GMAIL_SEND_AS ?? "auth.permitting@trilogy.com";

  const { mimeText, effectiveSubject } = buildMimeMessage(sendAs, to, subject, htmlBody, cc, threading);
  const rawMessage = Buffer.from(mimeText).toString("base64url");

  const requestBody: { raw: string; threadId?: string } = { raw: rawMessage };
  if (threading?.threadId) {
    requestBody.threadId = threading.threadId;
  }

  await gmail.users.messages.send({ userId: "me", requestBody });
  logger.info("Email sent", { to, subject: effectiveSubject, threaded: !!threading?.threadId });
}

export async function listThreadMessages(threadId: string): Promise<gmail_v1.Schema$Message[]> {
  const gmail = getClient();
  const res = await gmail.users.threads.get({ userId: "me", id: threadId, format: "full" });
  return res.data.messages ?? [];
}

export async function getAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
  const gmail = getClient();
  const res = await gmail.users.messages.attachments.get({
    userId: "me", messageId, id: attachmentId,
  });
  return Buffer.from(res.data.data!, "base64url");
}

export async function verifyToken(): Promise<boolean> {
  try {
    const gmail = getClient();
    await gmail.users.getProfile({ userId: "me" });
    return true;
  } catch (error) {
    logger.error("Gmail token verification failed", { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}
