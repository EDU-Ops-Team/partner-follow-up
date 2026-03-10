"use node";

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../lib/logger";
import { withRetry } from "../lib/retry";
import type { AirtableRow } from "../lib/types";

const SYSTEM_PROMPT = `You are the EDU Ops Team assistant handling LiDAR scanning and Building Inspection scheduling for Alpha Schools sites.

## Your Role
You respond to emails from vendors and points of contact (POCs) who are scheduling LiDAR scans and building inspections for school sites. You are helpful, professional, direct, and concise.

## Scheduling Lifecycle
Each site goes through these phases:
1. **Scheduling** — Both a LiDAR scan and a Building Inspection must be scheduled.
2. **Completion** — The LiDAR scan must be completed and the inspection report must be received.
3. **Resolved** — All items are done.

## What You CAN Do
- Acknowledge scheduling updates and confirmations
- Confirm receipt of information, documents, or attachments
- Provide current site status (what's scheduled, what's pending, job status)
- Ask clarifying questions when a vendor's message is unclear
- Remind vendors of outstanding items

## What You CANNOT Do
- Approve schedule changes or reschedules
- Commit to specific deadlines or timelines
- Authorize additional work, scope changes, or budget
- Make promises about when items will be completed

## Response Guidelines
- Keep responses to 2-4 short paragraphs maximum
- Be direct — lead with the answer or acknowledgment
- Reference specific dates, statuses, and addresses when available
- If you are unsure how to respond or the message is outside your scope, prefix your entire response with [UNCERTAIN]
- Always sign off with:
  Thank you,
  EDU Ops Team`;

interface ThreadMessage {
  from: string;
  date: string;
  body: string;
}

interface SiteContext {
  siteAddress: string;
  fullAddress?: string;
  phase: string;
  lidarScheduled: boolean;
  lidarScheduledDatetime?: number;
  lidarJobStatus?: string;
  inspectionScheduled: boolean;
  inspectionDate?: string;
  inspectionTime?: string;
  reportReceived: boolean;
  reportLink?: string;
}

export interface LLMResponse {
  response: string;
  confident: boolean;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

function formatDatetime(ms?: number): string {
  if (!ms) return "Not set";
  return new Date(ms).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

/**
 * Build the user message with full context for Claude.
 * Exported for testing.
 */
export function buildPrompt(
  siteContext: SiteContext,
  airtableData: AirtableRow | null,
  threadHistory: ThreadMessage[],
  vendorReply: { from: string; body: string }
): string {
  const address = siteContext.fullAddress || siteContext.siteAddress;

  const siteStatus = [
    `## Current Site Status`,
    `Address: ${address}`,
    `Phase: ${siteContext.phase}`,
    `LiDAR Scheduled: ${siteContext.lidarScheduled ? "Yes" : "No"}${siteContext.lidarScheduledDatetime ? ` (${formatDatetime(siteContext.lidarScheduledDatetime)})` : ""}`,
    `LiDAR Job Status: ${siteContext.lidarJobStatus || "Unknown"}`,
    `Inspection Scheduled: ${siteContext.inspectionScheduled ? "Yes" : "No"}${siteContext.inspectionDate ? ` (${siteContext.inspectionDate}${siteContext.inspectionTime ? ` at ${siteContext.inspectionTime}` : ""})` : ""}`,
    `Report Received: ${siteContext.reportReceived ? "Yes" : "No"}${siteContext.reportLink ? ` (${siteContext.reportLink})` : ""}`,
  ].join("\n");

  const airtableSection = airtableData ? [
    `\n## Latest Airtable Data`,
    `Job Status: ${airtableData.jobStatus || "Unknown"}`,
    `Scheduled Date: ${airtableData.scheduledDate || "Not set"}`,
    `Model URL: ${airtableData.modelUrl || "Not available"}`,
  ].join("\n") : "\n## Latest Airtable Data\nNo matching Airtable record found.";

  // Cap thread history to 10 most recent messages
  const recentHistory = threadHistory.slice(-10);
  const threadSection = recentHistory.length > 0
    ? [
        `\n## Email Thread History (chronological)`,
        ...recentHistory.map((msg, i) =>
          `[${i + 1}] From: ${msg.from} | Date: ${msg.date}\n${truncate(msg.body, 2000)}`
        ),
      ].join("\n\n")
    : "\n## Email Thread History\nNo previous messages.";

  const replySection = [
    `\n## Vendor Reply (respond to this)`,
    `From: ${vendorReply.from}`,
    vendorReply.body,
  ].join("\n");

  return [siteStatus, airtableSection, threadSection, replySection].join("\n");
}

/**
 * Parse Claude's response, checking for the [UNCERTAIN] flag.
 * Exported for testing.
 */
export function parseResponse(rawResponse: string): LLMResponse {
  const uncertain = rawResponse.trimStart().startsWith("[UNCERTAIN]");
  const response = uncertain
    ? rawResponse.trimStart().replace(/^\[UNCERTAIN\]\s*/, "")
    : rawResponse;
  return { response: response.trim(), confident: !uncertain };
}

/**
 * Generate an email response using Claude.
 */
export async function generateEmailResponse(params: {
  threadHistory: ThreadMessage[];
  siteContext: SiteContext;
  airtableData: AirtableRow | null;
  vendorReply: { from: string; body: string };
}): Promise<LLMResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing env var: ANTHROPIC_API_KEY");

  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6-20250514";
  const userMessage = buildPrompt(
    params.siteContext,
    params.airtableData,
    params.threadHistory,
    params.vendorReply
  );

  return withRetry(async () => {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text content in Claude response");
    }

    const result = parseResponse(textBlock.text);
    logger.info("Claude response generated", {
      model, confident: result.confident,
      responseLength: result.response.length,
    });
    return result;
  }, { maxRetries: 2, context: "claude-api" });
}
