import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

function requireApiKey(apiKey: string): void {
  const expected = process.env.REVIEW_API_KEY ?? process.env.ADMIN_API_KEY;
  if (!expected) {
    throw new Error("Server misconfigured: REVIEW_API_KEY missing");
  }
  if (apiKey !== expected) {
    throw new Error("Unauthorized");
  }
}

// ── Public Queries (for dashboard) ──

export const list = query({
  args: {
    apiKey: v.string(),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { apiKey, status, limit }) => {
    requireApiKey(apiKey);
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
  args: { id: v.id("draftEmails"), apiKey: v.string() },
  handler: async (ctx, { id, apiKey }) => {
    requireApiKey(apiKey);
    return ctx.db.get(id);
  },
});

export const listBySiteId = query({
  args: { siteId: v.id("sites"), apiKey: v.string() },
  handler: async (ctx, { siteId, apiKey }) => {
    requireApiKey(apiKey);
    return ctx.db
      .query("draftEmails")
      .withIndex("by_siteId", (q) => q.eq("siteId", siteId))
      .order("desc")
      .collect();
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

export const getByIdInternal = internalQuery({
  args: { id: v.id("draftEmails") },
  handler: async (ctx, { id }) => {
    return ctx.db.get(id);
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

// ── Public Mutations (for review dashboard) ──

export const approve = mutation({
  args: {
    id: v.id("draftEmails"),
    apiKey: v.string(),
    reviewerGoogleId: v.string(),
  },
  handler: async (ctx, { id, apiKey, reviewerGoogleId }) => {
    requireApiKey(apiKey);
    const draft = await ctx.db.get(id);
    if (!draft || draft.status !== "pending") {
      throw new Error("Draft not found or not pending");
    }

    const reviewer = await ctx.db
      .query("reviewers")
      .withIndex("by_googleId", (q) => q.eq("googleId", reviewerGoogleId))
      .first();
    if (!reviewer) throw new Error("Reviewer not found");

    await ctx.db.patch(id, {
      status: "approved",
      reviewedBy: reviewer._id,
      reviewedAt: Date.now(),
      sentTo: draft.originalTo,
      sentCc: draft.originalCc,
      sentSubject: draft.originalSubject,
      sentBody: draft.originalBody,
      editsMade: false,
    });

    await ctx.scheduler.runAfter(0, internal.sendDraftEmail.sendApproved, { id });
  },
});

export const editAndSend = mutation({
  args: {
    id: v.id("draftEmails"),
    apiKey: v.string(),
    reviewerGoogleId: v.string(),
    to: v.string(),
    cc: v.optional(v.string()),
    subject: v.string(),
    body: v.string(),
  },
  handler: async (ctx, { id, apiKey, reviewerGoogleId, to, cc, subject, body }) => {
    requireApiKey(apiKey);
    const draft = await ctx.db.get(id);
    if (!draft || draft.status !== "pending") {
      throw new Error("Draft not found or not pending");
    }

    const reviewer = await ctx.db
      .query("reviewers")
      .withIndex("by_googleId", (q) => q.eq("googleId", reviewerGoogleId))
      .first();
    if (!reviewer) throw new Error("Reviewer not found");

    const htmlBody = body.replace(/\n/g, "<br>");
    await ctx.db.patch(id, {
      status: "edited",
      reviewedBy: reviewer._id,
      reviewedAt: Date.now(),
      sentTo: to,
      sentCc: cc,
      sentSubject: subject,
      sentBody: htmlBody,
      editsMade: true,
    });

    await ctx.scheduler.runAfter(0, internal.sendDraftEmail.sendApproved, { id });
  },
});

export const reject = mutation({
  args: {
    id: v.id("draftEmails"),
    apiKey: v.string(),
    reviewerGoogleId: v.string(),
  },
  handler: async (ctx, { id, apiKey, reviewerGoogleId }) => {
    requireApiKey(apiKey);
    const draft = await ctx.db.get(id);
    if (!draft || draft.status !== "pending") {
      throw new Error("Draft not found or not pending");
    }

    const reviewer = await ctx.db
      .query("reviewers")
      .withIndex("by_googleId", (q) => q.eq("googleId", reviewerGoogleId))
      .first();
    if (!reviewer) throw new Error("Reviewer not found");

    await ctx.db.patch(id, {
      status: "rejected",
      reviewedBy: reviewer._id,
      reviewedAt: Date.now(),
    });
  },
});
