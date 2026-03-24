import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
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
    let q = ctx.db.query("emailClassifications").order("desc");
    if (status) {
      q = ctx.db
        .query("emailClassifications")
        .withIndex("by_status", (idx) =>
          idx.eq(
            "status",
            status as
              | "classified"
              | "action_pending"
              | "action_taken"
              | "escalated"
              | "archived"
          )
        )
        .order("desc");
    }
    const results = await q.collect();
    return limit ? results.slice(0, limit) : results;
  },
});

export const listBySiteId = query({
  args: { siteId: v.id("sites"), apiKey: v.string() },
  handler: async (ctx, { siteId, apiKey }) => {
    requireApiKey(apiKey);
    // Full table scan is intentional: Convex cannot index array fields for
    // containment queries. A join table would be needed to avoid this scan.
    const all = await ctx.db
      .query("emailClassifications")
      .order("desc")
      .collect();
    return all.filter((c) => c.matchedSiteIds.includes(siteId));
  },
});

export const listUnmatched = query({
  args: { apiKey: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { apiKey, limit }) => {
    requireApiKey(apiKey);
    const all = await ctx.db
      .query("emailClassifications")
      .order("desc")
      .collect();
    const unmatched = all.filter(
      (c) => c.matchedSiteIds.length === 0 && c.status !== "archived"
    );
    return limit ? unmatched.slice(0, limit) : unmatched;
  },
});

