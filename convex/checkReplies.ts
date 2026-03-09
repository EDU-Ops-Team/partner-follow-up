"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { GOOGLE_DRIVE_PARENT_FOLDER_ID } from "./lib/constants";
import { listThreadMessages, parseGmailMessage, getAttachment } from "./services/gmail";
import { postToChat } from "./services/googleChat";
import { findOrCreateFolder, uploadFile } from "./services/googleDrive";
import { parseReplyIntent } from "./services/replyParser";
import {
  replyReceivedChat,
  attachmentSavedChat,
  statusUpdatedFromReplyChat,
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
      const activeSites = await ctx.runQuery(internal.sites.getActiveThreadedSites);

      if (activeSites.length === 0) {
        logger.info("check-replies: no active threaded sites");
        return result;
      }

      const chatWebhook = getEnv("GOOGLE_CHAT_WEBHOOK_URL");

      for (const site of activeSites) {
        try {
          const threadMessages = await listThreadMessages(site.triggerThreadId!);

          for (const msg of threadMessages) {
            if (!msg.id) continue;

            // Skip the original trigger email
            if (msg.id === site.triggerEmailId) continue;

            // Dedup check
            const already = await ctx.runQuery(internal.processedMessages.getByMessageId, {
              messageId: msg.id,
            });
            if (already) continue;

            const parsed = parseGmailMessage(msg);
            const intent = parseReplyIntent(parsed.body, parsed.attachments);

            // Extract sender email for display
            const senderMatch = parsed.from.match(/<(.+?)>/);
            const senderEmail = senderMatch ? senderMatch[1] : parsed.from;

            // Post reply notification to chat
            await postToChat(chatWebhook, replyReceivedChat(site, senderEmail, intent.summary));

            // Handle attachments — save to Drive
            if (intent.hasAttachments && parsed.attachments.length > 0) {
              try {
                // Find or create the site's Drive folder
                let folderId = site.driveFolderId;
                if (!folderId) {
                  folderId = await findOrCreateFolder(GOOGLE_DRIVE_PARENT_FOLDER_ID, site.siteAddress);
                  await ctx.runMutation(internal.sites.update, {
                    id: site._id,
                    updates: { driveFolderId: folderId },
                  });
                }

                for (const attachment of parsed.attachments) {
                  try {
                    const content = await getAttachment(msg.id!, attachment.attachmentId);
                    const { webViewLink } = await uploadFile(
                      folderId,
                      attachment.filename,
                      attachment.mimeType,
                      content
                    );
                    await postToChat(chatWebhook, attachmentSavedChat(site, attachment.filename, webViewLink));
                    await ctx.runMutation(internal.auditLogs.create, {
                      siteId: site._id,
                      action: "attachment_saved",
                      details: { filename: attachment.filename, driveLink: webViewLink, from: senderEmail },
                      level: "info",
                    });
                  } catch (attachErr) {
                    const errMsg = attachErr instanceof Error ? attachErr.message : String(attachErr);
                    logger.error("check-replies: attachment save failed", {
                      siteId: site._id, filename: attachment.filename, error: errMsg,
                    });
                    // Continue with other attachments
                  }
                }
              } catch (driveErr) {
                const errMsg = driveErr instanceof Error ? driveErr.message : String(driveErr);
                logger.error("check-replies: Drive folder error", { siteId: site._id, error: errMsg });
              }
            }

            // Handle status updates from reply intent
            if (intent.type === "scheduling_update") {
              const updates: Record<string, unknown> = {};
              const field = site.lidarScheduled ? "inspectionScheduled" : "lidarScheduled";
              updates[field] = true;
              if (intent.extractedDate) {
                if (field === "inspectionScheduled") {
                  updates.inspectionDate = intent.extractedDate;
                }
              }
              await ctx.runMutation(internal.sites.update, { id: site._id, updates });
              await postToChat(chatWebhook, statusUpdatedFromReplyChat(site, field, "Scheduled (from email reply)"));
              await ctx.runMutation(internal.auditLogs.create, {
                siteId: site._id,
                action: "status_updated_from_reply",
                details: { field, intent: intent.type, extractedDate: intent.extractedDate, from: senderEmail },
                level: "info",
              });
            } else if (intent.type === "completion_update") {
              await ctx.runMutation(internal.sites.update, {
                id: site._id,
                updates: { lidarJobStatus: "complete" },
              });
              await postToChat(chatWebhook, statusUpdatedFromReplyChat(site, "lidarJobStatus", "Complete (from email reply)"));
              await ctx.runMutation(internal.auditLogs.create, {
                siteId: site._id,
                action: "status_updated_from_reply",
                details: { field: "lidarJobStatus", intent: intent.type, from: senderEmail },
                level: "info",
              });
            }

            // Record as processed
            await ctx.runMutation(internal.processedMessages.create, {
              messageId: msg.id,
              siteId: site._id,
              threadId: site.triggerThreadId!,
              processedAt: Date.now(),
              action: intent.type,
              details: { from: senderEmail, summary: intent.summary, hasAttachments: intent.hasAttachments },
            });

            result.processed++;
          }
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          logger.error("check-replies: error processing site", { siteId: site._id, error: errMsg });
          result.errors.push(`Site ${site._id}: ${errMsg}`);
        }
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("check-replies: fatal error", { error: errMsg });
      result.success = false;
      result.errors.push(errMsg);
    }

    return result;
  },
});
