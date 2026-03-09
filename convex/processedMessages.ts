import { query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const getByMessageId = internalQuery({
  args: { messageId: v.string() },
  handler: async (ctx, { messageId }) => {
    return ctx.db
      .query("processedMessages")
      .withIndex("by_messageId", (q) => q.eq("messageId", messageId))
      .first();
  },
});

export const create = internalMutation({
  args: {
    messageId: v.string(),
    siteId: v.id("sites"),
    threadId: v.string(),
    processedAt: v.number(),
    action: v.string(),
    details: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("processedMessages", args);
  },
});

export const listBySite = query({
  args: { siteId: v.id("sites"), limit: v.optional(v.number()) },
  handler: async (ctx, { siteId, limit }) => {
    return ctx.db
      .query("processedMessages")
      .withIndex("by_siteId", (q) => q.eq("siteId", siteId))
      .order("desc")
      .take(limit ?? 20);
  },
});
