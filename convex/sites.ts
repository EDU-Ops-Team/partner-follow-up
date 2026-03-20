import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { normalizeAddress, similarity } from "./lib/addressNormalizer";
import { ADDRESS_MATCH_THRESHOLD } from "./lib/constants";
import { PHASE_ONE_TASK_TEMPLATES, calculateProgress, getTaskProgressValue } from "../shared/taskModel";
import { extractSiteInfo } from "./services/emailParser";
import type { ParsedEmail } from "./lib/types";
import { explainTaskSignalDetection } from "./lib/taskSignalDetection";

function toParsedEmail(message: {
  _id: string;
  externalMessageId: string;
  groupThreadId: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  bodyText: string;
  sentAt: number;
}): ParsedEmail {
  return {
    messageId: message.externalMessageId || String(message._id),
    threadId: message.groupThreadId,
    from: message.from,
    to: message.to,
    cc: message.cc,
    subject: message.subject,
    body: message.bodyText,
    date: new Date(message.sentAt),
    attachments: [],
  };
}

async function seedPhaseOneTasks(
  ctx: { db: { insert: Function; query: Function } },
  siteId: string,
  createdAt: number,
) {
  const existing = await ctx.db
    .query("tasks")
    .withIndex("by_siteId", (q: { eq: Function }) => q.eq("siteId", siteId as never))
    .collect();
  const existingKeys = new Set(existing.map((task: { partnerKey: string; taskType: string }) => `${task.partnerKey}:${task.taskType}`));

  for (const template of PHASE_ONE_TASK_TEMPLATES) {
    const key = `${template.partnerKey}:${template.taskType}`;
    if (existingKeys.has(key)) {
      continue;
    }

    const taskId = await ctx.db.insert("tasks", {
      siteId: siteId as never,
      partnerKey: template.partnerKey,
      partnerName: template.partnerName,
      taskType: template.taskType,
      milestone: template.milestone,
      state: "requested",
      stateUpdatedAt: createdAt,
      lastProgressValue: getTaskProgressValue("requested"),
      createdBy: "system",
      source: "task_template",
    });

    await ctx.db.insert("taskEvents", {
      taskId,
      siteId: siteId as never,
      toState: "requested",
      sourceType: "site_seed",
      note: "Seeded M1 task template",
      createdAt,
    });
  }
}

async function findOrCreateSiteByAddress(
  ctx: { db: { query: Function; patch: Function; insert: Function } },
  args: {
    siteAddress: string;
    normalizedAddress: string;
    responsiblePartyEmail: string;
    responsiblePartyName?: string;
    triggerEmail: {
      emailId: string;
      threadId?: string;
      messageId?: string;
      receivedAt: number;
    };
    nextCheckDate: number;
  },
) {
  const exact = await ctx.db
    .query("sites")
    .withIndex("by_normalizedAddress", (q: any) => q.eq("normalizedAddress", args.normalizedAddress))
    .first();

  if (exact) {
    const triggers = exact.triggerEmails ?? [];
    if (!triggers.some((t: any) => t.emailId === args.triggerEmail.emailId)) {
      triggers.push(args.triggerEmail);
    }
    await ctx.db.patch(exact._id, { triggerEmails: triggers });
    return { siteId: exact._id, created: false };
  }

  const allSites = await ctx.db.query("sites").collect();
  for (const site of allSites) {
    const a = args.normalizedAddress;
    const b = site.normalizedAddress;
    const isPrefix = a.startsWith(b) || b.startsWith(a);
    const isFuzzy = !isPrefix && similarity(a, b) >= ADDRESS_MATCH_THRESHOLD;
    if (isPrefix || isFuzzy) {
      const triggers = site.triggerEmails ?? [];
      if (!triggers.some((t: any) => t.emailId === args.triggerEmail.emailId)) {
        triggers.push(args.triggerEmail);
      }
      const updates: Record<string, unknown> = { triggerEmails: triggers };
      if (args.siteAddress.length > (site.siteAddress?.length ?? 0) && !site.fullAddress) {
        updates.siteAddress = args.siteAddress;
        updates.normalizedAddress = args.normalizedAddress;
      }
      await ctx.db.patch(site._id, updates);
      return { siteId: site._id, created: false };
    }
  }

  const siteId = await ctx.db.insert("sites", {
    siteAddress: args.siteAddress,
    normalizedAddress: args.normalizedAddress,
    responsiblePartyEmail: args.responsiblePartyEmail,
    responsiblePartyName: args.responsiblePartyName,
    triggerEmails: [args.triggerEmail],
    triggerDate: args.triggerEmail.receivedAt,
    nextCheckDate: args.nextCheckDate,
    phase: "scheduling",
    lidarScheduled: false,
    lidarCompleteNotified: false,
    inspectionScheduled: false,
    reportReceived: false,
    reportLinkNotified: false,
    reportReminderCount: 0,
    trackingStatus: "scheduling",
    trackingScope: "none",
    schedulingReminderCount: 0,
    bothScheduledNotified: false,
    resolved: false,
  });
  await seedPhaseOneTasks(ctx as never, siteId, args.triggerEmail.receivedAt);
  return { siteId, created: true };
}

