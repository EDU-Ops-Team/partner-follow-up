import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sites: defineTable({
    siteAddress: v.string(),
    normalizedAddress: v.string(),
    responsiblePartyEmail: v.string(),
    responsiblePartyName: v.optional(v.string()),
    inspectionContactEmail: v.optional(v.string()),
    inspectionContactName: v.optional(v.string()),

    phase: v.union(
      v.literal("scheduling"),
      v.literal("completion"),
      v.literal("resolved")
    ),

    triggerEmailId: v.optional(v.string()),
    triggerThreadId: v.optional(v.string()),     // Gmail thread ID
    triggerMessageId: v.optional(v.string()),    // RFC Message-ID header
    triggerDate: v.number(), // ms since epoch
    nextCheckDate: v.number(),

    // Google Drive
    driveFolderId: v.optional(v.string()),

    // LiDAR
    lidarScheduled: v.boolean(),
    lidarScheduledDatetime: v.optional(v.number()),
    lidarJobStatus: v.optional(v.string()),
    lidarDataAsOf: v.optional(v.string()),
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
    .index("by_triggerThreadId", ["triggerThreadId"])
    .index("by_normalizedAddress", ["normalizedAddress"])
    .index("by_nextCheckDate", ["nextCheckDate"])
    .index("by_resolved", ["resolved"]),

  processedMessages: defineTable({
    messageId: v.string(),
    siteId: v.id("sites"),
    threadId: v.string(),
    processedAt: v.number(),
    action: v.string(),
    details: v.optional(v.any()),
  })
    .index("by_messageId", ["messageId"])
    .index("by_siteId", ["siteId"]),

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
