"use node";

import { google, gmail_v1 } from "googleapis";
import { logger } from "../lib/logger";
import { parseGmailMessage } from "./gmail";

// Re-export parseGmailMessage for convenience
export { parseGmailMessage };

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function getClient(): gmail_v1.Gmail {
  const auth = new google.auth.OAuth2(
    getEnv("AGENT_GMAIL_CLIENT_ID"),
    getEnv("AGENT_GMAIL_CLIENT_SECRET")
  );
  auth.setCredentials({ refresh_token: getEnv("AGENT_GMAIL_REFRESH_TOKEN") });
  return google.gmail({ version: "v1", auth });
}

export async function listMessages(query: string, maxResults = 50): Promise<gmail_v1.Schema$Message[]> {
  const gmail = getClient();
  const res = await gmail.users.messages.list({ userId: "me", q: query, maxResults });
  return res.data.messages ?? [];
}

export async function getMessage(messageId: string): Promise<gmail_v1.Schema$Message> {
  const gmail = getClient();
  const res = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
  return res.data;
}

export async function markAsRead(messageId: string): Promise<void> {
  const gmail = getClient();
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: { removeLabelIds: ["UNREAD"] },
  });
}

export async function removeLabel(messageId: string, labelId: string): Promise<void> {
  const gmail = getClient();
  await gmail.users.messages.modify({ userId: "me", id: messageId, requestBody: { removeLabelIds: [labelId] } });
}

export async function getLabelId(labelName: string): Promise<string | null> {
  const gmail = getClient();
  const res = await gmail.users.labels.list({ userId: "me" });
  const label = (res.data.labels ?? []).find(
    (l) => l.name?.toLowerCase() === labelName.toLowerCase()
  );
  return label?.id ?? null;
}

export async function listThreadMessages(threadId: string): Promise<gmail_v1.Schema$Message[]> {
  const gmail = getClient();
  const res = await gmail.users.threads.get({ userId: "me", id: threadId, format: "full" });
  return res.data.messages ?? [];
}

export interface ThreadingOptions {
  threadId?: string;
  inReplyTo?: string;
  references?: string;
}

export async function getAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
  const gmail = getClient();
  const res = await gmail.users.messages.attachments.get({
    userId: "me", messageId, id: attachmentId,
  });
  return Buffer.from(res.data.data!, "base64url");
}

export async function sendEmail(
  to: string,
  subject: string,
  htmlBody: string,
  cc?: string,
  threading?: ThreadingOptions
): Promise<void> {
  const gmail = getClient();
  const sendAs = getEnv("AGENT_GMAIL_SEND_AS") ?? "edu.ops@trilogy.com";

  const effectiveSubject = threading?.inReplyTo && !subject.startsWith("Re: ")
    ? `Re: ${subject}`
    : subject;

  const messageParts = [
    `From: ${sendAs}`,
    `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    `Subject: ${effectiveSubject}`,
    ...(threading?.inReplyTo ? [`In-Reply-To: ${threading.inReplyTo}`] : []),
    ...(threading?.references ? [`References: ${threading.references}`] : []),
    "Content-Type: text/html; charset=utf-8",
    "",
    htmlBody,
  ];

  const rawMessage = Buffer.from(messageParts.join("\r\n")).toString("base64url");

  const requestBody: { raw: string; threadId?: string } = { raw: rawMessage };
  if (threading?.threadId) {
    requestBody.threadId = threading.threadId;
  }

  await gmail.users.messages.send({ userId: "me", requestBody });
  logger.info("Agent email sent", { to, subject: effectiveSubject, threaded: !!threading?.threadId });
}

export async function verifyToken(): Promise<boolean> {
  try {
    const gmail = getClient();
    await gmail.users.getProfile({ userId: "me" });
    return true;
  } catch (error) {
    logger.error("Agent Gmail token verification failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
