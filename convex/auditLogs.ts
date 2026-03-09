import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    return ctx.db
      .query("auditLogs")
      .order("desc")
      .take(limit ?? 20);
  },
});

export const listBySite = query({
  args: { siteId: v.id("sites"), limit: v.optional(v.number()) },
  handler: async (ctx, { siteId, limit }) => {
    return ctx.db
      .query("auditLogs")
      .withIndex("by_siteId", (q) => q.eq("siteId", siteId))
      .order("desc")
      .take(limit ?? 20);
  },
});

export const create = internalMutation({
  args: {
    siteId: v.optional(v.id("sites")),
    action: v.string(),
    details: v.optional(v.any()),
    level: v.union(v.literal("info"), v.literal("warn"), v.literal("error")),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("auditLogs", args);
  },
});
