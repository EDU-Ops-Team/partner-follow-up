import { query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const getById = query({
  args: { id: v.id("decisionLogs") },
  handler: async (ctx, { id }) => {
    return ctx.db.get(id);
  },
});

export const getByClassification = internalQuery({
  args: { classificationId: v.id("emailClassifications") },
  handler: async (ctx, { classificationId }) => {
    return ctx.db
      .query("decisionLogs")
      .withIndex("by_classificationId", (q) => q.eq("classificationId", classificationId))
      .first();
  },
});

export const create = internalMutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("decisionLogs", {
      ...args,
      executedAt: Date.now(),
    });
  },
});
