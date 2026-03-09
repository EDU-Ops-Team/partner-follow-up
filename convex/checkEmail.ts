"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { TRIGGER_EMAIL_SENDER, GMAIL_QUERY, SCHEDULING_CHECK_INTERVAL_DAYS } from "./lib/constants";
import { listMessages, getMessage, parseGmailMessage, markAsRead } from "./services/gmail";
import { extractSiteInfo, isTriggerEmail } from "./services/emailParser";
import { normalizeAddress } from "./lib/addressNormalizer";
import { addBusinessDays } from "./lib/businessDays";
import { logger } from "./lib/logger";

export const run = internalAction({
  handler: async (ctx) => {
    const result = { success: true, processed: 0, errors: [] as string[] };

    try {
      const messages = await listMessages(GMAIL_QUERY);
      logger.info("check-email: found messages", { count: messages.length });

      for (const msg of messages) {
        try {
          if (!msg.id) continue;

          // Dedup check
          const existing = await ctx.runQuery(internal.sites.getByTriggerEmailId, { emailId: msg.id });
          if (existing) {
            await markAsRead(msg.id).catch(() => {});
            continue;
          }

          const fullMessage = await getMessage(msg.id);
          const parsed = parseGmailMessage(fullMessage);

          if (!isTriggerEmail(parsed, TRIGGER_EMAIL_SENDER)) {
            await markAsRead(msg.id).catch(() => {});
            continue;
          }

          const siteInfo = extractSiteInfo(parsed);
          if (!siteInfo) {
            logger.warn("check-email: could not extract site info", { messageId: msg.id, subject: parsed.subject });
            await ctx.runMutation(internal.auditLogs.create, {
              action: "error",
              details: { message: "Could not extract site info", messageId: msg.id, subject: parsed.subject },
              level: "warn",
            });
            await markAsRead(msg.id).catch(() => {});
            continue;
          }

          const now = Date.now();
          const nextCheck = addBusinessDays(new Date(now), SCHEDULING_CHECK_INTERVAL_DAYS).getTime();

          const siteId = await ctx.runMutation(internal.sites.create, {
            siteAddress: siteInfo.address,
            normalizedAddress: normalizeAddress(siteInfo.address),
            responsiblePartyEmail: siteInfo.responsiblePartyEmail,
            responsiblePartyName: siteInfo.responsiblePartyName,
            triggerEmailId: msg.id,
            triggerDate: now,
            nextCheckDate: nextCheck,
          });

          await ctx.runMutation(internal.auditLogs.create, {
            siteId,
            action: "site_created",
            details: { address: siteInfo.address, responsibleParty: siteInfo.responsiblePartyEmail, triggerEmailId: msg.id },
            level: "info",
          });

          await markAsRead(msg.id).catch(() => {});
          result.processed++;
          logger.info("check-email: created site", { siteId, address: siteInfo.address });
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          logger.error("check-email: error processing message", { messageId: msg.id, error: errMsg });
          result.errors.push(`Message ${msg.id}: ${errMsg}`);
        }
      }

      // Update sync state
      await ctx.runMutation(internal.gmailSync.upsert, { lastCheckedAt: Date.now() });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("check-email: fatal error", { error: errMsg });
      result.success = false;
      result.errors.push(errMsg);
    }

    return result;
  },
});
