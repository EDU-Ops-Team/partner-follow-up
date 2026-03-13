"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { executeTree, type DecisionContext } from "./services/decisionEngine";
import { populateEmail, type TemplateContext } from "./services/templateEngine";
import { logger } from "./lib/logger";
import type { Id } from "./_generated/dataModel";

export const run = internalAction({
  handler: async (ctx): Promise<{ processed: number; errors: string[] }> => {
    const errors: string[] = [];
    let processed = 0;

    // Get all classifications waiting for a decision
    const pending = await ctx.runQuery(internal.emailClassifications.listPending);

    if (pending.length === 0) {
      return { processed: 0, errors: [] };
    }

    logger.info(`Processing ${pending.length} pending classifications`);

    for (const classification of pending) {
      try {
        // Fetch site context if we have a matched site
        let siteContext: DecisionContext["site"] = undefined;
        let siteDoc = null;
        if (classification.matchedSiteIds.length > 0) {
          siteDoc = await ctx.runQuery(internal.sites.getByIdInternal, {
            id: classification.matchedSiteIds[0],
          });
          if (siteDoc) {
            siteContext = {
              phase: siteDoc.phase,
              lidarScheduled: siteDoc.lidarScheduled,
              inspectionScheduled: siteDoc.inspectionScheduled,
              reportReceived: siteDoc.reportReceived,
              reportDueDate: siteDoc.reportDueDate,
              assignedDRI: siteDoc.assignedDRI,
            };
          }
        }

        // Fetch thread context
        let threadContext: DecisionContext["thread"] = undefined;
        const thread = await ctx.runQuery(internal.emailThreads.getByGmailThreadId, {
          gmailThreadId: classification.threadId,
        });
        if (thread) {
          const daysSince = Math.floor(
            (Date.now() - thread.lastMessageAt) / (1000 * 60 * 60 * 24)
          );
          threadContext = {
            state: thread.state,
            messageCount: thread.messageCount,
            businessDaysSinceLastMessage: daysSince,
          };
        }

        // Build decision context
        const context: DecisionContext = {
          classification: {
            classificationType: classification.classificationType,
            confidence: classification.confidence,
            extractedEntities: (classification.extractedEntities as Record<string, unknown>) ?? {},
            matchedSiteIds: classification.matchedSiteIds as string[],
            matchedVendorId: classification.matchedVendorId as string | undefined,
          },
          site: siteContext,
          thread: threadContext,
        };

        // Execute the triage decision tree
        const decision = executeTree("email-triage", context);

        // Log the decision
        const logId = await ctx.runMutation(internal.decisionLogs.create, {
          classificationId: classification._id,
          treeId: decision.treeId,
          treeVersion: decision.treeVersion,
          nodesTraversed: decision.nodesTraversed,
          finalAction: decision.action,
          finalTier: decision.tier ?? undefined,
        });

        // Execute the action
        if (decision.action === "draft_reply" || decision.action === "send_template") {
          if (decision.templateId) {
            // Build template context from available data
            const templateContext: TemplateContext = {
              site: siteDoc ? {
                address: siteDoc.fullAddress ?? siteDoc.siteAddress,
                fullAddress: siteDoc.fullAddress,
                phase: siteDoc.phase,
                responsiblePartyName: siteDoc.responsiblePartyName ?? undefined,
                responsiblePartyEmail: siteDoc.responsiblePartyEmail,
                inspectionContactName: siteDoc.inspectionContactName ?? undefined,
                inspectionContactEmail: siteDoc.inspectionContactEmail ?? undefined,
                inspectionDate: siteDoc.inspectionDate ?? undefined,
                inspectionTime: siteDoc.inspectionTime ?? undefined,
                reportDueDate: siteDoc.reportDueDate ?? undefined,
                reportLink: siteDoc.reportLink ?? undefined,
                lidarJobStatus: siteDoc.lidarJobStatus ?? "Pending",
                lidarScheduledStatus: siteDoc.lidarScheduled ? "Yes" : "No",
                inspectionScheduledStatus: siteDoc.inspectionScheduled ? "Yes" : "No",
                assignedDRI: siteDoc.assignedDRI ?? undefined,
                zipCode: siteDoc.zipCode ?? undefined,
              } : undefined,
              email: {
                from: classification.from,
                subject: classification.subject,
                bodyPreview: classification.bodyPreview,
              },
            };

            // Fetch vendor info if available
            if (classification.matchedVendorId) {
              const vendor = await ctx.runQuery(internal.vendors.getByIdInternal, {
                id: classification.matchedVendorId,
              });
              if (vendor) {
                const primaryContact = vendor.contacts.find((c) => c.isPrimary) ?? vendor.contacts[0];
                templateContext.vendor = {
                  name: vendor.name,
                  contactName: primaryContact?.name,
                  contactEmail: primaryContact?.email,
                };
              }
            }

            const populated = populateEmail(decision.templateId, templateContext);
            if (populated) {
              await ctx.runMutation(internal.draftEmails.create, {
                classificationId: classification._id,
                threadId: classification.threadId,
                originalTo: populated.to,
                originalCc: populated.cc,
                originalSubject: populated.subject,
                originalBody: populated.body,
                siteId: classification.matchedSiteIds[0] ?? undefined,
                vendorId: classification.matchedVendorId ?? undefined,
                tier: decision.tier ?? 2,
              });
            }
          } else {
            // No template — create a draft placeholder for LLM generation or human drafting
            await ctx.runMutation(internal.draftEmails.create, {
              classificationId: classification._id,
              threadId: classification.threadId,
              originalTo: classification.from,
              originalCc: undefined,
              originalSubject: `Re: ${classification.subject}`,
              originalBody: `[Draft needed — ${decision.reason}]`,
              siteId: classification.matchedSiteIds[0] ?? undefined,
              vendorId: classification.matchedVendorId ?? undefined,
              tier: decision.tier ?? 2,
            });
          }

          // Update classification status
          await ctx.runMutation(internal.emailClassifications.updateStatus, {
            id: classification._id,
            status: "action_pending",
            action: decision.action,
            decisionLogId: logId,
          });
        } else if (decision.action === "escalate") {
          await ctx.runMutation(internal.emailClassifications.updateStatus, {
            id: classification._id,
            status: "escalated",
            action: "escalated",
            decisionLogId: logId,
          });
        } else if (decision.action === "archive") {
          await ctx.runMutation(internal.emailClassifications.updateStatus, {
            id: classification._id,
            status: "archived",
            action: "archived",
            decisionLogId: logId,
          });
        } else {
          // no_action
          await ctx.runMutation(internal.emailClassifications.updateStatus, {
            id: classification._id,
            status: "action_taken",
            action: "no_action",
            decisionLogId: logId,
          });
        }

        // Audit log
        await ctx.runMutation(internal.auditLogs.create, {
          siteId: classification.matchedSiteIds[0] ?? undefined,
          action: "decision_executed",
          details: {
            classificationId: classification._id,
            classificationType: classification.classificationType,
            decision: decision.action,
            tier: decision.tier,
            templateId: decision.templateId,
            reason: decision.reason,
            treeId: decision.treeId,
          },
          level: "info",
        });

        processed++;
      } catch (error) {
        const msg = `Error processing classification ${classification._id}: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(msg);
        errors.push(msg);
      }
    }

    logger.info(`Decisions complete: ${processed} processed, ${errors.length} errors`);
    return { processed, errors };
  },
});
