"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  TRIGGER_EMAIL_SENDER,
  GMAIL_QUERY,
  IMPORT_GMAIL_QUERY,
  IMPORT_LABEL_NAME,
  SCHEDULING_CHECK_INTERVAL_DAYS,
} from "./lib/constants";
import { listMessages, getMessage, parseGmailMessage, markAsRead, removeLabel, getLabelId } from "./services/gmail";
import { extractSiteInfo, isTriggerEmail } from "./services/emailParser";
import { postToChat } from "./services/googleChat";
import { normalizeAddress } from "./lib/addressNormalizer";
import { addBusinessDays } from "./lib/businessDays";
import {
  importMissingResponsiblePartyChat,
  importNoAddressChat,
  importSiteCreatedChat,
} from "./lib/templates";
import { logger } from "./lib/logger";

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const run = internalAction({
  handler: async (ctx) => {
    const result = { success: true, processed: 0, errors: [] as string[] };

    try {
      // ── Phase 1: Process trigger emails from Zack ──
      const messages = await listMessages(GMAIL_QUERY);
      logger.info("check-email: found trigger messages", { count: messages.length });

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
            triggerThreadId: parsed.threadId,
            triggerMessageId: parsed.gmailMessageId,
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

      // ── Phase 2: Process label-imported emails ──
      const importLabelId = await getLabelId(IMPORT_LABEL_NAME).catch(() => null);
      if (importLabelId) {
        const importMessages = await listMessages(IMPORT_GMAIL_QUERY);
        logger.info("check-email: found import-labeled messages", { count: importMessages.length });
        const chatWebhook = getEnv("GOOGLE_CHAT_WEBHOOK_URL");

        for (const msg of importMessages) {
          try {
            if (!msg.id) continue;

            // Dedup check
            const existing = await ctx.runQuery(internal.sites.getByTriggerEmailId, { emailId: msg.id });
            if (existing) {
              await removeLabel(msg.id, importLabelId).catch(() => {});
              continue;
            }

            const fullMessage = await getMessage(msg.id);
            const parsed = parseGmailMessage(fullMessage);

            // Extract site info — no sender restriction for imports
            const siteInfo = extractSiteInfo(parsed);
            if (!siteInfo) {
              logger.warn("check-email: import — no address found", { messageId: msg.id, subject: parsed.subject });
              await postToChat(chatWebhook, importNoAddressChat(parsed.subject, msg.id));
              await ctx.runMutation(internal.auditLogs.create, {
                action: "import_failed",
                details: { reason: "no_address", messageId: msg.id, subject: parsed.subject },
                level: "warn",
              });
              await removeLabel(msg.id, importLabelId).catch(() => {});
              continue;
            }

            // Check for responsible party — alert via Chat if missing
            if (!siteInfo.responsiblePartyEmail) {
              logger.warn("check-email: import — no responsible party", { messageId: msg.id, address: siteInfo.address });
              await postToChat(chatWebhook, importMissingResponsiblePartyChat(siteInfo.address, parsed.subject, msg.id));
              await ctx.runMutation(internal.auditLogs.create, {
                action: "import_failed",
                details: { reason: "no_responsible_party", messageId: msg.id, address: siteInfo.address },
                level: "warn",
              });
              await removeLabel(msg.id, importLabelId).catch(() => {});
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
              triggerThreadId: parsed.threadId,
              triggerMessageId: parsed.gmailMessageId,
              triggerDate: now,
              nextCheckDate: nextCheck,
            });

            const senderMatch = parsed.from.match(/<(.+?)>/);
            const source = senderMatch ? senderMatch[1] : parsed.from;

            await postToChat(chatWebhook, importSiteCreatedChat(
              siteInfo.address,
              siteInfo.responsiblePartyEmail,
              source,
            ));

            await ctx.runMutation(internal.auditLogs.create, {
              siteId,
              action: "site_imported",
              details: {
                address: siteInfo.address,
                responsibleParty: siteInfo.responsiblePartyEmail,
                triggerEmailId: msg.id,
                source: "label-import",
              },
              level: "info",
            });

            await removeLabel(msg.id, importLabelId).catch(() => {});
            result.processed++;
            logger.info("check-email: imported site", { siteId, address: siteInfo.address });
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error("check-email: import error", { messageId: msg.id, error: errMsg });
            result.errors.push(`Import ${msg.id}: ${errMsg}`);
          }
        }
      } else {
        logger.info("check-email: import label not found, skipping import scan");
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