async function findSuppressionMatch(
  ctx: { db: { query: Function } },
  args: {
    normalizedAddress: string;
    messageId?: string;
    threadId?: string;
  },
) {
  const exact = await ctx.db
    .query("siteDiscoverySuppressions")
    .withIndex("by_normalizedAddress", (q: any) => q.eq("normalizedAddress", args.normalizedAddress))
    .first();

  if (exact) {
    return exact;
  }

  const allSuppressions = await ctx.db.query("siteDiscoverySuppressions").collect();

  if (args.messageId) {
    const byMessage = allSuppressions.find((suppression: any) => suppression.sourceMessageIds.includes(args.messageId));
    if (byMessage) {
      return byMessage;
    }
  }

  if (args.threadId) {
    const byThread = allSuppressions.find((suppression: any) => suppression.sourceThreadIds.includes(args.threadId));
    if (byThread) {
      return byThread;
    }
  }

  return allSuppressions.find((suppression: any) => {
    const a = args.normalizedAddress;
    const b = suppression.normalizedAddress;
    const isPrefix = a.startsWith(b) || b.startsWith(a);
    const isFuzzy = !isPrefix && similarity(a, b) >= ADDRESS_MATCH_THRESHOLD;
    return isPrefix || isFuzzy;
  }) ?? null;
}

async function upsertDiscoverySuppression(
  ctx: { db: { insert: Function; patch: Function; query: Function } },
  args: {
    siteAddress: string;
    normalizedAddress: string;
    reason: string;
    note?: string;
    sourceMessageIds?: string[];
    sourceThreadIds?: string[];
    createdBy?: string;
    createdAt: number;
  },
) {
  const existing = await ctx.db
    .query("siteDiscoverySuppressions")
    .withIndex("by_normalizedAddress", (q: any) => q.eq("normalizedAddress", args.normalizedAddress))
    .first();

  const sourceMessageIds = Array.from(new Set(args.sourceMessageIds?.filter(Boolean) ?? []));
  const sourceThreadIds = Array.from(new Set(args.sourceThreadIds?.filter(Boolean) ?? []));

  if (!existing) {
    return ctx.db.insert("siteDiscoverySuppressions", {
      normalizedAddress: args.normalizedAddress,
      siteAddress: args.siteAddress,
      reason: args.reason,
      note: args.note,
      sourceMessageIds,
      sourceThreadIds,
      createdAt: args.createdAt,
      createdBy: args.createdBy,
    });
  }

  await ctx.db.patch(existing._id, {
    siteAddress: args.siteAddress,
    reason: args.reason,
    note: args.note ?? existing.note,
    sourceMessageIds: Array.from(new Set([...(existing.sourceMessageIds ?? []), ...sourceMessageIds])),
    sourceThreadIds: Array.from(new Set([...(existing.sourceThreadIds ?? []), ...sourceThreadIds])),
    createdBy: args.createdBy ?? existing.createdBy,
  });

  return existing._id;
}

function shouldSuppressDisposition(site: {
  recordDisposition?: string;
  recordDispositionNote?: string;
}) {
  return site.recordDisposition === "invalid" || /not applicable/i.test(site.recordDispositionNote ?? "");
}