export const getInboundReviewQueue = query({
  args: { apiKey: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { apiKey, limit }) => {
    requireApiKey(apiKey);
    const cappedLimit = Math.min(limit ?? 100, 500);

    const [allClassifications, allFeedback] = await Promise.all([
      ctx.db.query("emailClassifications").order("desc").collect(),
      ctx.db.query("emailClassificationFeedback").withIndex("by_reviewedAt").order("desc").collect(),
    ]);

    const latestFeedbackByClassificationId = new Map();
    for (const feedback of allFeedback) {
      const key = String(feedback.classificationId);
      if (!latestFeedbackByClassificationId.has(key)) {
        latestFeedbackByClassificationId.set(key, feedback);
      }
    }

    const feedbackItems = Array.from(latestFeedbackByClassificationId.values()).slice(0, cappedLimit);

    // Fetch all classifications and sites in parallel (avoids sequential awaits per item)
    const [classificationDocs, siteDocs] = await Promise.all([
      Promise.all(feedbackItems.map((f) => ctx.db.get(f.classificationId))),
      Promise.all(
        feedbackItems.map((f) =>
          f.correctedMatchedSiteIds[0]
            ? ctx.db.get(f.correctedMatchedSiteIds[0])
            : Promise.resolve(null)
        )
      ),
    ]);

    const reviewedFromFeedback = feedbackItems
      .map((feedback, i) => {
        const classification = classificationDocs[i];
        if (!classification) return null;
        const siteDoc = siteDocs[i] as { _id: Id<"sites">; siteAddress: string; fullAddress?: string } | null;
        return {
          dispositionStatus: feedback.correctedMatchedSiteIds.length > 0 ? "linked" : "unmatched",
          classification,
          feedback,
          site: siteDoc
            ? {
                _id: siteDoc._id,
                siteAddress: siteDoc.siteAddress,
                fullAddress: siteDoc.fullAddress,
              }
            : null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const feedbackClassificationIds = new Set(Array.from(latestFeedbackByClassificationId.keys()));
    const pending = allClassifications
      .filter((classification) =>
        classification.matchedSiteIds.length === 0 &&
        classification.status !== "archived" &&
        !feedbackClassificationIds.has(String(classification._id))
      )
      .slice(0, cappedLimit);

    const archived = allClassifications
      .filter((classification) =>
        classification.status === "archived" &&
        classification.matchedSiteIds.length === 0 &&
        !feedbackClassificationIds.has(String(classification._id))
      )
      .slice(0, cappedLimit)
      .map((classification) => ({
        dispositionStatus: "archived",
        classification,
        feedback: null,
        site: null,
      }));

    const reviewed = [...reviewedFromFeedback, ...archived];

    const correctedLabelCounts = new Map();
    for (const item of reviewed) {
      if (!item.feedback) continue;
      const key = item.feedback.correctedClassificationType;
      correctedLabelCounts.set(key, (correctedLabelCounts.get(key) ?? 0) + 1);
    }

    const topCorrectedLabels = Array.from(correctedLabelCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([label, count]) => ({ label, count }));

    return {
      pending,
      reviewed,
      insights: {
        pendingCount: pending.length,
        linkedCount: reviewed.filter((item) => item.dispositionStatus === "linked").length,
        unmatchedReviewedCount: reviewed.filter((item) => item.dispositionStatus === "unmatched").length,
        archivedCount: reviewed.filter((item) => item.dispositionStatus === "archived").length,
        topCorrectedLabels,
      },
    };
  },
});

export const getFeedbackInsights = query({
  args: { apiKey: v.string() },
  handler: async (ctx, { apiKey }) => {
    requireApiKey(apiKey);

    const [classifications, feedback] = await Promise.all([
      ctx.db.query("emailClassifications").collect(),
      ctx.db.query("emailClassificationFeedback").collect(),
    ]);

    const latestFeedbackByClassificationId = new Map<string, (typeof feedback)[number]>();
    for (const item of feedback.sort((a, b) => b.reviewedAt - a.reviewedAt)) {
      const key = String(item.classificationId);
      if (!latestFeedbackByClassificationId.has(key)) {
        latestFeedbackByClassificationId.set(key, item);
      }
    }

    const reviewed = Array.from(latestFeedbackByClassificationId.values());
    const pendingReviewCount = classifications.filter(
      (classification) =>
        classification.matchedSiteIds.length === 0 &&
        classification.status !== "archived" &&
        !latestFeedbackByClassificationId.has(String(classification._id))
    ).length;

    const correctionPairCounts = new Map<string, { original: string; corrected: string; count: number }>();
    let siteLinkedCount = 0;
    let stayedUnmatchedCount = 0;

    for (const item of reviewed) {
      const pairKey = `${item.originalClassificationType}->${item.correctedClassificationType}`;
      const current = correctionPairCounts.get(pairKey) ?? {
        original: item.originalClassificationType,
        corrected: item.correctedClassificationType,
        count: 0,
      };
      current.count += 1;
      correctionPairCounts.set(pairKey, current);

      if (item.correctedMatchedSiteIds.length > 0) {
        siteLinkedCount += 1;
      } else {
        stayedUnmatchedCount += 1;
      }
    }

    const topCorrections = Array.from(correctionPairCounts.values())
      .sort((a, b) => b.count - a.count || a.original.localeCompare(b.original) || a.corrected.localeCompare(b.corrected))
      .slice(0, 5);

    const recentUnmatched = reviewed
      .filter((item) => item.correctedMatchedSiteIds.length === 0)
      .sort((a, b) => b.reviewedAt - a.reviewedAt)
      .slice(0, 5)
      .map((item) => ({
        originalClassificationType: item.originalClassificationType,
        correctedClassificationType: item.correctedClassificationType,
        note: item.note ?? null,
        reviewedBy: item.reviewedBy,
        reviewedAt: item.reviewedAt,
      }));

    return {
      pendingReviewCount,
      reviewedCount: reviewed.length,
      siteLinkedCount,
      stayedUnmatchedCount,
      topCorrections,
      recentUnmatched,
    };
  },
});

export const archive = mutation({
  args: { id: v.id("emailClassifications"), apiKey: v.string() },
  handler: async (ctx, { id, apiKey }) => {
    requireApiKey(apiKey);
    await ctx.db.patch(id, { status: "archived" });
  },
});

export const applyFeedback = mutation({
  args: {
    id: v.id("emailClassifications"),
    apiKey: v.string(),
    correctedClassificationType: v.string(),
    correctedMatchedSiteIds: v.array(v.id("sites")),
    note: v.optional(v.string()),
    reviewedBy: v.string(),
  },
  handler: async (ctx, { id, apiKey, correctedClassificationType, correctedMatchedSiteIds, note, reviewedBy }) => {
    requireApiKey(apiKey);

    const classification = await ctx.db.get(id);
    if (!classification) {
      throw new Error("Classification not found");
    }

    const appliedAt = Date.now();

    await ctx.db.insert("emailClassificationFeedback", {
      classificationId: classification._id,
      gmailMessageId: classification.gmailMessageId,
      threadId: classification.threadId,
      originalClassificationType: classification.classificationType,
      correctedClassificationType,
      originalMatchedSiteIds: classification.matchedSiteIds,
      correctedMatchedSiteIds,
      note,
      reviewedBy,
      reviewedAt: appliedAt,
      appliedAt,
    });

    await ctx.db.patch(classification._id, {
      classificationType: correctedClassificationType,
      matchedSiteIds: correctedMatchedSiteIds,
      status: "classified",
      action: "pending",
      decisionLogId: undefined,
    });

    const thread = await ctx.db
      .query("emailThreads")
      .withIndex("by_gmailThreadId", (q) => q.eq("gmailThreadId", classification.threadId))
      .first();

    if (thread) {
      await ctx.db.patch(thread._id, {
        linkedSiteIds: Array.from(new Set([...thread.linkedSiteIds, ...correctedMatchedSiteIds])),
      });
    }

    for (const siteId of correctedMatchedSiteIds) {
      const site = await ctx.db.get(siteId);
      if (!site) continue;

      const triggerEmail = {
        emailId: classification.gmailMessageId,
        threadId: classification.threadId,
        messageId: classification.rfcMessageId ?? classification.gmailMessageId,
        receivedAt: classification.receivedAt,
      };
      const existingTriggers = site.triggerEmails ?? [];
      if (!existingTriggers.some((entry) => entry.emailId === triggerEmail.emailId)) {
        await ctx.db.patch(siteId, {
          triggerEmails: [...existingTriggers, triggerEmail],
        });
      }
    }

    return {
      ok: true,
      removedFromUnmatched: correctedMatchedSiteIds.length > 0,
    };
  },
});

export const applyReviewedFeedback = internalMutation({
  args: {
    appliedBy: v.optional(v.string()),
  },
  handler: async (ctx, { appliedBy }) => {
    const now = Date.now();
    const feedback = await ctx.db.query("emailClassificationFeedback").collect();
    const pending = feedback.filter((item) => !item.learningAppliedAt);

    for (const item of pending) {
      await ctx.db.patch(item._id, {
        learningAppliedAt: now,
        learningAppliedBy: appliedBy,
      });
    }

    return {
      reviewed: pending.length,
      linked: pending.filter((item) => item.correctedMatchedSiteIds.length > 0).length,
      unmatched: pending.filter((item) => item.correctedMatchedSiteIds.length === 0).length,
    };
  },
});

export const getById = query({
  args: { id: v.id("emailClassifications"), apiKey: v.string() },
  handler: async (ctx, { id, apiKey }) => {
    requireApiKey(apiKey);
    return ctx.db.get(id);
  },
});

// ── Internal Queries (for actions) ──

export const getByIdInternal = internalQuery({
  args: { classificationId: v.id("emailClassifications") },
  handler: async (ctx, { classificationId }) => {
    return ctx.db.get(classificationId);
  },
});

export const getByGmailMessageId = internalQuery({
  args: { gmailMessageId: v.string() },
  handler: async (ctx, { gmailMessageId }) => {
    return ctx.db
      .query("emailClassifications")
      .withIndex("by_gmailMessageId", (q) => q.eq("gmailMessageId", gmailMessageId))
      .first();
  },
});

export const listByThread = internalQuery({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    return ctx.db
      .query("emailClassifications")
      .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
      .collect();
  },
});

export const listPending = internalQuery({
  handler: async (ctx) => {
    return ctx.db
      .query("emailClassifications")
      .withIndex("by_status", (q) => q.eq("status", "classified"))
      .collect();
  },
});

// ── Internal Mutations (for actions) ──

export const create = internalMutation({
  args: {
    gmailMessageId: v.string(),
    rfcMessageId: v.optional(v.string()),
    threadId: v.string(),
    from: v.string(),
    to: v.array(v.string()),
    cc: v.array(v.string()),
    subject: v.string(),
    bodyPreview: v.string(),
    receivedAt: v.number(),
    classificationType: v.string(),
    classificationMethod: v.union(v.literal("rule"), v.literal("llm")),
    confidence: v.float64(),
    extractedEntities: v.optional(v.any()),
    matchedSiteIds: v.array(v.id("sites")),
    matchedVendorId: v.optional(v.id("vendors")),
    action: v.string(),
    status: v.union(
      v.literal("classified"),
      v.literal("action_pending"),
      v.literal("action_taken"),
      v.literal("escalated"),
      v.literal("archived")
    ),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("emailClassifications", args);
  },
});

export const updateStatus = internalMutation({
  args: {
    id: v.id("emailClassifications"),
    status: v.union(
      v.literal("classified"),
      v.literal("action_pending"),
      v.literal("action_taken"),
      v.literal("escalated"),
      v.literal("archived")
    ),
    action: v.optional(v.string()),
    decisionLogId: v.optional(v.id("decisionLogs")),
  },
  handler: async (ctx, { id, ...updates }) => {
    await ctx.db.patch(id, updates);
  },
});



