"use node";

import { google, gmail_v1 } from "googleapis";
import { logger } from "../lib/logger";
import type { ParsedEmail } from "../lib/types";

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

  return { messageId: message.id ?? "", from, to, cc, subject, body, date: dateStr ? new Date(dateStr) : new Date() };
}

export async function markAsRead(messageId: string): Promise<void> {
  const gmail = getClient();
  await gmail.users.messages.modify({ userId: "me", id: messageId, requestBody: { removeLabelIds: ["UNREAD"] } });
}

export async function sendEmail(to: string, subject: string, htmlBody: string, cc?: string): Promise<void> {
  const gmail = getClient();
  const sendAs = process.env.GMAIL_SEND_AS ?? "auth.permitting@trilogy.com";

  const messageParts = [
    `From: ${sendAs}`, `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    `Subject: ${subject}`, "Content-Type: text/html; charset=utf-8", "", htmlBody,
  ];
  const rawMessage = Buffer.from(messageParts.join("\r\n")).toString("base64url");
  await gmail.users.messages.send({ userId: "me", requestBody: { raw: rawMessage } });
  logger.info("Email sent", { to, subject });
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
