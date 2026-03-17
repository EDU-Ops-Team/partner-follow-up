import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  handler: async (ctx) => {
    return ctx.db.query("reviewers").collect();
  },
});

export const getById = query({
  args: { id: v.id("reviewers") },
  handler: async (ctx, { id }) => {
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
    googleId: v.string(),
    email: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, { googleId, email, name, avatarUrl }) => {
    const existing = await ctx.db
      .query("reviewers")
      .withIndex("by_googleId", (q) => q.eq("googleId", googleId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email,
        name,
        avatarUrl,
        lastLoginAt: Date.now(),
      });
      return existing._id;
    }

    return ctx.db.insert("reviewers", {
      googleId,
      email,
      name,
      avatarUrl,
      role: "reviewer",
      lastLoginAt: Date.now(),
      createdAt: Date.now(),
    });
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
    const existing = await ctx.db
      .query("reviewers")
      .withIndex("by_googleId", (q) => q.eq("googleId", googleId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email,
        name,
        avatarUrl,
        lastLoginAt: Date.now(),
      });
      return existing._id;
    }

    return ctx.db.insert("reviewers", {
      googleId,
      email,
      name,
      avatarUrl,
      role: "reviewer",
      lastLoginAt: Date.now(),
      createdAt: Date.now(),
    });
  },
});
