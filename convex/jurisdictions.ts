import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const jurisdictionTypeValidator = v.union(
  v.literal("city"),
  v.literal("county"),
  v.literal("state"),
  v.literal("federal")
);

export const list = query({
  args: { state: v.optional(v.string()) },
  handler: async (ctx, { state }) => {
    if (state) {
      return ctx.db
        .query("jurisdictions")
        .withIndex("by_state", (q) => q.eq("state", state))
        .collect();
    }
    return ctx.db.query("jurisdictions").collect();
  },
});

export const getById = query({
  args: { id: v.id("jurisdictions") },
  handler: async (ctx, { id }) => {
    return ctx.db.get(id);
  },
});

export const create = mutation({
  args: {
    entityName: v.string(),
    contactEmail: v.optional(v.string()),
    contactName: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    jurisdictionType: jurisdictionTypeValidator,
    state: v.optional(v.string()),
    triggerConditions: v.optional(v.string()),
    linkedSiteIds: v.array(v.id("sites")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("jurisdictions", args);
  },
});

export const update = mutation({
  args: {
    id: v.id("jurisdictions"),
    updates: v.any(),
  },
  handler: async (ctx, { id, updates }) => {
    await ctx.db.patch(id, updates);
    return ctx.db.get(id);
  },
});
