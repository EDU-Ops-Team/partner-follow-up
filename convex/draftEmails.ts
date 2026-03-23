import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { aggregateLearningInsights } from "./lib/learningInsights";
import { analyzeReviewDiff, plainTextToHtml } from "./lib/reviewDiff";
import { REVIEW_FEEDBACK_REASONS } from "../shared/reviewFeedback";

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
              | "saved"
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
        feedbackReasons: draft.feedbackReasons,
      }))
    );
  },
});

export const getReviewQueue = query({
  args: { apiKey: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { apiKey, limit }) => {
    requireApiKey(apiKey);
    const cappedLimit = Math.min(limit ?? 200, 500);

    const allDrafts = await ctx.db.query("draftEmails").order("desc").collect();
    const classificationIds = Array.from(new Set(allDrafts.map((draft) => String(draft.classificationId))));
    const reviewerIds = Array.from(
      new Set(
        allDrafts
          .map((draft) => draft.reviewedBy)
          .filter((reviewerId): reviewerId is NonNullable<typeof reviewerId> => reviewerId !== undefined)
          .map((reviewerId) => String(reviewerId))
      )
    );

    const [classifications, reviewers] = await Promise.all([
      Promise.all(
        classificationIds.map(async (classificationId) => {
          const draft = allDrafts.find((item) => String(item.classificationId) === classificationId);
          if (!draft) return null;
          return [classificationId, await ctx.db.get(draft.classificationId)] as const;
        })
      ),
      Promise.all(
        reviewerIds.map(async (reviewerId) => {
          const draft = allDrafts.find((item) => item.reviewedBy && String(item.reviewedBy) === reviewerId);
          if (!draft?.reviewedBy) return null;
          return [reviewerId, await ctx.db.get(draft.reviewedBy)] as const;
        })
      ),
    ]);

    const classificationById = new Map(
      classifications.filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    );
    const reviewerById = new Map(
      reviewers.filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    );

    const pending = allDrafts
      .filter((draft) => draft.status === "pending")
      .slice(0, cappedLimit)
      .map((draft) => {
        const classification = classificationById.get(String(draft.classificationId));

        return {
          dispositionStatus: draft.status,
          draft,
          classificationType: classification?.classificationType ?? "unknown",
          from: classification?.from ?? null,
          reviewerName: null,
        };
      });
    const reviewed = allDrafts
      .filter((draft) => draft.status !== "pending")
      .slice(0, cappedLimit)
      .map((draft) => {
        const classification = classificationById.get(String(draft.classificationId));
        const reviewer = draft.reviewedBy ? reviewerById.get(String(draft.reviewedBy)) : null;

        return {
          dispositionStatus: draft.status,
          draft,
          classificationType: classification?.classificationType ?? "unknown",
          from: classification?.from ?? null,
          reviewerName: reviewer?.name ?? reviewer?.email ?? null,
        };
      });

    const countsByStatus = reviewed.reduce<Record<string, number>>((acc, item) => {
      acc[item.dispositionStatus] = (acc[item.dispositionStatus] ?? 0) + 1;
      return acc;
    }, {});

    const reviewedTypeCounts = reviewed.reduce<Record<string, number>>((acc, item) => {
      acc[item.classificationType] = (acc[item.classificationType] ?? 0) + 1;
      return acc;
    }, {});

    const topReviewedTypes = Object.entries(reviewedTypeCounts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([label, count]) => ({ label, count }));

    return {
      pending,
      reviewed,
      insights: {
        pendingCount: pending.length,
        reviewedCount: reviewed.length,
        countsByStatus,
        topReviewedTypes,
      },
    };
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
          draft.status === "saved" ||
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
        draft.status !== "saved" &&
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
        feedbackReasons: draft.feedbackReasons ?? [],
        feedbackNote: draft.feedbackNote ?? null,
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

export const createAutoSent = internalMutation({
  args: {
    classificationId: v.id("emailClassifications"),
    threadId: v.optional(v.string()),
    originalTo: v.string(),
    originalCc: v.optional(v.string()),
    originalSubject: v.string(),
    originalBody: v.string(),
    sentTo: v.string(),
    sentCc: v.optional(v.string()),
    sentSubject: v.string(),
    sentBody: v.string(),
    siteId: v.optional(v.id("sites")),
    vendorId: v.optional(v.id("vendors")),
    tier: v.number(),
    feedbackNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("draftEmails", {
      classificationId: args.classificationId,
      threadId: args.threadId,
      originalTo: args.originalTo,
      originalCc: args.originalCc,
      originalSubject: args.originalSubject,
      originalBody: args.originalBody,
      sentTo: args.sentTo,
      sentCc: args.sentCc,
      sentSubject: args.sentSubject,
      sentBody: args.sentBody,
      status: "auto_sent",
      siteId: args.siteId,
      vendorId: args.vendorId,
      tier: args.tier,
      editsMade: false,
      editDistance: 0,
      editCategories: [],
      feedbackReasons: [],
      feedbackNote: args.feedbackNote,
      reviewedAt: Date.now(),
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
      v.literal("saved"),
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
    feedbackReasons: v.optional(v.array(v.union(...REVIEW_FEEDBACK_REASONS.map((reason) => v.literal(reason))))),
    feedbackNote: v.optional(v.string()),
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
    feedbackNote: v.optional(v.string()),
  },
  handler: async (ctx, { id, apiKey, reviewerGoogleId, reviewerEmail, feedbackNote }) => {
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
      feedbackReasons: [],
      feedbackNote: feedbackNote?.trim() || undefined,
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
    feedbackReasons: v.optional(v.array(v.union(...REVIEW_FEEDBACK_REASONS.map((reason) => v.literal(reason))))),
    feedbackNote: v.optional(v.string()),
  },
  handler: async (ctx, { id, apiKey, reviewerGoogleId, reviewerEmail, to, cc, subject, body, feedbackReasons, feedbackNote }) => {
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
      feedbackReasons: feedbackReasons ?? [],
      feedbackNote: feedbackNote?.trim() || undefined,
    });

    await ctx.scheduler.runAfter(0, internal.sendDraftEmail.sendApproved, { id });
  },
});

export const editAndSave = mutation({
  args: {
    id: v.id("draftEmails"),
    apiKey: v.string(),
    reviewerGoogleId: v.optional(v.string()),
    reviewerEmail: v.optional(v.string()),
    to: v.string(),
    cc: v.optional(v.string()),
    subject: v.string(),
    body: v.string(),
    feedbackReasons: v.optional(v.array(v.union(...REVIEW_FEEDBACK_REASONS.map((reason) => v.literal(reason))))),
    feedbackNote: v.optional(v.string()),
  },
  handler: async (ctx, { id, apiKey, reviewerGoogleId, reviewerEmail, to, cc, subject, body, feedbackReasons, feedbackNote }) => {
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
      status: "saved",
      reviewedBy: reviewer._id,
      reviewedAt: Date.now(),
      sentTo: to,
      sentCc: cc,
      sentSubject: subject,
      sentBody: htmlBody,
      editsMade: diff.editsMade,
      editDistance: diff.editDistance,
      editCategories: diff.editCategories,
      feedbackReasons: feedbackReasons ?? [],
      feedbackNote: feedbackNote?.trim() || undefined,
    });

    return { ok: true };
  },
});

export const reject = mutation({
  args: {
    id: v.id("draftEmails"),
    apiKey: v.string(),
    reviewerGoogleId: v.optional(v.string()),
    reviewerEmail: v.optional(v.string()),
    feedbackReasons: v.array(v.union(...REVIEW_FEEDBACK_REASONS.map((reason) => v.literal(reason)))),
    feedbackNote: v.optional(v.string()),
  },
  handler: async (ctx, { id, apiKey, reviewerGoogleId, reviewerEmail, feedbackReasons, feedbackNote }) => {
    requireApiKey(apiKey);
    const draft = await ctx.db.get(id);
    if (!draft || draft.status !== "pending") {
      throw new Error("Draft not found or not pending");
    }
    if (feedbackReasons.length === 0) {
      throw new Error("At least one feedback reason is required");
    }

    const reviewer = await getReviewerByIdentity(ctx, { reviewerGoogleId, reviewerEmail });
    if (!reviewer) throw new Error("Reviewer not found");

    await ctx.db.patch(id, {
      status: "rejected",
      reviewedBy: reviewer._id,
      reviewedAt: Date.now(),
      feedbackReasons,
      feedbackNote: feedbackNote?.trim() || undefined,
    });
  },
});
