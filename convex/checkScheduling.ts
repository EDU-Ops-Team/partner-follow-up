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
import { sendEmail } from "./services/gmail";
import { matchAddress } from "./lib/addressNormalizer";
import { addBusinessDays, countBusinessDays } from "./lib/businessDays";
import {
  schedulingReminderChat,
  bothScheduledChat,
  schedulingReminderEmail,
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
      const now = Date.now();
      const dueSites = await ctx.runQuery(internal.sites.getDueSites, { phase: "scheduling", now });

      if (dueSites.length === 0) {
        logger.info("check-scheduling: no sites due");
        return result;
      }

      // Fetch external data
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
          let lidarScheduled = site.lidarScheduled;
          let inspectionScheduled = site.inspectionScheduled;

          // Check Airtable for LiDAR
          if (!lidarScheduled) {
            const match = matchAddress(site.siteAddress, airtableAddresses);
            if (match.matched && match.matchedAddress) {
              const row = airtableRows.find((r) => r.address === match.matchedAddress);
              if (row?.scheduledDate) {
                lidarScheduled = true;
                await ctx.runMutation(internal.sites.update, {
                  id: site._id,
                  updates: {
                    lidarScheduled: true,
                    lidarScheduledDatetime: new Date(row.scheduledDate).getTime(),
                    lidarJobStatus: row.jobStatus ?? "scheduled",
                    lidarDataAsOf: row.dataAsOf,
                  },
                });
                await ctx.runMutation(internal.auditLogs.create, {
                  siteId: site._id, action: "lidar_check",
                  details: { found: true, scheduledDate: row.scheduledDate, confidence: match.confidence },
                  level: "info",
                });
              }
            }
          }

          // Check Sheets for inspection
          if (!inspectionScheduled) {
            const match = matchAddress(site.siteAddress, inspectionAddresses);
            if (match.matched && match.matchedAddress) {
              const row = inspectionRows.find((r) => r.address === match.matchedAddress);
              if (row?.inspectionDate) {
                inspectionScheduled = true;
                await ctx.runMutation(internal.sites.update, {
                  id: site._id,
                  updates: {
                    inspectionScheduled: true,
                    inspectionDate: row.inspectionDate,
                    inspectionTime: row.inspectionTime,
                    reportDueDate: row.reportDueDate,
                    inspectionContactEmail: INSPECTION_CONTACT_EMAIL,
                    inspectionContactName: INSPECTION_CONTACT_NAME,
                  },
                });
                await ctx.runMutation(internal.auditLogs.create, {
                  siteId: site._id, action: "inspection_check",
                  details: { found: true, inspectionDate: row.inspectionDate, confidence: match.confidence },
                  level: "info",
                });
              }
            }
          }

          // Both scheduled → advance to completion phase
          if (lidarScheduled && inspectionScheduled && !site.bothScheduledNotified) {
            const updated = await ctx.runMutation(internal.sites.update, {
              id: site._id,
              updates: { lidarScheduled: true, inspectionScheduled: true, bothScheduledNotified: true, phase: "completion" },
            });
            if (updated) {
              await postToChat(chatWebhook, bothScheduledChat(updated));
              await ctx.runMutation(internal.auditLogs.create, {
                siteId: site._id, action: "both_scheduled_notification",
                details: { message: "Both LiDAR and Building Inspection scheduled" },
                level: "info",
              });
            }
          } else if (!lidarScheduled || !inspectionScheduled) {
            // Send scheduling reminder
            const daysSinceTrigger = countBusinessDays(new Date(site.triggerDate), new Date(now));
            await postToChat(chatWebhook, schedulingReminderChat(site, daysSinceTrigger));
            const email = schedulingReminderEmail(site, daysSinceTrigger);
            await sendEmail(site.responsiblePartyEmail, email.subject, email.html);

            await ctx.runMutation(internal.sites.update, {
              id: site._id,
              updates: {
                schedulingReminderCount: site.schedulingReminderCount + 1,
                lastOutreachDate: now,
                nextCheckDate: addBusinessDays(new Date(now), SCHEDULING_CHECK_INTERVAL_DAYS).getTime(),
              },
            });
            await ctx.runMutation(internal.auditLogs.create, {
              siteId: site._id, action: "scheduling_reminder_sent",
              details: { reminderNumber: site.schedulingReminderCount + 1, daysSinceTrigger },
              level: "info",
            });
          }

          result.processed++;
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          logger.error("check-scheduling: error processing site", { siteId: site._id, error: errMsg });
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
