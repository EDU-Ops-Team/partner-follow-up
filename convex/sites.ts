import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// ── Public Queries (for dashboard) ──

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

// ── Internal Queries (for actions) ──

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

// ── Internal Mutations (for actions) ──

export const create = internalMutation({
  args: {
    siteAddress: v.string(),
    normalizedAddress: v.string(),
    responsiblePartyEmail: v.string(),
    responsiblePartyName: v.optional(v.string()),
    triggerEmailId: v.optional(v.string()),
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
      schedulingReminderCount: 0,
      bothScheduledNotified: false,
      resolved: false,
    });
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

// ── Public Mutations (for admin API) ──

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
      schedulingReminderCount: 0,
      bothScheduledNotified: false,
      resolved: false,
    });
  },
});

export const adminUpdate = mutation({
  args: {
    id: v.id("sites"),
    updates: v.any(),
  },
  handler: async (ctx, { id, updates }) => {
    await ctx.db.patch(id, updates);
    return ctx.db.get(id);
  },
});
