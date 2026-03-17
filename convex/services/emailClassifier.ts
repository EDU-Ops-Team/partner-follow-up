"use node";

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../lib/logger";
import { withRetry } from "../lib/retry";
import {
  CLASSIFICATION_CONFIDENCE_THRESHOLD,
  INTERNAL_DOMAINS,
} from "../lib/constants";
import type {
  ParsedEmail,
  ClassificationType,
  ClassificationResult,
  ExtractedEntities,
} from "../lib/types";

const CLASSIFICATION_TYPES: ClassificationType[] = [
  "vendor_scheduling",
  "vendor_completion",
  "vendor_question",
  "vendor_invoice",
  "government_permit",
  "government_zoning",
  "inspection_report",
  "internal_fyi",
  "internal_action_needed",
  "auto_reply",
  "unknown",
];

const SCHEDULING_KEYWORDS = [
  "schedule", "scheduled", "booking", "booked", "confirmed", "appointment",
  "reserved", "set up", "arranged", "will be there", "available on",
  "time slot", "proposed date",
];

const COMPLETION_KEYWORDS = [
  "complete", "completed", "done", "finished", "delivered", "wrapped up",
  "all done", "took care of", "finalized",
];

const INVOICE_KEYWORDS = [
  "invoice", "payment", "billing", "amount due", "pay", "remittance",
  "accounts payable", "balance",
];

const PERMIT_KEYWORDS = [
  "permit", "building permit", "permit application", "permit number",
  "certificate of occupancy", "co issued", "plan review",
];

const ZONING_KEYWORDS = [
  "zoning", "zoned", "land use", "conditional use", "cup", "variance",
  "special exception", "prohibited", "permitted by right", "change of use",
];

const INSPECTION_REPORT_KEYWORDS = [
  "inspection report", "report attached", "findings", "inspection results",
  "mep check", "building inspection report",
];

const AUTO_REPLY_PATTERNS = [
  /out of (the )?office/i,
  /automatic reply/i,
  /auto-reply/i,
  /away from (my )?desk/i,
  /on vacation/i,
  /will return/i,
  /thank you for your (email|message)/i,
];

function extractEmailDomain(from: string): string {
  const match = from.match(/@([\w.-]+)/);
  return match ? match[1].toLowerCase() : "";
}