async function recordSiteFeedback(
  ctx: { db: { insert: Function } },
  site: {
    _id: string;
    siteAddress: string;
    normalizedAddress: string;
    recordDisposition?: "confirmed" | "needs_review" | "invalid" | "unreviewed";
    recordDispositionNote?: string;
    recordDispositionBy?: string;
    recordDispositionAt?: number;
    phase: string;
    responsiblePartyEmail?: string;
    triggerEmails?: Array<{
      emailId: string;
      threadId?: string;
      messageId?: string;
    }>;
  },
  appliedAt: number,
  appliedBy?: string,
) {
  if (!site.recordDisposition || site.recordDisposition === "unreviewed") {
    return null;
  }

  return ctx.db.insert("siteRecordFeedback", {
    siteId: String(site._id),
    siteAddress: site.siteAddress,
    normalizedAddress: site.normalizedAddress,
    disposition: site.recordDisposition,
    note: site.recordDispositionNote,
    reviewedBy: site.recordDispositionBy,
    reviewedAt: site.recordDispositionAt,
    appliedAt,
    appliedBy,
    phase: site.phase,
    responsiblePartyEmail: site.responsiblePartyEmail,
    triggerEmailIds: (site.triggerEmails ?? []).map((trigger) => trigger.messageId || trigger.emailId).filter(Boolean),
    triggerThreadIds: (site.triggerEmails ?? []).map((trigger) => trigger.threadId).filter(Boolean),
  });
}

async function deleteSiteCascade(
  ctx: {
    db: {
      delete: Function;
      get: Function;
      patch: Function;
      query: Function;
    };
  },
  site: any,
) {
  const id = site._id;
  const [tasks, taskEvents, taskSignals, processedMessages, auditLogs, draftEmails, classifications, threads] =
    await Promise.all([
      ctx.db.query("tasks").withIndex("by_siteId", (q: any) => q.eq("siteId", id)).collect(),
      ctx.db.query("taskEvents").withIndex("by_siteId", (q: any) => q.eq("siteId", id)).collect(),
      ctx.db.query("taskSignals").withIndex("by_siteId", (q: any) => q.eq("siteId", id)).collect(),
      ctx.db.query("processedMessages").withIndex("by_siteId", (q: any) => q.eq("siteId", id)).collect(),
      ctx.db.query("auditLogs").withIndex("by_siteId", (q: any) => q.eq("siteId", id)).collect(),
      ctx.db.query("draftEmails").withIndex("by_siteId", (q: any) => q.eq("siteId", id)).collect(),
      ctx.db.query("emailClassifications").collect(),
      ctx.db.query("emailThreads").collect(),
    ]);

  const shouldSuppressFutureDiscovery = shouldSuppressDisposition(site);

  if (shouldSuppressFutureDiscovery) {
    await upsertDiscoverySuppression(ctx as never, {
      siteAddress: site.siteAddress,
      normalizedAddress: site.normalizedAddress,
      reason: "invalid_site_record",
      note: site.recordDispositionNote,
      sourceMessageIds: (site.triggerEmails ?? []).map((trigger: any) => trigger.messageId || trigger.emailId).filter(Boolean),
      sourceThreadIds: (site.triggerEmails ?? []).map((trigger: any) => trigger.threadId).filter(Boolean),
      createdBy: site.recordDispositionBy,
      createdAt: site.recordDispositionAt ?? Date.now(),
    });
  }

  for (const draft of draftEmails) {
    await ctx.db.patch(draft._id, { siteId: undefined });
  }

  for (const classification of classifications) {
    if (!classification.matchedSiteIds.includes(id)) {
      continue;
    }
    await ctx.db.patch(classification._id, {
      matchedSiteIds: classification.matchedSiteIds.filter((siteId: any) => siteId !== id),
    });
  }

  for (const thread of threads) {
    if (!thread.linkedSiteIds.includes(id)) {
      continue;
    }
    await ctx.db.patch(thread._id, {
      linkedSiteIds: thread.linkedSiteIds.filter((siteId: any) => siteId !== id),
    });
  }

  for (const signal of taskSignals) {
    await ctx.db.delete(signal._id);
  }
  for (const event of taskEvents) {
    await ctx.db.delete(event._id);
  }
  for (const task of tasks) {
    await ctx.db.delete(task._id);
  }
  for (const processed of processedMessages) {
    await ctx.db.delete(processed._id);
  }
  for (const log of auditLogs) {
    await ctx.db.delete(log._id);
  }

  await ctx.db.delete(id);

  return {
    deletedSiteId: id,
    deletedTaskCount: tasks.length,
    deletedTaskEventCount: taskEvents.length,
    deletedTaskSignalCount: taskSignals.length,
    deletedProcessedMessageCount: processedMessages.length,
    deletedAuditLogCount: auditLogs.length,
    unlinkedDraftCount: draftEmails.length,
    futureDiscoverySuppressed: shouldSuppressFutureDiscovery,
  };
}

