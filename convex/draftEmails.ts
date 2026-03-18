import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { aggregateLearningInsights } from "./lib/learningInsights";
import { analyzeReviewDiff, plainTextToHtml } from "./lib/reviewDiff";

function requireApiKey(apiKey: string): void {
  const expected = process.env.REVIEW_API_KEY ?? process.env.ADMIN_API_KEY;
  if (!expected) {
    throw new Error("Server misconfigured: REVIEW_API_KEY missing");
  }
  if (apiKey !== expected) {
    throw new Error("Unauthorized");
  }
}

async function getReviewerByIdentity(
  ctx: any,
  {
    reviewerGoogleId,
    reviewerEmail,
  }: {
    reviewerGoogleId?: string;
    reviewerEmail?: string;
  }
) {
  if (reviewerGoogleId) {
    const reviewerByGoogleId = await ctx.db
      .query("reviewers")
      .withIndex("by_googleId", (q: any) => q.eq("googleId", reviewerGoogleId))
      .first();
    if (reviewerByGoogleId) {
      return reviewerByGoogleId;
    }

    const reviewerByFallbackEmail = await ctx.db
      .query("reviewers")
      .withIndex("by_email", (q: any) => q.eq("email", reviewerGoogleId))
      .first();
    if (reviewerByFallbackEmail) {
      return reviewerByFallbackEmail;
    }
  }

  if (reviewerEmail) {
    return ctx.db
      .query("reviewers")
      .withIndex("by_email", (q: any) => q.eq("email", reviewerEmail))
      .first();
  }

  return null;
}

// Public Queries (for dashboard)

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

export const getInsights = query({
  args: { apiKey: v.string() },
  handler: async (ctx, { apiKey }) => {
    requireApiKey(apiKey);

    const drafts = await ctx.db.query("draftEmails").collect();
    const classifications = new Map(
      await Promise.all(
        Array.from(new Set(drafts.map((draft) => draft.classificationId))).map(async (id) => (
          [id, await ctx.db.get(id)] as const
        ))
      )
    );

    return aggregateLearningInsights(
      drafts.map((draft) => ({
        classificationType: classifications.get(draft.classificationId)?.classificationType ?? "unknown",
        status: draft.status,
        editsMade: draft.editsMade,
        editDistance: draft.editDistance,
        editCategories: draft.editCategories,
      }))
    );
  },
});

export const getReviewedExamples = query({
  args: {
    apiKey: v.string(),
    classificationType: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { apiKey, classificationType, limit }) => {
    requireApiKey(apiKey);

    const classifications = await ctx.db
      .query("emailClassifications")
      .withIndex("by_classificationType", (q) => q.eq("classificationType", classificationType))
      .collect();

    if (classifications.length === 0) {
      return [];
    }

    const classificationById = new Map(
      classifications.map((classification) => [classification._id, classification] as const)
    );

    const draftGroups = await Promise.all(
      classifications.map((classification) =>
        ctx.db
          .query("draftEmails")
          .withIndex("by_classificationId", (q) => q.eq("classificationId", classification._id))
          .collect()
      )
    );

    const reviewedDrafts = draftGroups
      .flat()
      .filter(
        (draft) =>
          draft.status === "approved" ||
          draft.status === "edited" ||
          draft.status === "rejected"
      )
      .sort((a, b) => (b.reviewedAt ?? b.createdAt) - (a.reviewedAt ?? a.createdAt))
      .slice(0, limit ?? 10);

    const reviewerIds = Array.from(
      new Set(
        reviewedDrafts
          .map((draft) => draft.reviewedBy)
          .filter((reviewerId): reviewerId is NonNullable<typeof reviewerId> => reviewerId !== undefined)
      )
    );
    const reviewers = new Map(
      await Promise.all(
        reviewerIds.map(async (reviewerId) => [reviewerId, await ctx.db.get(reviewerId)] as const)
      )
    );

    return reviewedDrafts.map((draft) => {
      const classification = classificationById.get(draft.classificationId);
      const reviewer = draft.reviewedBy ? reviewers.get(draft.reviewedBy) : null;
      const pass =
        draft.status !== "rejected" &&
        (draft.editDistance ?? (draft.editsMade ? 1 : 0)) <= 0.02;

      return {
        draftId: draft._id,
        classificationType,
        status: draft.status,
        pass,
        reviewedAt: draft.reviewedAt ?? draft.createdAt,
        subject: classification?.subject ?? draft.originalSubject,
        from: classification?.from ?? "Unknown sender",
        originalBody: draft.originalBody,
        sentBody: draft.sentBody ?? null,
        editDistance: draft.editDistance ?? null,
        editCategories: draft.editCategories ?? [],
        reviewerName: reviewer?.name ?? reviewer?.email ?? null,
      };
    });
  },
});