function bodyContainsKeywords(body: string, keywords: string[]): boolean {
  const lower = body.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

function isAutoReply(email: ParsedEmail): boolean {
  // Check headers commonly set by auto-responders
  const body = email.body;
  const subject = email.subject.toLowerCase();

  if (subject.includes("out of office") || subject.includes("automatic reply")) {
    return true;
  }

  // Very short body with auto-reply patterns
  if (body.length < 500) {
    return AUTO_REPLY_PATTERNS.some((p) => p.test(body));
  }

  return false;
}

/**
 * Rule-based classification. Returns null if confidence is too low for rule-based.
 */
export function classifyByRules(
  email: ParsedEmail,
  knownVendorCategory: string | null
): ClassificationResult | null {
  const domain = extractEmailDomain(email.from);
  const body = email.body;
  const subject = email.subject;
  const combinedText = `${subject} ${body}`;

  // Auto-reply detection (highest priority)
  if (isAutoReply(email)) {
    return {
      classificationType: "auto_reply",
      classificationMethod: "rule",
      confidence: 0.95,
      extractedEntities: {},
    };
  }

  // Internal email detection
  if (INTERNAL_DOMAINS.some((d) => domain.endsWith(d))) {
    const needsAction = bodyContainsKeywords(combinedText, [
      "please", "need", "action required", "urgent", "asap", "can you",
      "follow up", "review", "approve",
    ]);
    return {
      classificationType: needsAction ? "internal_action_needed" : "internal_fyi",
      classificationMethod: "rule",
      confidence: 0.95,
      extractedEntities: {},
    };
  }

  // If we know the partner category, use it to boost confidence
  const vendorBoost = knownVendorCategory ? 0.05 : 0;

  // Invoice detection (check before scheduling since invoices may mention schedules)
  if (bodyContainsKeywords(combinedText, INVOICE_KEYWORDS)) {
    return {
      classificationType: "vendor_invoice",
      classificationMethod: "rule",
      confidence: 0.9 + vendorBoost,
      extractedEntities: {},
    };
  }

  // Inspection report
  if (bodyContainsKeywords(combinedText, INSPECTION_REPORT_KEYWORDS)) {
    return {
      classificationType: "inspection_report",
      classificationMethod: "rule",
      confidence: 0.9 + vendorBoost,
      extractedEntities: {},
    };
  }

  // Government/permit
  if (bodyContainsKeywords(combinedText, PERMIT_KEYWORDS)) {
    return {
      classificationType: "government_permit",
      classificationMethod: "rule",
      confidence: 0.85 + vendorBoost,
      extractedEntities: {},
    };
  }

  // Government/zoning
  if (bodyContainsKeywords(combinedText, ZONING_KEYWORDS)) {
    return {
      classificationType: "government_zoning",
      classificationMethod: "rule",
      confidence: 0.85 + vendorBoost,
      extractedEntities: {},
    };
  }

  // Partner completion
  if (bodyContainsKeywords(combinedText, COMPLETION_KEYWORDS)) {
    return {
      classificationType: "vendor_completion",
      classificationMethod: "rule",
      confidence: 0.85 + vendorBoost,
      extractedEntities: {},
    };
  }

  // Partner scheduling
  if (bodyContainsKeywords(combinedText, SCHEDULING_KEYWORDS)) {
    return {
      classificationType: "vendor_scheduling",
      classificationMethod: "rule",
      confidence: 0.85 + vendorBoost,
      extractedEntities: {},
    };
  }

  // Not confident enough for rule-based
  return null;
}

const CLASSIFICATION_SYSTEM_PROMPT = `You are an email classification system for the EDU Ops team at Alpha Schools. Your job is to classify inbound emails into exactly one category.

## Categories
- vendor_scheduling: Partner confirming, updating, or discussing a schedule (LiDAR scan, inspection, construction, etc.)
- vendor_completion: Partner reporting that work is complete or delivered
- vendor_question: Partner asking a question about scope, timeline, access, or process
- vendor_invoice: Invoice, billing, or payment-related
- government_permit: Correspondence about building permits, certificates of occupancy, plan review
- government_zoning: Correspondence about zoning, land use, conditional use permits, variances
- inspection_report: Inspection report or results being delivered
- internal_fyi: Internal team FYI or informational update
- internal_action_needed: Internal email requiring someone to take action
- auto_reply: Out-of-office or automated response
- unknown: Cannot determine the category

## Response Format
Respond with ONLY a JSON object (no markdown, no explanation):
{"classificationType": "...", "confidence": 0.0-1.0, "extractedEntities": {"siteAddress": "...", "vendorName": "...", "dates": ["..."], "permitNumber": "..."}}

Only include entity fields that you can extract with confidence. Omit fields you're unsure about.`;

/**
 * LLM-based classification using Claude Sonnet 4.6.
 */
export async function classifyByLLM(
  email: ParsedEmail
): Promise<ClassificationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing env var: ANTHROPIC_API_KEY");

  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

  const userMessage = [
    `From: ${email.from}`,
    `To: ${email.to.join(", ")}`,
    `CC: ${email.cc.join(", ")}`,
    `Subject: ${email.subject}`,
    `Date: ${email.date.toISOString()}`,
    ``,
    `Body:`,
    email.body.slice(0, 3000),
  ].join("\n");

  return withRetry(async () => {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model,
      max_tokens: 512,
      system: CLASSIFICATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text content in Claude classification response");
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      logger.error("Failed to parse LLM classification JSON", {
        raw: textBlock.text.slice(0, 200),
      });
      throw new Error("LLM returned invalid JSON for classification");
    }

    const classificationType = CLASSIFICATION_TYPES.includes(
      parsed.classificationType as ClassificationType
    )
      ? parsed.classificationType
      : "unknown";

    logger.info("LLM classification complete", {
      model,
      classificationType,
      confidence: parsed.confidence,
    });

    return {
      classificationType: classificationType as ClassificationType,
      classificationMethod: "llm" as const,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      extractedEntities: (parsed.extractedEntities as ExtractedEntities) ?? {},
    };
  }, { maxRetries: 2, context: "classification-llm" });
}

/**
 * Classify an email using rules first, falling back to LLM.
 */
export async function classify(
  email: ParsedEmail,
  knownVendorCategory: string | null
): Promise<ClassificationResult> {
  // Try rule-based first
  const ruleResult = classifyByRules(email, knownVendorCategory);
  if (ruleResult && ruleResult.confidence >= CLASSIFICATION_CONFIDENCE_THRESHOLD) {
    logger.info("Rule-based classification", {
      type: ruleResult.classificationType,
      confidence: ruleResult.confidence,
    });
    return ruleResult;
  }

  // Fall back to LLM
  try {
    const llmResult = await classifyByLLM(email);
    return llmResult;
  } catch (error) {
    logger.error("LLM classification failed, using rule result or unknown", {
      error: error instanceof Error ? error.message : String(error),
    });
    // If rule-based had a result (just low confidence), use it
    if (ruleResult) return ruleResult;
    // Otherwise return unknown
    return {
      classificationType: "unknown",
      classificationMethod: "rule",
      confidence: 0,
      extractedEntities: {},
    };
  }
}