// Public Queries (for dashboard)

export const list = query({
  handler: async (ctx) => {
    const sites = await ctx.db.query("sites").order("desc").collect();
    return Promise.all(
      sites.map(async (site) => {
        const tasks = await ctx.db
          .query("tasks")
          .withIndex("by_siteId", (q) => q.eq("siteId", site._id))
          .collect();
        const progress = calculateProgress(tasks);
        return {
          ...site,
          tasks,
          progress,
        };
      }),
    );
  },
});

export const getStats = query({
  handler: async (ctx) => {
    const all = await ctx.db.query("sites").collect();
    return {
      scheduling: all.filter((s) => s.phase === "scheduling").length,
      completion: all.filter((s) => s.phase === "completion").length,
      resolved: all.filter((s) => s.phase === "resolved").length,
    };
  },
});

export const getById = query({
  args: { id: v.id("sites") },
  handler: async (ctx, { id }) => {
    const site = await ctx.db.get(id);
    if (!site) return null;
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_siteId", (q) => q.eq("siteId", id))
      .collect();
    return {
      ...site,
      tasks,
      progress: calculateProgress(tasks),
    };
  },
});

// Internal Queries (for actions)

export const getByIdInternal = internalQuery({
  args: { id: v.id("sites") },
  handler: async (ctx, { id }) => {
    return ctx.db.get(id);
  },
});

export const listAllAddresses = internalQuery({
  handler: async (ctx) => {
    const all = await ctx.db.query("sites").collect();
    return all.map((s) => ({
      id: s._id,
      normalizedAddress: s.normalizedAddress,
    }));
  },
});

export const getByTriggerEmailId = internalQuery({
  args: { emailId: v.string() },
  handler: async (ctx, { emailId }) => {
    return ctx.db
      .query("sites")
      .withIndex("by_triggerEmailId", (q) => q.eq("triggerEmailId", emailId))
      .first();
  },
});

export const getDueSites = internalQuery({
  args: { phase: v.string(), now: v.number(), includeAll: v.optional(v.boolean()) },
  handler: async (ctx, { phase, now, includeAll }) => {
    const all = await ctx.db
      .query("sites")
      .withIndex("by_phase", (q) => q.eq("phase", phase as "scheduling" | "completion"))
      .collect();
    return includeAll ? all : all.filter((s) => s.nextCheckDate <= now);
  },
});

// Internal Mutations (for actions)

export const create = internalMutation({
  args: {
    siteAddress: v.string(),
    normalizedAddress: v.string(),
    responsiblePartyEmail: v.string(),
    responsiblePartyName: v.optional(v.string()),
    triggerEmailId: v.optional(v.string()),
    triggerThreadId: v.optional(v.string()),
    triggerMessageId: v.optional(v.string()),
    triggerDate: v.number(),
    nextCheckDate: v.number(),
  },
  handler: async (ctx, args) => {
    const siteId = await ctx.db.insert("sites", {
      ...args,
      phase: "scheduling",
      lidarScheduled: false,
      lidarCompleteNotified: false,
      inspectionScheduled: false,
      reportReceived: false,
      reportLinkNotified: false,
      reportReminderCount: 0,
      trackingStatus: "scheduling",
      trackingScope: "none",
      schedulingReminderCount: 0,
      bothScheduledNotified: false,
      resolved: false,
    });
    await seedPhaseOneTasks(ctx, siteId, args.triggerDate);
    return siteId;
  },
});

