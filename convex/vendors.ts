import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

const vendorCategoryValidator = v.union(
  v.literal("lidar"),
  v.literal("inspection"),
  v.literal("permitting"),
  v.literal("zoning"),
  v.literal("construction"),
  v.literal("it_cabling"),
  v.literal("architecture"),
  v.literal("legal"),
  v.literal("insurance"),
  v.literal("other")
);

// ── Public Queries (for dashboard) ──

export const list = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, { status }) => {
    if (status) {
      return ctx.db
        .query("vendors")
        .withIndex("by_status", (q) =>
          q.eq("status", status as "active" | "inactive")
        )
        .collect();
    }
    return ctx.db.query("vendors").collect();
  },
});

export const getById = query({
  args: { id: v.id("vendors") },
  handler: async (ctx, { id }) => {
    return ctx.db.get(id);
  },
});

// ── Internal Queries (for actions) ──

export const getByIdInternal = internalQuery({
  args: { id: v.id("vendors") },
  handler: async (ctx, { id }) => {
    return ctx.db.get(id);
  },
});

export const getByContactEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalizedEmail = email.toLowerCase().trim();
    const all = await ctx.db
      .query("vendors")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    return all.find((vendor) =>
      vendor.contacts.some((c) => c.email.toLowerCase().trim() === normalizedEmail)
    ) ?? null;
  },
});

// ── Public Mutations (for dashboard CRUD) ──

export const create = mutation({
  args: {
    name: v.string(),
    role: v.string(),
    category: vendorCategoryValidator,
    contacts: v.array(v.object({
      email: v.string(),
      name: v.optional(v.string()),
      isPrimary: v.boolean(),
    })),
    triggerConditions: v.optional(v.string()),
    geographicScope: v.optional(v.string()),
    defaultSLADays: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("vendors", {
      ...args,
      activeSiteCount: 0,
      status: "active",
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("vendors"),
    updates: v.any(),
  },
  handler: async (ctx, { id, updates }) => {
    await ctx.db.patch(id, updates);
    return ctx.db.get(id);
  },
});

// ── Seed Mutation ──

export const seed = mutation({
  args: {
    vendors: v.array(v.object({
      name: v.string(),
      role: v.string(),
      category: vendorCategoryValidator,
      contacts: v.array(v.object({
        email: v.string(),
        name: v.optional(v.string()),
        isPrimary: v.boolean(),
      })),
      triggerConditions: v.optional(v.string()),
      geographicScope: v.optional(v.string()),
      defaultSLADays: v.optional(v.number()),
      notes: v.optional(v.string()),
    })),
  },
  handler: async (ctx, { vendors }) => {
    const existing = await ctx.db.query("vendors").collect();
    const existingNames = new Set(existing.map((v) => v.name.toLowerCase()));
    let inserted = 0;
    for (const vendor of vendors) {
      if (!existingNames.has(vendor.name.toLowerCase())) {
        await ctx.db.insert("vendors", {
          ...vendor,
          activeSiteCount: 0,
          status: "active",
        });
        inserted++;
      }
    }
    return { inserted, skipped: vendors.length - inserted };
  },
});
