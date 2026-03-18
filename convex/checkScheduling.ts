"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  SCHEDULING_CHECK_INTERVAL_DAYS,
  INSPECTION_CONTACT_EMAIL,
  INSPECTION_CONTACT_NAME,
} from "./lib/constants";
import { fetchAirtableData } from "./services/airtableScraper";
import { fetchInspectionData } from "./services/googleSheets";
import { postToChat } from "./services/googleChat";
import { sendEmail, type ThreadingOptions } from "./services/agentGmail";
import { matchAddress } from "./lib/addressNormalizer";
import { addBusinessDays, countBusinessDays } from "./lib/businessDays";
import {
  schedulingReminderChat,
  bothScheduledChat,
  schedulingReminderEmail,
} from "./lib/templates";
import { logger } from "./lib/logger";
import { deriveTrackingState } from "../shared/siteTracking";

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
      const dueSites = await ctx.runQuery(internal.sites.getDueSites, { phase: "scheduling", now });

      if (dueSites.length === 0) {
        logger.info("check-scheduling: no sites due");
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
          const currentSite = { ...site };
          const pendingUpdates: Record<string, unknown> = {};
          const applyUpdates = (updates: Record<string, unknown>) => {
            Object.assign(currentSite, updates);
            Object.assign(pendingUpdates, updates);
          };

          applyUpdates({
            trackingUpdatedAt: now,
            lidarLastCheckedAt: now,
            inspectionLastCheckedAt: now,
          });

          if (!currentSite.lidarScheduled) {
            const match = matchAddress(currentSite.siteAddress, airtableAddresses);
            if (match.matched && match.matchedAddress) {
              const row = airtableRows.find((r) => r.address === match.matchedAddress);
              if (row) {
                const updates: Record<string, unknown> = {
                  fullAddress: match.matchedAddress,
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
                  action: "lidar_check",
                  details: {
                    found: true,
                    scheduledDate: row.scheduledDate,
                    scheduledTime: row.scheduledTime,
                    jobStatus: row.jobStatus,
                    confidence: match.confidence,
                  },
                  level: "info",
                });
              }
            }
          }

          if (!currentSite.inspectionScheduled) {
            const match = matchAddress(currentSite.siteAddress, inspectionAddresses);
            if (match.matched && match.matchedAddress) {
              const row = inspectionRows.find((r) => r.address === match.matchedAddress);
              if (row?.inspectionDate) {
                applyUpdates({
                  inspectionScheduled: true,
                  inspectionDate: row.inspectionDate,
                  inspectionTime: row.inspectionTime,
                  reportDueDate: row.reportDueDate,
                  inspectionContactEmail: INSPECTION_CONTACT_EMAIL,
                  inspectionContactName: INSPECTION_CONTACT_NAME,
                });
                await ctx.runMutation(internal.auditLogs.create, {
                  siteId: site._id,
                  action: "inspection_check",
                  details: {
                    found: true,
                    inspectionDate: row.inspectionDate,
                    inspectionTime: row.inspectionTime,
                    reportDueDate: row.reportDueDate,
                    confidence: match.confidence,
                  },
                  level: "info",
                });
              }
            }
          }

          applyUpdates({ ...deriveTrackingState(currentSite) });

          if (currentSite.lidarScheduled && currentSite.inspectionScheduled && !site.bothScheduledNotified) {
            applyUpdates({
              lidarScheduled: true,
              inspectionScheduled: true,
              bothScheduledNotified: true,
              phase: "completion",
            });

            const updated = Object.keys(pendingUpdates).length > 0
              ? await ctx.runMutation(internal.sites.update, {
                  id: site._id,
                  updates: pendingUpdates,
                })
              : currentSite;

            if (updated) {
              await postToChat(chatWebhook, bothScheduledChat(updated));
              await ctx.runMutation(internal.auditLogs.create, {
                siteId: site._id,
                action: "both_scheduled_notification",
                details: { message: "Both LiDAR and Building Inspection scheduled" },
                level: "info",
              });
            }
          } else {
            const updated = Object.keys(pendingUpdates).length > 0
              ? await ctx.runMutation(internal.sites.update, {
                  id: site._id,
                  updates: pendingUpdates,
                })
              : currentSite;

            if (updated) {
              Object.assign(currentSite, updated);
            }

            const daysSinceTrigger = countBusinessDays(new Date(site.triggerDate), new Date(now));
            await postToChat(chatWebhook, schedulingReminderChat(currentSite, daysSinceTrigger));
            const email = schedulingReminderEmail(currentSite, daysSinceTrigger);
            const latestTrigger = site.triggerEmails?.[site.triggerEmails.length - 1];
            const threadOpts: ThreadingOptions | undefined = (latestTrigger?.threadId ?? site.triggerThreadId) ? {
              threadId: latestTrigger?.threadId ?? site.triggerThreadId,
              inReplyTo: latestTrigger?.messageId ?? site.triggerMessageId,
              references: latestTrigger?.messageId ?? site.triggerMessageId,
            } : undefined;
            await sendEmail(currentSite.responsiblePartyEmail, email.subject, email.html, undefined, threadOpts);

            applyUpdates({
              schedulingReminderCount: site.schedulingReminderCount + 1,
              lastOutreachDate: now,
              nextCheckDate: addBusinessDays(new Date(now), SCHEDULING_CHECK_INTERVAL_DAYS).getTime(),
            });

            await ctx.runMutation(internal.sites.update, {
              id: site._id,
              updates: {
                schedulingReminderCount: currentSite.schedulingReminderCount,
                lastOutreachDate: currentSite.lastOutreachDate,
                nextCheckDate: currentSite.nextCheckDate,
              },
            });
            await ctx.runMutation(internal.auditLogs.create, {
              siteId: site._id,
              action: "scheduling_reminder_sent",
              details: {
                reminderNumber: site.schedulingReminderCount + 1,
                daysSinceTrigger,
                trackingStatus: currentSite.trackingStatus,
                trackingScope: currentSite.trackingScope,
              },
              level: "info",
            });
          }

          result.processed++;
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          logger.error("check-scheduling: error processing site", { siteId: site._id, error: errMsg });
          await ctx.runMutation(internal.auditLogs.create, {
            siteId: site._id,
            action: "check_scheduling_error",
            details: { message: errMsg },
            level: "error",
          });
          result.errors.push(`Site ${site._id}: ${errMsg}`);
        }
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("check-scheduling: fatal error", { error: errMsg });
      result.success = false;
      result.errors.push(errMsg);
    }

    return result;
  },
});