export const findOrCreateByAddress = internalMutation({
  args: {
    siteAddress: v.string(),
    normalizedAddress: v.string(),
    responsiblePartyEmail: v.string(),
    responsiblePartyName: v.optional(v.string()),
    triggerEmail: v.object({
      emailId: v.string(),
      threadId: v.optional(v.string()),
      messageId: v.optional(v.string()),
      receivedAt: v.number(),
    }),
    nextCheckDate: v.number(),
  },
  handler: async (ctx, args) => findOrCreateSiteByAddress(ctx as never, args),
});

export const update = internalMutation({
  args: {
    id: v.id("sites"),
    updates: v.any(),
  },
  handler: async (ctx, { id, updates }) => {
    await ctx.db.patch(id, updates);
    return ctx.db.get(id);
  },
});

export const discoverFromArchive = internalMutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit }) => {
    const [sites, messages] = await Promise.all([
      ctx.db.query("sites").collect(),
      ctx.db.query("groupMessages").collect(),
    ]);

    const siteCandidates = sites.map((site) => ({
      _id: String(site._id),
      siteAddress: site.siteAddress,
      fullAddress: site.fullAddress,
      responsiblePartyEmail: site.responsiblePartyEmail,
      inspectionContactEmail: site.inspectionContactEmail,
    }));

    const sortedMessages = [...messages]
      .sort((a, b) => a.sentAt - b.sentAt)
      .slice(0, limit ?? messages.length);

    let reviewed = 0;
    let eligible = 0;
    let created = 0;
    let matchedExisting = 0;
    let noAddress = 0;
    let suppressed = 0;

    for (const message of sortedMessages) {
      reviewed += 1;

      const explanation = explainTaskSignalDetection(siteCandidates, {
        subject: message.subject,
        bodyText: message.bodyText,
        from: message.from,
        to: message.to,
        cc: message.cc,
        attachments: message.attachments,
      });

      if (explanation.outcome !== "no_site_match") {
        continue;
      }

      eligible += 1;
      const parsed = toParsedEmail(message);
      const extracted = extractSiteInfo(parsed, { requireStrongSiteIntent: true });
      if (!extracted) {
        noAddress += 1;
        continue;
      }

      const suppression = await findSuppressionMatch(ctx as never, {
        normalizedAddress: normalizeAddress(extracted.address),
        messageId: parsed.messageId,
        threadId: parsed.threadId,
      });

      if (suppression) {
        suppressed += 1;
        continue;
      }

      const result = await findOrCreateSiteByAddress(ctx as never, {
        siteAddress: extracted.address,
        normalizedAddress: normalizeAddress(extracted.address),
        responsiblePartyEmail: extracted.responsiblePartyEmail,
        responsiblePartyName: extracted.responsiblePartyName,
        triggerEmail: {
          emailId: parsed.messageId,
          threadId: parsed.threadId,
          messageId: parsed.messageId,
          receivedAt: message.sentAt,
        },
        nextCheckDate: Date.now(),
      });

      if (result.created) {
        const createdSite = await ctx.db.get(result.siteId) as any;
        if (createdSite) {
          siteCandidates.push({
            _id: String(createdSite._id),
            siteAddress: createdSite.siteAddress,
            fullAddress: createdSite.fullAddress,
            responsiblePartyEmail: createdSite.responsiblePartyEmail,
            inspectionContactEmail: createdSite.inspectionContactEmail,
          });
        }
        created += 1;
      } else {
        matchedExisting += 1;
      }
    }

    return {
      reviewed,
      eligible,
      created,
      matchedExisting,
      noAddress,
      suppressed,
    };
  },
});

// Public Mutations (for admin API)

export const adminCreate = mutation({
  args: {
    siteAddress: v.string(),
    normalizedAddress: v.string(),
    responsiblePartyEmail: v.string(),
    responsiblePartyName: v.optional(v.string()),
    triggerDate: v.number(),
    nextCheckDate: v.number(),
  },
  handler: async (ctx, args) => {
    const siteId = await ctx.db.insert("sites", {
      ...args,
      phase: "scheduling",
      lidarScheduled: false,
      lidarCompleteNotified: false,
      inspectionScheduled: false,
      reportReceived: false,
      reportLinkNotified: false,
      reportReminderCount: 0,
      trackingStatus: "scheduling",
      trackingScope: "none",
      schedulingReminderCount: 0,
      bothScheduledNotified: false,
      resolved: false,
    });
    await seedPhaseOneTasks(ctx, siteId, args.triggerDate);
    return siteId;
  },
});

