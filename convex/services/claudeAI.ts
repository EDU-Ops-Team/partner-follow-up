"use node";

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../lib/logger";
import { withRetry } from "../lib/retry";
import type { AirtableRow } from "../lib/types";
import { PROMPT_LIBRARY } from "../data/generated/promptLibrary";

const SYSTEM_PROMPT = PROMPT_LIBRARY.claudeSystem;

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

export interface DraftReplyContext {
  classificationType: string;
  subject: string;
  bodyPreview: string;
  from: string;
  to?: string[];
  cc?: string[];
  siteContext?: SiteContext;
  threadHistory?: ThreadMessage[];
  partner?: {
    name?: string;
    category?: string;
    contactName?: string;
    contactEmail?: string;
  };
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

function getModel(): string {
  return process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
}

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing env var: ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey });
}

/**
 * Build the user message with full context for Claude.
 * Exported for testing.
 */
export function buildPrompt(
  siteContext: SiteContext,
  airtableData: AirtableRow | null,
  threadHistory: ThreadMessage[],
  partnerReply: { from: string; body: string }
): string {
  const address = siteContext.fullAddress || siteContext.siteAddress;

  const siteStatus = [
    "## Current Site Status",
    `Address: ${address}`,
    `Phase: ${siteContext.phase}`,
    `LiDAR Scheduled: ${siteContext.lidarScheduled ? "Yes" : "No"}${siteContext.lidarScheduledDatetime ? ` (${formatDatetime(siteContext.lidarScheduledDatetime)})` : ""}`,
    `LiDAR Job Status: ${siteContext.lidarJobStatus || "Unknown"}`,
    `Inspection Scheduled: ${siteContext.inspectionScheduled ? "Yes" : "No"}${siteContext.inspectionDate ? ` (${siteContext.inspectionDate}${siteContext.inspectionTime ? ` at ${siteContext.inspectionTime}` : ""})` : ""}`,
    `Report Received: ${siteContext.reportReceived ? "Yes" : "No"}${siteContext.reportLink ? ` (${siteContext.reportLink})` : ""}`,
  ].join("\n");

  const airtableSection = airtableData ? [
    "\n## Latest Airtable Data",
    `Job Status: ${airtableData.jobStatus || "Unknown"}`,
    `Scheduled Date: ${airtableData.scheduledDate || "Not set"}`,
    `Model URL: ${airtableData.modelUrl || "Not available"}`,
  ].join("\n") : "\n## Latest Airtable Data\nNo matching Airtable record found.";

  const recentHistory = threadHistory.slice(-10);
  const threadSection = recentHistory.length > 0
    ? [
        "\n## Email Thread History (chronological)",
        ...recentHistory.map((msg, i) =>
          `[${i + 1}] From: ${msg.from} | Date: ${msg.date}\n${truncate(msg.body, 2000)}`
        ),
      ].join("\n\n")
    : "\n## Email Thread History\nNo previous messages.";

  const replySection = [
    "\n## Partner Reply (respond to this)",
    `From: ${partnerReply.from}`,
    partnerReply.body,
  ].join("\n");

  return [siteStatus, airtableSection, threadSection, replySection].join("\n");
}

export function buildDraftReplyPrompt(context: DraftReplyContext): string {
  const siteSection = context.siteContext
    ? [
        "## Site Context",
        `Address: ${context.siteContext.fullAddress || context.siteContext.siteAddress}`,
        `Phase: ${context.siteContext.phase}`,
        `LiDAR Scheduled: ${context.siteContext.lidarScheduled ? "Yes" : "No"}${context.siteContext.lidarScheduledDatetime ? ` (${formatDatetime(context.siteContext.lidarScheduledDatetime)})` : ""}`,
        `LiDAR Job Status: ${context.siteContext.lidarJobStatus || "Unknown"}`,
        `Inspection Scheduled: ${context.siteContext.inspectionScheduled ? "Yes" : "No"}${context.siteContext.inspectionDate ? ` (${context.siteContext.inspectionDate}${context.siteContext.inspectionTime ? ` at ${context.siteContext.inspectionTime}` : ""})` : ""}`,
        `Report Received: ${context.siteContext.reportReceived ? "Yes" : "No"}`,
        context.siteContext.reportLink ? `Report Link: ${context.siteContext.reportLink}` : undefined,
      ].filter(Boolean).join("\n")
    : "## Site Context\nNo linked site context was found.";

  const partnerSection = context.partner
    ? [
        "## Partner Context",
        context.partner.name ? `Partner Name: ${context.partner.name}` : undefined,
        context.partner.category ? `Category: ${context.partner.category}` : undefined,
        context.partner.contactName ? `Primary Contact: ${context.partner.contactName}` : undefined,
        context.partner.contactEmail ? `Primary Contact Email: ${context.partner.contactEmail}` : undefined,
      ].filter(Boolean).join("\n")
    : "## Partner Context\nNo linked partner record was found.";

  const history = (context.threadHistory ?? []).slice(-8);
  const threadSection = history.length > 0
    ? [
        "## Recent Thread History",
        ...history.map((message, index) => (
          `[${index + 1}] From: ${message.from} | Date: ${message.date}\n${truncate(message.body, 1200)}`
        )),
      ].join("\n\n")
    : "## Recent Thread History\nNo prior thread history was available.";

  return [
    PROMPT_LIBRARY.claudeDraftReplyPreamble,
    "",
    `Classification Type: ${context.classificationType}`,
    `From: ${context.from}`,
    context.to && context.to.length > 0 ? `To: ${context.to.join(", ")}` : undefined,
    context.cc && context.cc.length > 0 ? `Cc: ${context.cc.join(", ")}` : undefined,
    `Subject: ${context.subject}`,
    "",
    "## Current Inbound Email",
    context.bodyPreview,
    "",
    siteSection,
    "",
    partnerSection,
    "",
    threadSection,
  ].filter(Boolean).join("\n");
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

async function createMessage(userMessage: string): Promise<LLMResponse> {
  const model = getModel();

  return withRetry(async () => {
    const client = getClient();
    const message = await client.messages.create({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text content in Claude response");
    }

    const result = parseResponse(textBlock.text);
    logger.info("Claude response generated", {
      model,
      confident: result.confident,
      responseLength: result.response.length,
    });
    return result;
  }, { maxRetries: 2, context: "claude-api" });
}

/**
 * Generate an email response using Claude.
 */
export async function generateEmailResponse(params: {
  threadHistory: ThreadMessage[];
  siteContext: SiteContext;
  airtableData: AirtableRow | null;
  partnerReply: { from: string; body: string };
}): Promise<LLMResponse> {
  const userMessage = buildPrompt(
    params.siteContext,
    params.airtableData,
    params.threadHistory,
    params.partnerReply
  );

  return createMessage(userMessage);
}

export async function generateDraftReply(
  context: DraftReplyContext
): Promise<LLMResponse> {
  const userMessage = buildDraftReplyPrompt(context);
  return createMessage(userMessage);
}
