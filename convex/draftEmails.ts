import { query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// ── Public Queries (for dashboard) ──

export const list = query({
  args: {
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { status, limit }) => {
    let results;
    if (status) {
      results = await ctx.db
        .query("draftEmails")
        .withIndex("by_status", (q) =>
          q.eq(
            "status",
            status as
              | "pending"
              | "approved"
              | "edited"
              | "rejected"
              | "auto_sent"
              | "expired"
          )
        )
        .order("desc")
        .collect();
    } else {
      results = await ctx.db.query("draftEmails").order("desc").collect();
    }
    return limit ? results.slice(0, limit) : results;
  },
});

export const getById = query({
  args: { id: v.id("draftEmails") },
  handler: async (ctx, { id }) => {
    return ctx.db.get(id);
  },
});

// ── Internal Queries (for actions) ──

export const listPending = internalQuery({
  handler: async (ctx) => {
    return ctx.db
      .query("draftEmails")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
  },
});

export const getByClassification = internalQuery({
  args: { classificationId: v.id("emailClassifications") },
  handler: async (ctx, { classificationId }) => {
    return ctx.db
      .query("draftEmails")
      .withIndex("by_classificationId", (q) => q.eq("classificationId", classificationId))
      .first();
  },
});

// ── Internal Mutations (for actions) ──

export const create = internalMutation({
  args: {
    classificationId: v.id("emailClassifications"),
    threadId: v.optional(v.string()),
    originalTo: v.string(),
    originalCc: v.optional(v.string()),
    originalSubject: v.string(),
    originalBody: v.string(),
    siteId: v.optional(v.id("sites")),
    vendorId: v.optional(v.id("vendors")),
    tier: v.number(),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("draftEmails", {
      ...args,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

export const updateReview = internalMutation({
  args: {
    id: v.id("draftEmails"),
    status: v.union(
      v.literal("approved"),
      v.literal("edited"),
      v.literal("rejected")
    ),
    reviewedBy: v.id("reviewers"),
    sentTo: v.optional(v.string()),
    sentCc: v.optional(v.string()),
    sentSubject: v.optional(v.string()),
    sentBody: v.optional(v.string()),
    editsMade: v.optional(v.boolean()),
    editDistance: v.optional(v.float64()),
    editCategories: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { id, ...updates }) => {
    await ctx.db.patch(id, {
      ...updates,
      reviewedAt: Date.now(),
    });
  },
});
