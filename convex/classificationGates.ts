import { query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  handler: async (ctx) => {
    return ctx.db.query("classificationGates").collect();
  },
});

export const getByType = internalQuery({
  args: { classificationType: v.string() },
  handler: async (ctx, { classificationType }) => {
    return ctx.db
      .query("classificationGates")
      .withIndex("by_classificationType", (q) => q.eq("classificationType", classificationType))
      .first();
  },
});

export const upsert = internalMutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("classificationGates")
      .withIndex("by_classificationType", (q) =>
        q.eq("classificationType", args.classificationType)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        lastEvaluatedAt: Date.now(),
      });
      return existing._id;
    }

    return ctx.db.insert("classificationGates", {
      ...args,
      lastEvaluatedAt: Date.now(),
    });
  },
});
