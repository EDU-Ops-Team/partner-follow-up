import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// ── Public Queries (for dashboard) ──

export const list = query({
  args: {
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { status, limit }) => {
    let q = ctx.db.query("emailClassifications").order("desc");
    if (status) {
      q = ctx.db
        .query("emailClassifications")
        .withIndex("by_status", (idx) =>
          idx.eq(
            "status",
            status as
              | "classified"
              | "action_pending"
              | "action_taken"
              | "escalated"
              | "archived"
          )
        )
        .order("desc");
    }
    const results = await q.collect();
    return limit ? results.slice(0, limit) : results;
  },
});

export const listBySiteId = query({
  args: { siteId: v.id("sites") },
  handler: async (ctx, { siteId }) => {
    const all = await ctx.db
      .query("emailClassifications")
      .order("desc")
      .collect();
    return all.filter((c) => c.matchedSiteIds.includes(siteId));
  },
});

export const listUnmatched = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const all = await ctx.db
      .query("emailClassifications")
      .order("desc")
      .collect();
    const unmatched = all.filter(
      (c) => c.matchedSiteIds.length === 0 && c.status !== "archived"
    );
    return limit ? unmatched.slice(0, limit) : unmatched;
  },
});

export const archive = mutation({
  args: { id: v.id("emailClassifications") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { status: "archived" });
  },
});

export const getById = query({
  args: { id: v.id("emailClassifications") },
  handler: async (ctx, { id }) => {
    return ctx.db.get(id);
  },
});

// ── Internal Queries (for actions) ──

export const getByIdInternal = internalQuery({
  args: { classificationId: v.id("emailClassifications") },
  handler: async (ctx, { classificationId }) => {
    return ctx.db.get(classificationId);
  },
});

export const getByGmailMessageId = internalQuery({
  args: { gmailMessageId: v.string() },
  handler: async (ctx, { gmailMessageId }) => {
    return ctx.db
      .query("emailClassifications")
      .withIndex("by_gmailMessageId", (q) => q.eq("gmailMessageId", gmailMessageId))
      .first();
  },
});

export const listByThread = internalQuery({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    return ctx.db
      .query("emailClassifications")
      .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
      .collect();
  },
});

export const listPending = internalQuery({
  handler: async (ctx) => {
    return ctx.db
      .query("emailClassifications")
      .withIndex("by_status", (q) => q.eq("status", "classified"))
      .collect();
  },
});

// ── Internal Mutations (for actions) ──

export const create = internalMutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("emailClassifications", args);
  },
});

export const updateStatus = internalMutation({
  args: {
    id: v.id("emailClassifications"),
    status: v.union(
      v.literal("classified"),
      v.literal("action_pending"),
      v.literal("action_taken"),
      v.literal("escalated"),
      v.literal("archived")
    ),
    action: v.optional(v.string()),
    decisionLogId: v.optional(v.id("decisionLogs")),
  },
  handler: async (ctx, { id, ...updates }) => {
    await ctx.db.patch(id, updates);
  },
});
