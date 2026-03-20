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
    trackingUpdatedAt: v.optional(v.number()),
    lidarLastCheckedAt: v.optional(v.number()),
    inspectionLastCheckedAt: v.optional(v.number()),
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
    recordDisposition: v.optional(v.union(
      v.literal("unreviewed"),
      v.literal("confirmed"),
      v.literal("needs_review"),
      v.literal("invalid")
    )),
    recordDispositionNote: v.optional(v.string()),
    recordDispositionBy: v.optional(v.string()),
    recordDispositionAt: v.optional(v.number()),
    recordDispositionAppliedAt: v.optional(v.number()),
    recordDispositionAppliedBy: v.optional(v.string()),
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

  tasks: defineTable({
    siteId: v.id("sites"),
    partnerKey: v.string(),
    partnerName: v.string(),
    taskType: v.union(
      v.literal("sir"),
      v.literal("lidar_scan"),
      v.literal("building_inspection")
    ),
    milestone: v.literal("M1"),
    state: v.union(
      v.literal("not_started"),
      v.literal("requested"),
      v.literal("scheduled"),
      v.literal("in_progress"),
      v.literal("in_review"),
      v.literal("completed"),
      v.literal("blocked"),
      v.literal("not_needed")
    ),
    stateUpdatedAt: v.number(),
    lastProgressValue: v.float64(),
    deliverableUrl: v.optional(v.string()),
    source: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdBy: v.string(),
    scopeChanged: v.optional(v.boolean()),
  })
    .index("by_siteId", ["siteId"])
    .index("by_state", ["state"])
    .index("by_siteId_milestone", ["siteId", "milestone"])
    .index("by_site_partner_task", ["siteId", "partnerKey", "taskType"]),

  taskEvents: defineTable({
    taskId: v.id("tasks"),
    siteId: v.id("sites"),
    fromState: v.optional(v.union(
      v.literal("not_started"),
      v.literal("requested"),
      v.literal("scheduled"),
      v.literal("in_progress"),
      v.literal("in_review"),
      v.literal("completed"),
      v.literal("blocked"),
      v.literal("not_needed")
    )),
    toState: v.union(
      v.literal("not_started"),
      v.literal("requested"),
      v.literal("scheduled"),
      v.literal("in_progress"),
      v.literal("in_review"),
      v.literal("completed"),
      v.literal("blocked"),
      v.literal("not_needed")
    ),
    sourceType: v.union(
      v.literal("site_seed"),
      v.literal("site_sync"),
      v.literal("email_backfill"),
      v.literal("live_email"),
      v.literal("manual")
    ),
    sourceMessageId: v.optional(v.string()),
    approvedBy: v.optional(v.string()),
    approvedAt: v.optional(v.number()),
    note: v.optional(v.string()),
    evidence: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_taskId", ["taskId"])
    .index("by_siteId", ["siteId"]),

  groupThreads: defineTable({
    groupThreadId: v.string(),
    subject: v.string(),
    participants: v.array(v.string()),
    firstMessageAt: v.optional(v.number()),
    lastMessageAt: v.optional(v.number()),
    sourceUrl: v.optional(v.string()),
    scrapedAt: v.number(),
  })
    .index("by_groupThreadId", ["groupThreadId"]),

  groupMessages: defineTable({
    groupThreadId: v.string(),
    externalMessageId: v.string(),
    from: v.string(),
    to: v.array(v.string()),
    cc: v.array(v.string()),
    sentAt: v.number(),
    subject: v.string(),
    bodyText: v.string(),
    bodyHtml: v.optional(v.string()),
    attachments: v.optional(v.array(v.object({
      name: v.string(),
      mimeType: v.optional(v.string()),
      url: v.optional(v.string()),
    }))),
    sourceUrl: v.optional(v.string()),
    scrapedAt: v.number(),
  })
    .index("by_externalMessageId", ["externalMessageId"])
    .index("by_groupThreadId", ["groupThreadId"]),

  siteDiscoverySuppressions: defineTable({
    normalizedAddress: v.string(),
    siteAddress: v.string(),
    reason: v.string(),
    note: v.optional(v.string()),
    sourceMessageIds: v.array(v.string()),
    sourceThreadIds: v.array(v.string()),
    createdAt: v.number(),
    createdBy: v.optional(v.string()),
  })
    .index("by_normalizedAddress", ["normalizedAddress"]),

  siteRecordFeedback: defineTable({
    siteId: v.string(),
    siteAddress: v.string(),
    normalizedAddress: v.string(),
    disposition: v.union(
      v.literal("confirmed"),
      v.literal("needs_review"),
      v.literal("invalid")
    ),
    note: v.optional(v.string()),
    reviewedBy: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    appliedAt: v.number(),
    appliedBy: v.optional(v.string()),
    phase: v.string(),
    responsiblePartyEmail: v.optional(v.string()),
    triggerEmailIds: v.array(v.string()),
    triggerThreadIds: v.array(v.string()),
  })
    .index("by_disposition", ["disposition"])
    .index("by_siteId", ["siteId"]),

  taskSignals: defineTable({
    messageId: v.id("groupMessages"),
    groupThreadId: v.optional(v.string()),
    siteId: v.optional(v.id("sites")),
    partnerKey: v.optional(v.string()),
    taskType: v.optional(v.union(
      v.literal("sir"),
      v.literal("lidar_scan"),
      v.literal("building_inspection")
    )),
    proposedState: v.optional(v.union(
      v.literal("not_started"),
      v.literal("requested"),
      v.literal("scheduled"),
      v.literal("in_progress"),
      v.literal("in_review"),
      v.literal("completed"),
      v.literal("blocked"),
      v.literal("not_needed")
    )),
    currentState: v.optional(v.union(
      v.literal("not_started"),
      v.literal("requested"),
      v.literal("scheduled"),
      v.literal("in_progress"),
      v.literal("in_review"),
      v.literal("completed"),
      v.literal("blocked"),
      v.literal("not_needed")
    )),
    confidence: v.float64(),
    evidenceSnippet: v.optional(v.string()),
    detector: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("applied")
    ),
    reviewedBy: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    reviewNote: v.optional(v.string()),
    appliedTaskId: v.optional(v.id("tasks")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_messageId", ["messageId"])
    .index("by_status", ["status"])
    .index("by_siteId", ["siteId"]),
});

