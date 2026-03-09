"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { REPORT_REMINDER_INTERVAL_DAYS } from "./lib/constants";
import { fetchAirtableData } from "./services/airtableScraper";
import { fetchInspectionData } from "./services/googleSheets";
import { postToChat } from "./services/googleChat";
import { sendEmail } from "./services/gmail";
import { matchAddress } from "./lib/addressNormalizer";
import { addBusinessDays } from "./lib/businessDays";
import {
  lidarCompleteChat,
  reportReceivedChat,
  reportReminderChat,
  reportReminderEmail,
  siteResolvedChat,
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
          let lidarComplete = site.lidarJobStatus === "complete";
          let reportReceived = site.reportReceived;
          let reportLink = site.reportLink;
          let anyNotified = false;

          // Check Airtable for LiDAR completion
          if (!lidarComplete) {
            const match = matchAddress(site.siteAddress, airtableAddresses);
            if (match.matched && match.matchedAddress) {
              const row = airtableRows.find((r) => r.address === match.matchedAddress);
              if (row?.jobStatus && ["complete", "completed", "done", "finished"].includes(row.jobStatus.toLowerCase())) {
                lidarComplete = true;
                await ctx.runMutation(internal.sites.update, { id: site._id, updates: { lidarJobStatus: "complete" } });
              }
            }
          }

          // Check Sheets for report
          if (!reportReceived) {
            const match = matchAddress(site.siteAddress, inspectionAddresses);
            if (match.matched && match.matchedAddress) {
              const row = inspectionRows.find((r) => r.address === match.matchedAddress);
              if (row?.reportReceived) {
                reportReceived = true;
                reportLink = row.reportLink ?? reportLink;
                await ctx.runMutation(internal.sites.update, { id: site._id, updates: { reportReceived: true, reportLink: reportLink ?? undefined } });
              }
            }
          }

          // LiDAR complete notification
          if (lidarComplete && !site.lidarCompleteNotified) {
            await ctx.runMutation(internal.sites.update, { id: site._id, updates: { lidarCompleteNotified: true } });
            await postToChat(chatWebhook, lidarCompleteChat({ ...site, lidarJobStatus: "complete" }));
            await ctx.runMutation(internal.auditLogs.create, {
              siteId: site._id, action: "lidar_complete_notification", details: { message: "LiDAR scan complete" }, level: "info",
            });
            anyNotified = true;
          }

          // Report received notification
          if (reportReceived && !site.reportLinkNotified) {
            await ctx.runMutation(internal.sites.update, { id: site._id, updates: { reportLinkNotified: true } });
            await postToChat(chatWebhook, reportReceivedChat(site, reportLink ?? undefined));
            await ctx.runMutation(internal.auditLogs.create, {
              siteId: site._id, action: "report_received_notification", details: { reportLink }, level: "info",
            });
            anyNotified = true;
          }

          // Fully resolved
          if (lidarComplete && reportReceived && !site.resolved) {
            const resolved = await ctx.runMutation(internal.sites.update, {
              id: site._id, updates: { resolved: true, resolvedAt: now, phase: "resolved" },
            });
            if (resolved) {
              await postToChat(chatWebhook, siteResolvedChat(resolved));
              await ctx.runMutation(internal.auditLogs.create, {
                siteId: site._id, action: "site_resolved", details: { message: "All items complete" }, level: "info",
              });
            }
            anyNotified = true;
          }

          // Report reminder if not received
          if (!reportReceived && !anyNotified) {
            await postToChat(chatWebhook, reportReminderChat(site));
            const email = reportReminderEmail(site);
            await sendEmail(site.responsiblePartyEmail, email.subject, email.html);
            await ctx.runMutation(internal.sites.update, {
              id: site._id,
              updates: {
                reportReminderCount: site.reportReminderCount + 1,
                lastOutreachDate: now,
                nextCheckDate: addBusinessDays(new Date(now), REPORT_REMINDER_INTERVAL_DAYS).getTime(),
              },
            });
            await ctx.runMutation(internal.auditLogs.create, {
              siteId: site._id, action: "report_reminder_sent",
              details: { reminderNumber: site.reportReminderCount + 1 }, level: "info",
            });
          } else if (!lidarComplete || !reportReceived) {
            // Reschedule next check
            await ctx.runMutation(internal.sites.update, {
              id: site._id,
              updates: { nextCheckDate: addBusinessDays(new Date(now), REPORT_REMINDER_INTERVAL_DAYS).getTime() },
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
