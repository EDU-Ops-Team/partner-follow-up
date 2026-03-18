import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sites: defineTable({
    siteAddress: v.string(),
    fullAddress: v.optional(v.string()),       // Full address from Airtable match
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

    // Trigger emails (one site can be referenced by multiple trigger emails)
    triggerEmails: v.optional(v.array(v.object({
      emailId: v.string(),
      threadId: v.optional(v.string()),
      messageId: v.optional(v.string()),
      receivedAt: v.number(),
    }))),

    // Legacy trigger fields (kept during migration, will be removed)
    triggerEmailId: v.optional(v.string()),
    triggerThreadId: v.optional(v.string()),
    triggerMessageId: v.optional(v.string()),

    triggerDate: v.number(), // ms since epoch
    nextCheckDate: v.number(),

    // Google Drive
    driveFolderId: v.optional(v.string()),

    // LiDAR
    lidarScheduled: v.boolean(),
    lidarScheduledDatetime: v.optional(v.number()),
    lidarJobStatus: v.optional(v.string()),
    lidarDataAsOf: v.optional(v.string()),
    lidarModelUrl: v.optional(v.string()),
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
    trackingStatus: v.optional(v.union(
      v.literal("scheduling"),
      v.literal("scheduled"),
      v.literal("complete"),
      v.literal("resolved")
    )),
    trackingScope: v.optional(v.union(
      v.literal("none"),
      v.literal("lidar"),
      v.literal("inspection"),
      v.literal("both")
    )),
    lastOutreachDate: v.optional(v.number()),
    schedulingReminderCount: v.number(),
    bothScheduledNotified: v.boolean(),
    resolved: v.boolean(),
    resolvedAt: v.optional(v.number()),

    // Unified site model (email agent)
    siteType: v.optional(v.string()),
    lifecycle: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    vendorIds: v.optional(v.array(v.id("vendors"))),
    assignedDRI: v.optional(v.string()),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  })
    .index("by_phase", ["phase"])
    .index("by_triggerEmailId", ["triggerEmailId"])
    .index("by_triggerThreadId", ["triggerThreadId"])
    .index("by_normalizedAddress", ["normalizedAddress"])
    .index("by_nextCheckDate", ["nextCheckDate"])
    .index("by_resolved", ["resolved"])
    .index("by_lifecycle", ["lifecycle"]),

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

  // Email Agent Tables

  emailClassifications: defineTable({
    gmailMessageId: v.string(),
    rfcMessageId: v.optional(v.string()),
    threadId: v.string(),
    from: v.string(),
    to: v.array(v.string()),
    cc: v.array(v.string()),
    subject: v.string(),
    bodyPreview: v.string(),
    receivedAt: v.number(),
    classificationType: v.string(),
    classificationMethod: v.union(v.literal("rule"), v.literal("llm")),
    confidence: v.float64(),
    extractedEntities: v.optional(v.any()),
    matchedSiteIds: v.array(v.id("sites")),
    matchedVendorId: v.optional(v.id("vendors")),
    action: v.string(),
    status: v.union(
      v.literal("classified"),
      v.literal("action_pending"),
      v.literal("action_taken"),
      v.literal("escalated"),
      v.literal("archived")
    ),
    decisionLogId: v.optional(v.id("decisionLogs")),
  })
    .index("by_gmailMessageId", ["gmailMessageId"])
    .index("by_threadId", ["threadId"])
    .index("by_status", ["status"])
    .index("by_classificationType", ["classificationType"]),

  emailThreads: defineTable({
    gmailThreadId: v.string(),
    subject: v.string(),
    participants: v.array(v.string()),
    linkedSiteIds: v.array(v.id("sites")),
    linkedVendorId: v.optional(v.id("vendors")),
    state: v.union(
      v.literal("active"),
      v.literal("waiting_vendor"),
      v.literal("waiting_human"),
      v.literal("escalated"),
      v.literal("resolved"),
      v.literal("archived")
    ),
    lastMessageAt: v.number(),
    lastAction: v.optional(v.string()),
    nextExpectedAction: v.optional(v.string()),
    timerDeadline: v.optional(v.number()),
    messageCount: v.number(),
    firstMessageAt: v.number(),
  })
    .index("by_gmailThreadId", ["gmailThreadId"])
    .index("by_state", ["state"])
    .index("by_timerDeadline", ["timerDeadline"]),

  vendors: defineTable({
    name: v.string(),
    role: v.string(),
    category: v.union(
      v.literal("lidar"),
      v.literal("inspection"),
      v.literal("permitting"),
      v.literal("zoning"),
      v.literal("construction"),
      v.literal("it_cabling"),
      v.literal("architecture"),
      v.literal("legal"),
      v.literal("insurance"),
      v.literal("other")
    ),
    contacts: v.array(v.object({
      email: v.string(),
      name: v.optional(v.string()),
      isPrimary: v.boolean(),
    })),
    triggerConditions: v.optional(v.string()),
    geographicScope: v.optional(v.string()),
    defaultSLADays: v.optional(v.number()),
    activeSiteCount: v.number(),
    status: v.union(v.literal("active"), v.literal("inactive")),
    notes: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_category", ["category"]),

  jurisdictions: defineTable({
    entityName: v.string(),
    contactEmail: v.optional(v.string()),
    contactName: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    jurisdictionType: v.union(
      v.literal("city"),
      v.literal("county"),
      v.literal("state"),
      v.literal("federal")
    ),
    state: v.optional(v.string()),
    triggerConditions: v.optional(v.string()),
    linkedSiteIds: v.array(v.id("sites")),
    notes: v.optional(v.string()),
  })
    .index("by_state", ["state"]),

  draftEmails: defineTable({
    classificationId: v.id("emailClassifications"),
    threadId: v.optional(v.string()),
    originalTo: v.string(),
    originalCc: v.optional(v.string()),
    originalSubject: v.string(),
    originalBody: v.string(),
    sentTo: v.optional(v.string()),
    sentCc: v.optional(v.string()),
    sentSubject: v.optional(v.string()),
    sentBody: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("edited"),
      v.literal("rejected"),
      v.literal("auto_sent"),
      v.literal("expired")
    ),
    reviewedBy: v.optional(v.id("reviewers")),
    reviewedAt: v.optional(v.number()),
    editsMade: v.optional(v.boolean()),
    editDistance: v.optional(v.float64()),
    editCategories: v.optional(v.array(v.string())),
    feedbackReasons: v.optional(v.array(v.string())),
    feedbackNote: v.optional(v.string()),
    siteId: v.optional(v.id("sites")),
    vendorId: v.optional(v.id("vendors")),
    tier: v.number(),
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_classificationId", ["classificationId"])
    .index("by_siteId", ["siteId"]),

  decisionLogs: defineTable({
    classificationId: v.id("emailClassifications"),
    treeId: v.string(),
    treeVersion: v.string(),
    nodesTraversed: v.array(v.object({
      nodeId: v.string(),
      condition: v.string(),
      result: v.union(v.literal("true"), v.literal("false")),
    })),
    finalAction: v.string(),
    finalTier: v.optional(v.number()),
    executedAt: v.number(),
  })
    .index("by_classificationId", ["classificationId"]),

  classificationGates: defineTable({
    classificationType: v.string(),
    mode: v.union(
      v.literal("supervised"),
      v.literal("graduated"),
      v.literal("autonomous")
    ),
    totalReviewed: v.number(),
    totalPassed: v.number(),
    passRate: v.float64(),
    rollingWindowStart: v.number(),
    rollingWindowReviewed: v.number(),
    rollingWindowPassed: v.number(),
    rollingPassRate: v.float64(),
    lastEvaluatedAt: v.number(),
  })
    .index("by_classificationType", ["classificationType"]),

  reviewers: defineTable({
    googleId: v.string(),
    email: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
    role: v.union(v.literal("admin"), v.literal("reviewer")),
    lastLoginAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_googleId", ["googleId"])
    .index("by_email", ["email"]),
});
