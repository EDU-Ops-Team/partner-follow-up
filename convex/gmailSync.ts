import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const get = internalQuery({
  handler: async (ctx) => {
    return ctx.db.query("gmailSyncState").first();
  },
});

export const upsert = internalMutation({
  args: {
    lastHistoryId: v.optional(v.string()),
    lastCheckedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("gmailSyncState").first();
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("gmailSyncState", args);
    }
  },
});
