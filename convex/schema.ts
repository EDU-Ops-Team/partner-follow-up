import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sites: defineTable({
    siteAddress: v.string(),
    normalizedAddress: v.string(),
    responsiblePartyEmail: v.string(),
    responsiblePartyName: v.optional(v.string()),

    phase: v.union(
      v.literal("scheduling"),
      v.literal("completion"),
      v.literal("resolved")
    ),

    triggerEmailId: v.optional(v.string()),
    triggerDate: v.number(), // ms since epoch
    nextCheckDate: v.number(),

    // LiDAR
    lidarScheduled: v.boolean(),
    lidarScheduledDatetime: v.optional(v.number()),
    lidarJobStatus: v.optional(v.string()),
    lidarReportingRequestDate: v.optional(v.string()),
    lidarCompleteNotified: v.boolean(),

    // Inspection
    inspectionScheduled: v.boolean(),
    inspectionDate: v.optional(v.string()),
    inspectionTime: v.optional(v.string()),

    // Report
    reportDueDate: v.optional(v.string()),
    reportReceived: v.boolean(),
    reportLink: v.optional(v.string()),
    reportLinkNotified: v.boolean(),
    reportReminderCount: v.number(),

    // Status tracking
    lastOutreachDate: v.optional(v.number()),
    schedulingReminderCount: v.number(),
    bothScheduledNotified: v.boolean(),
    resolved: v.boolean(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_phase", ["phase"])
    .index("by_triggerEmailId", ["triggerEmailId"])
    .index("by_normalizedAddress", ["normalizedAddress"])
    .index("by_nextCheckDate", ["nextCheckDate"])
    .index("by_resolved", ["resolved"]),

  auditLogs: defineTable({
    siteId: v.optional(v.id("sites")),
    action: v.string(),
    details: v.optional(v.any()),
    level: v.union(v.literal("info"), v.literal("warn"), v.literal("error")),
  })
    .index("by_siteId", ["siteId"])
    .index("by_action", ["action"]),

  gmailSyncState: defineTable({
    lastHistoryId: v.optional(v.string()),
    lastCheckedAt: v.number(),
  }),

  holidays: defineTable({
    date: v.string(),
    name: v.string(),
    year: v.number(),
  }).index("by_date", ["date"]),
});
