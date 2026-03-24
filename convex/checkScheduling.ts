"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  SCHEDULING_CHECK_INTERVAL_DAYS,
  INSPECTION_CONTACT_EMAIL,
  INSPECTION_CONTACT_NAME,
} from "./lib/constants";
import { fetchAirtableData, findBestAirtableRow } from "./services/airtableScraper";
import { fetchInspectionData } from "./services/googleSheets";
import { postToChat } from "./services/googleChat";
import { sendEmail } from "./services/agentGmail";
import { populateEmail } from "./services/templateEngine";
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
  args: {
    includeAll: v.optional(v.boolean()),
  },
  handler: async (ctx, { includeAll }) => {
    const result = { success: true, processed: 0, errors: [] as string[] };

    try {
      const now = Date.now();
      const dueSites = await ctx.runQuery(internal.sites.getDueSites, { phase: "scheduling", now, includeAll });

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
      const inspectionLookupSucceeded = !result.errors.some((error) => error.startsWith("Sheets:"));
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
              const row = findBestAirtableRow(airtableRows, currentSite.siteAddress);
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

          const inspectionMatch = matchAddress(currentSite.siteAddress, inspectionAddresses);
          const inspectionRow = inspectionMatch.matched && inspectionMatch.matchedAddress
            ? inspectionRows.find((r) => r.address === inspectionMatch.matchedAddress)
            : undefined;

          if (inspectionRow?.inspectionDate) {
            applyUpdates({
              inspectionScheduled: true,
              inspectionDate: inspectionRow.inspectionDate,
              inspectionTime: inspectionRow.inspectionTime,
              reportDueDate: inspectionRow.reportDueDate,
              inspectionContactEmail: INSPECTION_CONTACT_EMAIL,
              inspectionContactName: INSPECTION_CONTACT_NAME,
            });
            await ctx.runMutation(internal.auditLogs.create, {
              siteId: site._id,
              action: "inspection_check",
              details: {
                found: true,
                inspectionDate: inspectionRow.inspectionDate,
                inspectionTime: inspectionRow.inspectionTime,
                reportDueDate: inspectionRow.reportDueDate,
                confidence: inspectionMatch.confidence,
              },
              level: "info",
            });
          } else if (
            inspectionLookupSucceeded &&
            (currentSite.inspectionScheduled || currentSite.inspectionDate || currentSite.inspectionTime || currentSite.reportDueDate)
          ) {
            applyUpdates({
              inspectionScheduled: false,
              inspectionDate: "",
              inspectionTime: "",
              reportDueDate: "",
            });
            await ctx.runMutation(internal.auditLogs.create, {
              siteId: site._id,
              action: "inspection_check",
              details: {
                found: false,
                clearedStaleInspection: true,
              },
              level: "info",
            });
          } else if (!currentSite.inspectionScheduled && inspectionMatch.matched && inspectionMatch.matchedAddress) {
            await ctx.runMutation(internal.auditLogs.create, {
              siteId: site._id,
              action: "inspection_check",
              details: {
                found: true,
                inspectionDate: inspectionRow?.inspectionDate,
                inspectionTime: inspectionRow?.inspectionTime,
                reportDueDate: inspectionRow?.reportDueDate,
                confidence: inspectionMatch.confidence,
              },
              level: "info",
            });
          } else if (!currentSite.inspectionScheduled && inspectionLookupSucceeded) {
            await ctx.runMutation(internal.auditLogs.create, {
              siteId: site._id,
              action: "inspection_check",
              details: {
                found: false,
              },
              level: "info",
            });
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
              await ctx.runMutation(internal.tasks.syncFromSite, {
                siteId: site._id,
                updatedAt: now,
              });
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
              await ctx.runMutation(internal.tasks.syncFromSite, {
                siteId: site._id,
                updatedAt: now,
              });
            }

            const latestTrigger = site.triggerEmails?.[site.triggerEmails.length - 1];
            const threadId = latestTrigger?.threadId ?? site.triggerThreadId ?? undefined;

            if (!site.initialOutreachSent) {
              // First contact — queue intro + due-diligence checklist for review
              const introContext = {
                site: {
                  address: currentSite.siteAddress,
                  fullAddress: currentSite.fullAddress,
                  responsiblePartyName: currentSite.responsiblePartyName ?? currentSite.responsiblePartyEmail,
                  responsiblePartyEmail: currentSite.responsiblePartyEmail,
                },
              };
              const intro = populateEmail("t01_landlord_questionnaire", introContext);
              if (!intro) throw new Error("Template t01_landlord_questionnaire not found");
              await ctx.runMutation(internal.draftEmails.createOutbound, {
                siteId: site._id,
                originalTo: currentSite.responsiblePartyEmail,
                originalCc: intro.cc,
                originalSubject: intro.subject,
                originalBody: intro.body,
                threadId,
                tier: 2,
              });
              applyUpdates({ initialOutreachSent: true, lastOutreachDate: now });
              await ctx.runMutation(internal.sites.update, {
                id: site._id,
                updates: { initialOutreachSent: true, lastOutreachDate: now },
              });
              await ctx.runMutation(internal.auditLogs.create, {
                siteId: site._id,
                action: "initial_outreach_queued",
                details: { to: currentSite.responsiblePartyEmail, templateId: "t01_landlord_questionnaire" },
                level: "info",
              });
            } else {
              // Subsequent runs — queue scheduling reminder for review
              const daysSinceTrigger = countBusinessDays(new Date(site.triggerDate), new Date(now));
              await postToChat(chatWebhook, schedulingReminderChat(currentSite, daysSinceTrigger));
              const email = schedulingReminderEmail(currentSite, daysSinceTrigger);
              await ctx.runMutation(internal.draftEmails.createOutbound, {
                siteId: site._id,
                originalTo: currentSite.responsiblePartyEmail,
                originalCc: email.cc,
                originalSubject: email.subject,
                originalBody: email.html,
                threadId,
                tier: 2,
              });
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
                action: "scheduling_reminder_queued",
                details: {
                  reminderNumber: site.schedulingReminderCount + 1,
                  daysSinceTrigger,
                  trackingStatus: currentSite.trackingStatus,
                  trackingScope: currentSite.trackingScope,
                },
                level: "info",
              });
            }
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