// Internal Queries (for actions)

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

// Internal Mutations (for actions)

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

// Public Mutations (for review dashboard)

export const approve = mutation({
  args: {
    id: v.id("draftEmails"),
    apiKey: v.string(),
    reviewerGoogleId: v.optional(v.string()),
    reviewerEmail: v.optional(v.string()),
  },
  handler: async (ctx, { id, apiKey, reviewerGoogleId, reviewerEmail }) => {
    requireApiKey(apiKey);
    const draft = await ctx.db.get(id);
    if (!draft || draft.status !== "pending") {
      throw new Error("Draft not found or not pending");
    }

    const reviewer = await getReviewerByIdentity(ctx, { reviewerGoogleId, reviewerEmail });
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
      editDistance: 0,
      editCategories: [],
    });

    await ctx.scheduler.runAfter(0, internal.sendDraftEmail.sendApproved, { id });
  },
});

export const editAndSend = mutation({
  args: {
    id: v.id("draftEmails"),
    apiKey: v.string(),
    reviewerGoogleId: v.optional(v.string()),
    reviewerEmail: v.optional(v.string()),
    to: v.string(),
    cc: v.optional(v.string()),
    subject: v.string(),
    body: v.string(),
  },
  handler: async (ctx, { id, apiKey, reviewerGoogleId, reviewerEmail, to, cc, subject, body }) => {
    requireApiKey(apiKey);
    const draft = await ctx.db.get(id);
    if (!draft || draft.status !== "pending") {
      throw new Error("Draft not found or not pending");
    }

    const reviewer = await getReviewerByIdentity(ctx, { reviewerGoogleId, reviewerEmail });
    if (!reviewer) throw new Error("Reviewer not found");

    const diff = analyzeReviewDiff({
      originalTo: draft.originalTo,
      originalCc: draft.originalCc,
      originalSubject: draft.originalSubject,
      originalBodyHtml: draft.originalBody,
      editedTo: to,
      editedCc: cc,
      editedSubject: subject,
      editedBodyText: body,
    });
    const htmlBody = plainTextToHtml(body);
    await ctx.db.patch(id, {
      status: diff.editsMade ? "edited" : "approved",
      reviewedBy: reviewer._id,
      reviewedAt: Date.now(),
      sentTo: to,
      sentCc: cc,
      sentSubject: subject,
      sentBody: htmlBody,
      editsMade: diff.editsMade,
      editDistance: diff.editDistance,
      editCategories: diff.editCategories,
    });

    await ctx.scheduler.runAfter(0, internal.sendDraftEmail.sendApproved, { id });
  },
});

export const reject = mutation({
  args: {
    id: v.id("draftEmails"),
    apiKey: v.string(),
    reviewerGoogleId: v.optional(v.string()),
    reviewerEmail: v.optional(v.string()),
  },
  handler: async (ctx, { id, apiKey, reviewerGoogleId, reviewerEmail }) => {
    requireApiKey(apiKey);
    const draft = await ctx.db.get(id);
    if (!draft || draft.status !== "pending") {
      throw new Error("Draft not found or not pending");
    }

    const reviewer = await getReviewerByIdentity(ctx, { reviewerGoogleId, reviewerEmail });
    if (!reviewer) throw new Error("Reviewer not found");

    await ctx.db.patch(id, {
      status: "rejected",
      reviewedBy: reviewer._id,
      reviewedAt: Date.now(),
    });
  },
});
