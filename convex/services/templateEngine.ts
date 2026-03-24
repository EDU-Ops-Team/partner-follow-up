"use node";

import { logger } from "../lib/logger";
import { AGENT_SIGNATURE } from "../lib/constants";
import { getTemplateById, type EmailTemplate } from "../data/templates/index";

export interface TemplateContext {
  site?: {
    address?: string;
    fullAddress?: string;
    phase?: string;
    responsiblePartyName?: string;
    responsiblePartyEmail?: string;
    inspectionContactName?: string;
    inspectionContactEmail?: string;
    inspectionDate?: string;
    inspectionTime?: string;
    reportDueDate?: string;
    reportLink?: string;
    lidarJobStatus?: string;
    lidarScheduledStatus?: string;
    inspectionScheduledStatus?: string;
    assignedDRI?: string;
    zipCode?: string;
  };
  vendor?: {
    name?: string;
    contactName?: string;
    contactEmail?: string;
  };
  email?: {
    from?: string;
    subject?: string;
    bodyPreview?: string;
  };
  reminderCount?: number;
  daysSinceTrigger?: number;
  businessDaysSince?: number;
  requestedDocuments?: string;
}

/**
 * Simple template variable replacement.
 * Supports {{variable.path}} and {{#if variable.path}}...{{/if}} blocks.
 */
function populateTemplate(template: string, context: TemplateContext): string {
  let result = template;

  // Handle {{#if field}}...{{/if}} blocks
  result = result.replace(
    /\{\{#if\s+([\w.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, field: string, content: string) => {
      const value = getNestedValue(context as unknown as Record<string, unknown>, field);
      return value ? content : "";
    }
  );

  // Handle {{variable.path}} replacements
  result = result.replace(
    /\{\{([\w.]+)\}\}/g,
    (_match, field: string) => {
      const value = getNestedValue(context as unknown as Record<string, unknown>, field);
      if (value === undefined || value === null) return "";
      return String(value);
    }
  );

  return result;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export interface PopulatedEmail {
  to: string;
  cc: string | undefined;
  subject: string;
  body: string;
  templateId: string;
  tier: 1 | 2;
}

/**
 * Populate a template with context data and return a ready-to-send email.
 */
export function populateEmail(
  templateId: string,
  context: TemplateContext,
  overrideTo?: string
): PopulatedEmail | null {
  const template = getTemplateById(templateId);
  if (!template) {
    logger.error(`Template not found: ${templateId}`);
    return null;
  }

  const subject = populateTemplate(template.subject, context);
  const body = populateTemplate(template.body, context);
  const to = overrideTo
    ?? template.defaultTo
    ?? context.vendor?.contactEmail
    ?? context.site?.responsiblePartyEmail
    ?? "";

  const ccList = template.defaultCc ?? [];
  const cc = ccList.length > 0 ? ccList.join(", ") : undefined;

  if (!to) {
    logger.warn(`No recipient for template ${templateId}`);
  }

  return {
    to,
    cc,
    subject,
    body,
    templateId: template.id,
    tier: template.tier,
  };
}
