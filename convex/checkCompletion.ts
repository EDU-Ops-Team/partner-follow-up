"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  REPORT_REMINDER_INTERVAL_DAYS,
  INSPECTION_CONTACT_EMAIL,
  INSPECTION_CONTACT_NAME,
} from "./lib/constants";
import { fetchAirtableData } from "./services/airtableScraper";
import { fetchInspectionData } from "./services/googleSheets";
import { postToChat } from "./services/googleChat";
import { sendEmail, type ThreadingOptions } from "./services/agentGmail";
import { matchAddress } from "./lib/addressNormalizer";
import { addBusinessDays } from "./lib/businessDays";
import {
  lidarCompleteChat,
  reportReceivedChat,
  reportReminderChat,
  inspectionReportReminderEmail,
  lidarCompletionReminderEmail,
  siteResolvedChat,
} from "./lib/templates";
import { logger } from "./lib/logger";
import { deriveTrackingState, isLidarComplete } from "../shared/siteTracking";

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function parseScheduledDatetime(dateValue?: string, timeValue?: string): number | undefined {
  if (!dateValue) return undefined;
  const combined = timeValue ? `${dateValue} ${timeValue}` : dateValue;
  const parsed = new Date(combined).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

export const run = internalAction({
  handler: async (ctx) => {
    const result = { success: true, processed: 0, errors: [] as string[] };

    try {
      const now = Date.now();
      const dueSites = await ctx.runQuery(internal.sites.getDueSites, { phase: "completion", now });

      if (dueSites.length === 0) {
        logger.info("check-completion: no sites due");
        return result;
      }

      const [airtableRows, inspectionRows] = await Promise.all([
        fetchAirtableData(getEnv("AIRTABLE_SHARED_VIEW_URL")).catch((err) => {
          result.errors.push(`Airtable: ${err instanceof Error ? err.message : String(err)}`);
          return [];
        }),
        fetchInspectionData(getEnv("GOOGLE_SHEET_ID"), process.env.GOOGLE_SHEET_RANGE ?? "Sheet1!A:Z").catch((err) => {
          result.errors.push(`Sheets: ${err instanceof Error ? err.message : String(err)}`);
          return [];
        }),
      ]);

      const airtableAddresses = airtableRows.map((r) => r.address);
      const inspectionAddresses = inspectionRows.map((r) => r.address);
      const chatWebhook = getEnv("GOOGLE_CHAT_WEBHOOK_URL");

      for (const site of dueSites) {
        try {
          let currentSite = { ...site };
          const pendingUpdates: Record<string, unknown> = {};
          const applyUpdates = (updates: Record<string, unknown>) => {
            Object.assign(currentSite, updates);
            Object.assign(pendingUpdates, updates);
          };

          const latestTrigger = site.triggerEmails?.[site.triggerEmails.length - 1];
          const threadOpts: ThreadingOptions | undefined = (latestTrigger?.threadId ?? site.triggerThreadId)
            ? {
                threadId: latestTrigger?.threadId ?? site.triggerThreadId,
                inReplyTo: latestTrigger?.messageId ?? site.triggerMessageId,
                references: latestTrigger?.messageId ?? site.triggerMessageId,
              }
            : undefined;

          const lidarMatch = matchAddress(currentSite.siteAddress, airtableAddresses);
          if (lidarMatch.matched && lidarMatch.matchedAddress) {
            const row = airtableRows.find((r) => r.address === lidarMatch.matchedAddress);
            if (row) {
              const updates: Record<string, unknown> = {
                fullAddress: lidarMatch.matchedAddress,
              };
              if (row.jobStatus) updates.lidarJobStatus = row.jobStatus;
              if (row.dataAsOf) updates.lidarDataAsOf = row.dataAsOf;
              if (row.modelUrl) updates.lidarModelUrl = row.modelUrl;

              const scheduledDatetime = parseScheduledDatetime(row.scheduledDate, row.scheduledTime);
              if (row.scheduledDate) {
                updates.lidarScheduled = true;
                if (scheduledDatetime !== undefined) {
                  updates.lidarScheduledDatetime = scheduledDatetime;
                }
                if (!row.jobStatus) updates.lidarJobStatus = "scheduled";
              }

              applyUpdates(updates);
              await ctx.runMutation(internal.auditLogs.create, {
                siteId: site._id,
                action: "lidar_completion_check",
                details: {
                  found: true,
                  scheduledDate: row.scheduledDate,
                  scheduledTime: row.scheduledTime,
                  jobStatus: row.jobStatus,
                  confidence: lidarMatch.confidence,
                },
                level: "info",
              });
            }
          }

          const inspectionMatch = matchAddress(currentSite.siteAddress, inspectionAddresses);
          if (inspectionMatch.matched && inspectionMatch.matchedAddress) {
            const row = inspectionRows.find((r) => r.address === inspectionMatch.matchedAddress);
            if (row) {
              const updates: Record<string, unknown> = {
                inspectionScheduled: Boolean(row.inspectionDate) || currentSite.inspectionScheduled,
                inspectionContactEmail: INSPECTION_CONTACT_EMAIL,
                inspectionContactName: INSPECTION_CONTACT_NAME,
              };
              if (row.inspectionDate) updates.inspectionDate = row.inspectionDate;
              if (row.inspectionTime) updates.inspectionTime = row.inspectionTime;
              if (row.reportDueDate) updates.reportDueDate = row.reportDueDate;
              if (row.reportReceived) updates.reportReceived = true;
              if (row.reportLink) updates.reportLink = row.reportLink;

              applyUpdates(updates);
              await ctx.runMutation(internal.auditLogs.create, {
                siteId: site._id,
                action: "inspection_completion_check",
                details: {
                  found: true,
                  inspectionDate: row.inspectionDate,
                  inspectionTime: row.inspectionTime,
                  reportDueDate: row.reportDueDate,
                  reportReceived: row.reportReceived,
                  reportLink: row.reportLink,
                  confidence: inspectionMatch.confidence,
                },
                level: "info",
              });
            }
          }

          applyUpdates({ ...deriveTrackingState(currentSite) });

          const lidarComplete = isLidarComplete(currentSite.lidarJobStatus);
          const reportReceived = Boolean(currentSite.reportReceived);

          if (lidarComplete && !site.lidarCompleteNotified) {
            applyUpdates({ lidarCompleteNotified: true });
          }

          if (reportReceived && !site.reportLinkNotified) {
            applyUpdates({ reportLinkNotified: true });
          }

          if (lidarComplete && reportReceived && !site.resolved) {
            applyUpdates({
              resolved: true,
              resolvedAt: now,
              phase: "resolved",
            });
            applyUpdates({ ...deriveTrackingState({ ...currentSite, resolved: true }) });
          }

          if (Object.keys(pendingUpdates).length > 0) {
            const updated = await ctx.runMutation(internal.sites.update, {
              id: site._id,
              updates: pendingUpdates,
            });
            if (updated) {
              currentSite = updated;
            }
          }

          let anyNotified = false;

          if (lidarComplete && !site.lidarCompleteNotified) {
            await postToChat(chatWebhook, lidarCompleteChat(currentSite));
            await ctx.runMutation(internal.auditLogs.create, {
              siteId: site._id,
              action: "lidar_complete_notification",
              details: {
                message: "LiDAR scan complete",
                trackingStatus: currentSite.trackingStatus,
                trackingScope: currentSite.trackingScope,
              },
              level: "info",
            });
            anyNotified = true;
          }

          if (reportReceived && !site.reportLinkNotified) {
            await postToChat(chatWebhook, reportReceivedChat(currentSite, currentSite.reportLink ?? undefined));
            await ctx.runMutation(internal.auditLogs.create, {
              siteId: site._id,
              action: "report_received_notification",
              details: {
                reportLink: currentSite.reportLink,
                trackingStatus: currentSite.trackingStatus,
                trackingScope: currentSite.trackingScope,
              },
              level: "info",
            });
            anyNotified = true;
          }

          if (lidarComplete && reportReceived && !site.resolved) {
            await postToChat(chatWebhook, siteResolvedChat(currentSite));
            await ctx.runMutation(internal.auditLogs.create, {
              siteId: site._id,
              action: "site_resolved",
              details: {
                message: "All items complete",
                trackingStatus: currentSite.trackingStatus,
                trackingScope: currentSite.trackingScope,
              },
              level: "info",
            });
            anyNotified = true;
          }

          const reportOverdue = currentSite.reportDueDate
            ? new Date(currentSite.reportDueDate).getTime() < now
            : false;
          const needsLidarReminder = !lidarComplete && !anyNotified;
          const needsReportReminder = !reportReceived && !anyNotified && reportOverdue;
          let sentReminder = false;
          const reminderUpdates: Record<string, unknown> = {};

          if (needsLidarReminder) {
            const email = lidarCompletionReminderEmail(currentSite);
            await sendEmail(currentSite.responsiblePartyEmail, email.subject, email.html, undefined, threadOpts);
            await ctx.runMutation(internal.auditLogs.create, {
              siteId: site._id,
              action: "lidar_completion_reminder_sent",
              details: {
                to: currentSite.responsiblePartyEmail,
                trackingStatus: currentSite.trackingStatus,
                trackingScope: currentSite.trackingScope,
              },
              level: "info",
            });
            reminderUpdates.lastOutreachDate = now;
            sentReminder = true;
          }

          if (needsReportReminder) {
            const reportTo = currentSite.inspectionContactEmail ?? INSPECTION_CONTACT_EMAIL;
            await postToChat(chatWebhook, reportReminderChat(currentSite));
            const email = inspectionReportReminderEmail(currentSite);
            await sendEmail(reportTo, email.subject, email.html, undefined, threadOpts);
            reminderUpdates.reportReminderCount = site.reportReminderCount + 1;
            reminderUpdates.lastOutreachDate = now;
            await ctx.runMutation(internal.auditLogs.create, {
              siteId: site._id,
              action: "report_reminder_sent",
              details: {
                reminderNumber: site.reportReminderCount + 1,
                to: reportTo,
                trackingStatus: currentSite.trackingStatus,
                trackingScope: currentSite.trackingScope,
              },
              level: "info",
            });
            sentReminder = true;
          }

          if (!lidarComplete || !reportReceived) {
            reminderUpdates.nextCheckDate = addBusinessDays(new Date(now), REPORT_REMINDER_INTERVAL_DAYS).getTime();
          }

          if (Object.keys(reminderUpdates).length > 0) {
            await ctx.runMutation(internal.sites.update, {
              id: site._id,
              updates: reminderUpdates,
            });
          } else if (sentReminder) {
            await ctx.runMutation(internal.sites.update, {
              id: site._id,
              updates: { lastOutreachDate: now },
            });
          }

          result.processed++;
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          logger.error("check-completion: error", { siteId: site._id, error: errMsg });
          result.errors.push(`Site ${site._id}: ${errMsg}`);
        }
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("check-completion: fatal error", { error: errMsg });
      result.success = false;
      result.errors.push(errMsg);
    }

    return result;
  },
});



