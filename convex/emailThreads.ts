import { query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// ── Public Queries (for dashboard) ──

export const list = query({
  args: {
    state: v.optional(v.string()),
  },
  handler: async (ctx, { state }) => {
    if (state) {
      return ctx.db
        .query("emailThreads")
        .withIndex("by_state", (q) =>
          q.eq(
            "state",
            state as
              | "active"
              | "waiting_vendor"
              | "waiting_human"
              | "escalated"
              | "resolved"
              | "archived"
          )
        )
        .order("desc")
        .collect();
    }
    return ctx.db.query("emailThreads").order("desc").collect();
  },
});

export const getById = query({
  args: { id: v.id("emailThreads") },
  handler: async (ctx, { id }) => {
    return ctx.db.get(id);
  },
});

// ── Internal Queries (for actions) ──

export const getByGmailThreadId = internalQuery({
  args: { gmailThreadId: v.string() },
  handler: async (ctx, { gmailThreadId }) => {
    return ctx.db
      .query("emailThreads")
      .withIndex("by_gmailThreadId", (q) => q.eq("gmailThreadId", gmailThreadId))
      .first();
  },
});

export const listOverdue = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const all = await ctx.db
      .query("emailThreads")
      .withIndex("by_state", (q) => q.eq("state", "waiting_vendor"))
      .collect();
    return all.filter((t) => t.timerDeadline && t.timerDeadline <= now);
  },
});

// ── Internal Mutations (for actions) ──

export const create = internalMutation({
  args: {
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
    messageCount: v.number(),
    firstMessageAt: v.number(),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("emailThreads", args);
  },
});

export const update = internalMutation({
  args: {
    id: v.id("emailThreads"),
    updates: v.any(),
  },
  handler: async (ctx, { id, updates }) => {
    await ctx.db.patch(id, updates);
  },
});