export const getByThreadId = internalQuery({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    return ctx.db
      .query("sites")
      .withIndex("by_triggerThreadId", (q) => q.eq("triggerThreadId", threadId))
      .first();
  },
});

export const getActiveThreadedSites = internalQuery({
  handler: async (ctx) => {
    const all = await ctx.db
      .query("sites")
      .filter((q) => q.neq(q.field("phase"), "resolved"))
      .collect();
    // Site has threads if legacy triggerThreadId is set OR triggerEmails has entries with threadId
    return all.filter((s) =>
      s.triggerThreadId ||
      (s.triggerEmails && s.triggerEmails.some((t) => t.threadId))
    );
  },
});

export const adminUpdate = mutation({
  args: {
    id: v.id("sites"),
    updates: v.object({
      siteAddress: v.optional(v.string()),
      fullAddress: v.optional(v.string()),
      normalizedAddress: v.optional(v.string()),
      phase: v.optional(v.union(
        v.literal("scheduling"),
        v.literal("completion"),
        v.literal("resolved")
      )),
      lidarScheduled: v.optional(v.boolean()),
      inspectionScheduled: v.optional(v.boolean()),
      reportReceived: v.optional(v.boolean()),
      reportLink: v.optional(v.string()),
      resolved: v.optional(v.boolean()),
      nextCheckDate: v.optional(v.number()),
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
    }),
  },
  handler: async (ctx, { id, updates }) => {
    // Strip undefined optional fields before patching
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) patch[key] = value;
    }
    if (Object.keys(patch).length === 0) return ctx.db.get(id);
    await ctx.db.patch(id, patch);
    return ctx.db.get(id);
  },
});

export const adminDelete = mutation({
  args: { id: v.id("sites") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

export const adminUpsertDiscoverySuppression = mutation({
  args: {
    siteAddress: v.string(),
    normalizedAddress: v.string(),
    reason: v.string(),
    note: v.optional(v.string()),
    sourceMessageIds: v.optional(v.array(v.string())),
    sourceThreadIds: v.optional(v.array(v.string())),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const suppressionId = await upsertDiscoverySuppression(ctx as never, {
      ...args,
      createdAt: Date.now(),
    });
    return ctx.db.get(suppressionId);
  },
});

export const applyDispositionFeedback = internalMutation({
  args: {
    appliedBy: v.optional(v.string()),
  },
  handler: async (ctx, { appliedBy }) => {
    const now = Date.now();
    const allSites = await ctx.db.query("sites").collect();
    const candidates = allSites.filter((site) =>
      site.recordDisposition &&
      site.recordDisposition !== "unreviewed" &&
      (!site.recordDispositionAppliedAt || (site.recordDispositionAt ?? 0) > site.recordDispositionAppliedAt)
    );

    let confirmed = 0;
    let needsReview = 0;
    let invalidDeleted = 0;

    for (const site of candidates) {
      await recordSiteFeedback(ctx as never, site as never, now, appliedBy);

      if (shouldSuppressDisposition(site)) {
        await deleteSiteCascade(ctx as never, site);
        invalidDeleted += 1;
        continue;
      }

      await ctx.db.patch(site._id, {
        recordDispositionAppliedAt: now,
        recordDispositionAppliedBy: appliedBy,
      });

      if (site.recordDisposition === "confirmed") {
        confirmed += 1;
      } else if (site.recordDisposition === "needs_review") {
        needsReview += 1;
      }
    }

    return {
      reviewed: candidates.length,
      confirmed,
      needsReview,
      invalidDeleted,
    };
  },
});

export const adminDeleteCascade = mutation({
  args: { id: v.id("sites") },
  handler: async (ctx, { id }) => {
    const site = await ctx.db.get(id);
    if (!site) {
      throw new Error("Site not found");
    }
    return deleteSiteCascade(ctx as never, site);
  },
});

