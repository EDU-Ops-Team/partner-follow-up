"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { GOOGLE_DRIVE_PARENT_FOLDER_ID } from "./lib/constants";
import { listThreadMessages, parseGmailMessage, getAttachment, sendEmail, type ThreadingOptions } from "./services/gmail";
import { postToChat } from "./services/googleChat";
import { findOrCreateFolder, uploadFile } from "./services/googleDrive";
import { parseReplyIntent } from "./services/replyParser";
import { generateEmailResponse } from "./services/claudeAI";
import { fetchAirtableData } from "./services/airtableScraper";
import { matchAddress } from "./lib/addressNormalizer";
import {
  replyReceivedChat,
  attachmentSavedChat,
  statusUpdatedFromReplyChat,
  llmResponseSentChat,
  llmNeedsReviewChat,
  holdingResponseSentChat,
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
      const sendAsEmail = (process.env.GMAIL_SEND_AS ?? "auth.permitting@trilogy.com").toLowerCase();

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

            // Loop prevention — skip our own sent messages
            if (senderEmail.toLowerCase() === sendAsEmail) {
              await ctx.runMutation(internal.processedMessages.create, {
                messageId: msg.id,
                siteId: site._id,
                threadId: site.triggerThreadId!,
                processedAt: Date.now(),
                action: "self_message_skipped",
                details: { from: senderEmail },
              });
              continue;
            }

            // Skip internal team emails — don't respond to @trilogy.com or the trigger sender
            const isInternalSender = senderEmail.toLowerCase().endsWith("@trilogy.com")
              || senderEmail.toLowerCase().endsWith("@2hourlearning.com");
            if (isInternalSender) {
              await ctx.runMutation(internal.processedMessages.create, {
                messageId: msg.id,
                siteId: site._id,
                threadId: site.triggerThreadId!,
                processedAt: Date.now(),
                action: "internal_message_skipped",
                details: { from: senderEmail },
              });
              continue;
            }

            // Post reply notification to chat
            await postToChat(chatWebhook, replyReceivedChat(site, senderEmail, intent.summary));

            // Handle attachments — save to Drive
            if (intent.hasAttachments && parsed.attachments.length > 0) {
              try {
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

            // ── Generate and send LLM response ──

            // Build thread history for context
            const threadHistory = threadMessages
              .filter((m) => m.id)
              .map((m) => {
                const p = parseGmailMessage(m);
                return {
                  from: p.from,
                  date: p.date.toISOString(),
                  body: p.body,
                };
              });

            // Fetch fresh Airtable data for this site
            let airtableMatch = null;
            try {
              const airtableUrl = getEnv("AIRTABLE_SHARED_VIEW_URL");
              const airtableRows = await fetchAirtableData(airtableUrl);
              const addresses = airtableRows.map((r) => r.address);
              const match = matchAddress(site.siteAddress, addresses);
              if (match.matched && match.matchedAddress) {
                airtableMatch = airtableRows.find((r) => r.address === match.matchedAddress) ?? null;
              }
            } catch (airtableErr) {
              logger.warn("check-replies: Airtable fetch failed for LLM context", {
                error: airtableErr instanceof Error ? airtableErr.message : String(airtableErr),
              });
            }

            // Threading options for the response
            const threadOpts: ThreadingOptions = {
              threadId: site.triggerThreadId,
              inReplyTo: parsed.gmailMessageId,
              references: parsed.references
                ? `${parsed.references} ${parsed.gmailMessageId}`
                : parsed.gmailMessageId,
            };

            let llmResponse: string | undefined;
            let llmConfident = false;

            try {
              const llmResult = await generateEmailResponse({
                threadHistory,
                siteContext: {
                  siteAddress: site.siteAddress,
                  fullAddress: site.fullAddress ?? undefined,
                  phase: site.phase,
                  lidarScheduled: site.lidarScheduled,
                  lidarScheduledDatetime: site.lidarScheduledDatetime ?? undefined,
                  lidarJobStatus: site.lidarJobStatus ?? undefined,
                  inspectionScheduled: site.inspectionScheduled,
                  inspectionDate: site.inspectionDate ?? undefined,
                  inspectionTime: site.inspectionTime ?? undefined,
                  reportReceived: site.reportReceived,
                  reportLink: site.reportLink ?? undefined,
                },
                airtableData: airtableMatch,
                vendorReply: { from: senderEmail, body: parsed.body },
              });

              llmResponse = llmResult.response;
              llmConfident = llmResult.confident;
            } catch (llmErr) {
              const errMsg = llmErr instanceof Error ? llmErr.message : String(llmErr);
              logger.error("check-replies: Claude API failed", { siteId: site._id, error: errMsg });
              llmConfident = false;
            }

            if (llmConfident && llmResponse) {
              // Send the LLM-generated response
              const htmlResponse = llmResponse.replace(/\n/g, "<br>");
              await sendEmail(senderEmail, parsed.subject, htmlResponse, undefined, threadOpts);
              await postToChat(chatWebhook, llmResponseSentChat(
                site, senderEmail,
                llmResponse.length > 200 ? llmResponse.slice(0, 197) + "..." : llmResponse
              ));
              await ctx.runMutation(internal.auditLogs.create, {
                siteId: site._id,
                action: "llm_response_sent",
                details: { to: senderEmail, response: llmResponse, confident: true },
                level: "info",
              });
            } else {
              // Send holding response
              const holdingHtml = `
                <p>Thank you for your message regarding <strong>${site.fullAddress || site.siteAddress}</strong>.</p>
                <p>We have received your response and our team will review and follow up shortly.</p>
                <p>Thank you,<br>EDU Ops Team</p>
              `.trim();
              await sendEmail(senderEmail, parsed.subject, holdingHtml, undefined, threadOpts);
              await postToChat(chatWebhook, llmNeedsReviewChat(site, senderEmail, parsed.body));
              await postToChat(chatWebhook, holdingResponseSentChat(site, senderEmail));
              await ctx.runMutation(internal.auditLogs.create, {
                siteId: site._id,
                action: "llm_holding_response_sent",
                details: { to: senderEmail, llmResponse, confident: false, reason: llmResponse ? "uncertain" : "api_error" },
                level: "warn",
              });
            }

            // Record as processed
            await ctx.runMutation(internal.processedMessages.create, {
              messageId: msg.id,
              siteId: site._id,
              threadId: site.triggerThreadId!,
              processedAt: Date.now(),
              action: intent.type,
              details: {
                from: senderEmail,
                summary: intent.summary,
                hasAttachments: intent.hasAttachments,
                llmResponse,
                llmConfident,
              },
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
