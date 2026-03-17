import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
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

async function upsertReviewer(
  ctx: any,
  {
    googleId,
    email,
    name,
    avatarUrl,
  }: {
    googleId?: string;
    email: string;
    name: string;
    avatarUrl?: string;
  }
) {
  let existing = null;

  if (googleId) {
    existing = await ctx.db
      .query("reviewers")
      .withIndex("by_googleId", (q: any) => q.eq("googleId", googleId))
      .first();
  }

  if (!existing) {
    existing = await ctx.db
      .query("reviewers")
      .withIndex("by_email", (q: any) => q.eq("email", email))
      .first();
  }

  if (existing) {
    await ctx.db.patch(existing._id, {
      googleId: googleId ?? existing.googleId,
      email,
      name,
      avatarUrl,
      lastLoginAt: Date.now(),
    });
    return existing._id;
  }

  return ctx.db.insert("reviewers", {
    googleId: googleId ?? email,
    email,
    name,
    avatarUrl,
    role: "reviewer",
    lastLoginAt: Date.now(),
    createdAt: Date.now(),
  });
}

export const list = query({
  args: { apiKey: v.string() },
  handler: async (ctx, { apiKey }) => {
    requireApiKey(apiKey);
    return ctx.db.query("reviewers").collect();
  },
});

export const getById = query({
  args: { id: v.id("reviewers"), apiKey: v.string() },
  handler: async (ctx, { id, apiKey }) => {
    requireApiKey(apiKey);
    return ctx.db.get(id);
  },
});

export const getByGoogleId = internalQuery({
  args: { googleId: v.string() },
  handler: async (ctx, { googleId }) => {
    return ctx.db
      .query("reviewers")
      .withIndex("by_googleId", (q) => q.eq("googleId", googleId))
      .first();
  },
});

export const getByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    return ctx.db
      .query("reviewers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
  },
});

export const syncFromOAuth = mutation({
  args: {
    apiKey: v.string(),
    googleId: v.string(),
    email: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, { apiKey, googleId, email, name, avatarUrl }) => {
    requireApiKey(apiKey);
    return upsertReviewer(ctx, { googleId, email, name, avatarUrl });
  },
});

export const upsertFromOAuth = internalMutation({
  args: {
    googleId: v.string(),
    email: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, { googleId, email, name, avatarUrl }) => {
    return upsertReviewer(ctx, { googleId, email, name, avatarUrl });
  },
});

export const ensureFromSession = mutation({
  args: {
    apiKey: v.string(),
    googleId: v.optional(v.string()),
    email: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, { apiKey, googleId, email, name, avatarUrl }) => {
    requireApiKey(apiKey);
    return upsertReviewer(ctx, { googleId, email, name, avatarUrl });
  },
});
