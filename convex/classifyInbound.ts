"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { GOOGLE_DRIVE_PARENT_FOLDER_ID } from "./lib/constants";
import {
  AGENT_GMAIL_QUERY,
  AGENT_POLL_BATCH_SIZE,
  BODY_PREVIEW_LENGTH,
  INTERNAL_DOMAINS,
  SKIP_SENDERS,
  SKIP_SUBJECT_PATTERNS,
} from "./lib/constants";
import {
  listMessages,
  getMessage,
  getAttachment,
  parseGmailMessage,
  markAsRead,
} from "./services/agentGmail";
import { findOrCreateFolder, uploadFile } from "./services/googleDrive";
import { resolveContext } from "./services/contextResolver";
import { classify } from "./services/emailClassifier";
import { parseReplyIntent } from "./services/replyParser";
import { deriveInboundReplyUpdates } from "./lib/replyEffects";
import { logger } from "./lib/logger";
import type { Id } from "./_generated/dataModel";

function getSenderEmail(fromHeader: string): string {
  return fromHeader.match(/<([^>]+)>/)?.[1]?.toLowerCase()
    ?? fromHeader.toLowerCase().trim();
}

async function processInboundSiteEffects(
  ctx: any,
  args: {
    messageId: string;
    parsed: ReturnType<typeof parseGmailMessage>;
    classificationType: string;
    siteIds: Id<"sites">[];
    isInternalSender: boolean;
  }
) {
  const { messageId, parsed, classificationType, siteIds, isInternalSender } = args;

  if (siteIds.length === 0 || isInternalSender) {
    return;
  }

  const intent = parseReplyIntent(parsed.body, parsed.attachments);

  for (const siteId of siteIds) {
    const site = await ctx.runQuery(internal.sites.getByIdInternal, { id: siteId });
    if (!site) {
      continue;
    }

    const uploadedAttachmentLinks: string[] = [];

    if (parsed.attachments.length > 0) {
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
            const content = await getAttachment(messageId, attachment.attachmentId);
            const { webViewLink } = await uploadFile(
              folderId,
              attachment.filename,
              attachment.mimeType,
              content
            );
            if (webViewLink) {
              uploadedAttachmentLinks.push(webViewLink);
            }
            await ctx.runMutation(internal.auditLogs.create, {
              siteId: site._id,
              action: "attachment_saved",
              details: {
                filename: attachment.filename,
                driveLink: webViewLink,
                gmailMessageId: messageId,
                classificationType,
              },
              level: "info",
            });
          } catch (error) {
            logger.error("Failed to save inbound attachment", {
              siteId: site._id,
              messageId,
              filename: attachment.filename,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      } catch (error) {
        logger.error("Failed to prepare site drive folder for inbound attachment", {
          siteId: site._id,
          messageId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const derived = deriveInboundReplyUpdates({
      site,
      classificationType,
      intent,
      uploadedAttachmentLinks,
    });

    if (Object.keys(derived.updates).length === 0) {
      continue;
    }

    await ctx.runMutation(internal.sites.update, {
      id: site._id,
      updates: derived.updates,
    });
    await ctx.runMutation(internal.tasks.syncFromSite, {
      siteId: site._id,
      updatedAt: parsed.date.getTime(),
    });
    await ctx.runMutation(internal.auditLogs.create, {
      siteId: site._id,
      action: "status_updated_from_reply",
      details: {
        gmailMessageId: messageId,
        classificationType,
        replyIntent: intent.type,
        summary: derived.summary,
        updates: derived.updates,
      },
      level: "info",
    });
  }
}

export const run = internalAction({
  handler: async (ctx): Promise<{ processed: number; errors: string[] }> => {
    const errors: string[] = [];
    let processed = 0;

    // Fetch unread messages from agent mailbox
    let messages;
    try {
      messages = await listMessages(AGENT_GMAIL_QUERY, AGENT_POLL_BATCH_SIZE);
    } catch (error) {
      const msg = `Failed to list messages: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(msg);
      return { processed: 0, errors: [msg] };
    }

    if (messages.length === 0) {
      logger.info("No unread messages found");
      return { processed: 0, errors: [] };
    }

    logger.info(`Found ${messages.length} unread messages`);

    for (const msg of messages) {
      const messageId = msg.id;
      if (!messageId) continue;

      try {
        // Dedup: check if already classified
        const existing = await ctx.runQuery(
          internal.emailClassifications.getByGmailMessageId,
          { gmailMessageId: messageId }
        );
        if (existing) {
          // Already processed, just mark as read
          await markAsRead(messageId);
          continue;
        }

        // Fetch full message
        const fullMessage = await getMessage(messageId);
        const parsed = parseGmailMessage(fullMessage);
        if (!parsed.threadId) {
          logger.warn("Message has no threadId, skipping", { messageId });
          await markAsRead(messageId);
          continue;
        }

        // Skip automated/system emails
        const senderEmail = getSenderEmail(parsed.from);
        const isSkippedSender = SKIP_SENDERS.some((pattern) =>
          pattern.includes("@")
            ? senderEmail === pattern || senderEmail.endsWith(pattern)
            : senderEmail.includes(pattern)
        );
        const isSkippedSubject = SKIP_SUBJECT_PATTERNS.some((p) => p.test(parsed.subject));
        if (isSkippedSender || isSkippedSubject) {
          logger.info("Skipping automated email", { messageId, from: senderEmail, subject: parsed.subject });
          await markAsRead(messageId);
          continue;
        }
        const isInternalSender = INTERNAL_DOMAINS.some((domain) => senderEmail.endsWith(`@${domain}`));

        const vendorDoc = await ctx.runQuery(
          internal.vendors.getByContactEmail,
          { email: senderEmail }
        );
        const vendorLookup = vendorDoc
          ? { vendorId: vendorDoc._id as string, vendorName: vendorDoc.name }
          : null;

        // Look up existing thread
        const existingThread = await ctx.runQuery(
          internal.emailThreads.getByGmailThreadId,
          { gmailThreadId: parsed.threadId }
        );
        const threadContext = existingThread
          ? { linkedSiteIds: existingThread.linkedSiteIds as string[] }
          : null;

        // Get all site addresses for matching
        const siteAddresses = await ctx.runQuery(internal.sites.listAllAddresses);

        // Resolve context
        const context = resolveContext(
          parsed,
          vendorLookup,
          threadContext,
          siteAddresses.map((s: { id: Id<"sites">; normalizedAddress: string }) => ({
            id: s.id as string,
            normalizedAddress: s.normalizedAddress,
          }))
        );

        // Classify
        const classification = await classify(
          parsed,
          vendorDoc?.category ?? null
        );

        // Merge extracted entities
        const mergedEntities = {
          ...classification.extractedEntities,
          ...context.extractedEntities,
        };

        // Auto-detect new partner if sender is external and not already matched
        const PARTNER_LIKE_TYPES = [
          "vendor_scheduling", "vendor_completion", "vendor_question",
          "vendor_invoice", "inspection_report",
        ];
        let autoDetectedVendorId: Id<"vendors"> | undefined;
        if (
          !vendorDoc &&
          !INTERNAL_DOMAINS.some((d) => senderEmail.endsWith(`@${d}`)) &&
          !SKIP_SENDERS.some((p) =>
            p.includes("@")
              ? senderEmail === p || senderEmail.endsWith(p)
              : senderEmail.includes(p)
          ) &&
          PARTNER_LIKE_TYPES.includes(classification.classificationType)
        ) {
          const displayName = parsed.from.match(/^"?([^"<]+)"?\s*</)?.[1]?.trim()
            ?? senderEmail.split("@")[0];
          autoDetectedVendorId = await ctx.runMutation(
            internal.vendors.autoCreate,
            { name: displayName, email: senderEmail, category: "other" }
          );
        }

        const resolvedVendorId = (context.matchedVendorId as Id<"vendors">)
          ?? autoDetectedVendorId
          ?? undefined;

        const resolvedSiteIds = Array.from(
          new Set([
            ...(context.matchedSiteIds as Id<"sites">[]),
            ...(
              !context.matchedSiteIds.length && existingThread?.linkedSiteIds.length === 1
                ? existingThread.linkedSiteIds
                : []
            ),
          ])
        );

        // Create classification record
        await ctx.runMutation(internal.emailClassifications.create, {
          gmailMessageId: messageId,
          rfcMessageId: parsed.gmailMessageId,
          threadId: parsed.threadId,
          from: parsed.from,
          to: parsed.to,
          cc: parsed.cc,
          subject: parsed.subject,
          bodyPreview: parsed.body.slice(0, BODY_PREVIEW_LENGTH),
          receivedAt: parsed.date.getTime(),
          classificationType: classification.classificationType,
          classificationMethod: classification.classificationMethod,
          confidence: classification.confidence,
          extractedEntities: mergedEntities,
          matchedSiteIds: resolvedSiteIds,
          matchedVendorId: resolvedVendorId,
          action: "pending",
          status: "classified",
        });

        // Upsert email thread
        const allParticipants = [
          parsed.from,
          ...parsed.to,
          ...parsed.cc,
        ].map((p) => p.toLowerCase().trim());
        const uniqueParticipants = [...new Set(allParticipants)];

        if (existingThread) {
          // Update existing thread
          const updatedSiteIds = [...new Set([
            ...existingThread.linkedSiteIds,
            ...resolvedSiteIds,
          ])];
          await ctx.runMutation(internal.emailThreads.update, {
            id: existingThread._id,
            updates: {
              lastMessageAt: parsed.date.getTime(),
              messageCount: existingThread.messageCount + 1,
              participants: [...new Set([...existingThread.participants, ...uniqueParticipants])],
              linkedSiteIds: updatedSiteIds,
              linkedVendorId: resolvedVendorId ?? existingThread.linkedVendorId,
            },
          });
        } else {
          // Create new thread
          await ctx.runMutation(internal.emailThreads.create, {
            gmailThreadId: parsed.threadId,
            subject: parsed.subject,
            participants: uniqueParticipants,
            linkedSiteIds: context.matchedSiteIds as Id<"sites">[],
            linkedVendorId: resolvedVendorId,
            state: "active",
            lastMessageAt: parsed.date.getTime(),
            messageCount: 1,
            firstMessageAt: parsed.date.getTime(),
          });
        }

        await processInboundSiteEffects(ctx, {
          messageId,
          parsed,
          classificationType: classification.classificationType,
          siteIds: resolvedSiteIds,
          isInternalSender,
        });

        // Mark as read in Gmail
        await markAsRead(messageId);

        // Audit log
        await ctx.runMutation(internal.auditLogs.create, {
          action: "email_classified",
          details: {
            gmailMessageId: messageId,
            from: parsed.from,
            subject: parsed.subject,
            classificationType: classification.classificationType,
            classificationMethod: classification.classificationMethod,
            confidence: classification.confidence,
            matchedSiteCount: resolvedSiteIds.length,
            matchedVendor: vendorLookup?.vendorName ?? null,
          },
          level: "info",
        });

        processed++;
      } catch (error) {
        const msg = `Error processing message ${messageId}: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(msg);
        errors.push(msg);
      }
    }

    logger.info(`Classification complete: ${processed} processed, ${errors.length} errors`);
    return { processed, errors };
  },
});
