import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { similarity } from "./lib/addressNormalizer";
import { ADDRESS_MATCH_THRESHOLD } from "./lib/constants";

// Public Queries (for dashboard)

export const list = query({
  handler: async (ctx) => {
    return ctx.db.query("sites").order("desc").collect();
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
    return ctx.db.get(id);
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
  args: { phase: v.string(), now: v.number() },
  handler: async (ctx, { phase, now }) => {
    const all = await ctx.db
      .query("sites")
      .withIndex("by_phase", (q) => q.eq("phase", phase as "scheduling" | "completion"))
      .collect();
    return all.filter((s) => s.nextCheckDate <= now);
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
    return ctx.db.insert("sites", {
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
  handler: async (ctx, args) => {
    // 1. Exact match on normalizedAddress index
    const exact = await ctx.db
      .query("sites")
      .withIndex("by_normalizedAddress", (q) => q.eq("normalizedAddress", args.normalizedAddress))
      .first();

    if (exact) {
      const triggers = exact.triggerEmails ?? [];
      if (!triggers.some((t) => t.emailId === args.triggerEmail.emailId)) {
        triggers.push(args.triggerEmail);
      }
      await ctx.db.patch(exact._id, { triggerEmails: triggers });
      return { siteId: exact._id, created: false };
    }

    // 2. Prefix or fuzzy match against all sites
    const allSites = await ctx.db.query("sites").collect();
    for (const site of allSites) {
      const a = args.normalizedAddress;
      const b = site.normalizedAddress;
      const isPrefix = a.startsWith(b) || b.startsWith(a);
      const isFuzzy = !isPrefix && similarity(a, b) >= ADDRESS_MATCH_THRESHOLD;
      if (isPrefix || isFuzzy) {
        const triggers = site.triggerEmails ?? [];
        if (!triggers.some((t) => t.emailId === args.triggerEmail.emailId)) {
          triggers.push(args.triggerEmail);
        }
        // Update address if new one looks more complete
        const updates: Record<string, unknown> = { triggerEmails: triggers };
        if (args.siteAddress.length > (site.siteAddress?.length ?? 0) && !site.fullAddress) {
          updates.siteAddress = args.siteAddress;
          updates.normalizedAddress = args.normalizedAddress;
        }
        await ctx.db.patch(site._id, updates);
        return { siteId: site._id, created: false };
      }
    }

    // 3. No match, create new site
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
    return { siteId, created: true };
  },
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
    return ctx.db.insert("sites", {
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

