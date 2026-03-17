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

const VALID_VENDOR_CATEGORIES = new Set([
  "lidar",
  "inspection",
  "permitting",
  "zoning",
  "construction",
  "it_cabling",
  "architecture",
  "legal",
  "insurance",
  "other",
] as const);

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeContacts(value: unknown): Array<{ email: string; isPrimary: boolean; name?: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  const contacts = value
    .map((contact) => {
      if (!contact || typeof contact !== "object") {
        return null;
      }

      const email = typeof contact.email === "string" ? contact.email.trim() : "";
      if (!email) {
        return null;
      }

      const normalized = {
        email,
        isPrimary: contact.isPrimary === true,
      } as { email: string; isPrimary: boolean; name?: string };

      const name = normalizeOptionalString(contact.name);
      if (name) {
        normalized.name = name;
      }
      return normalized;
    })
    .filter((contact): contact is { email: string; isPrimary: boolean; name?: string } => contact !== null);

  if (contacts.length > 0 && !contacts.some((contact) => contact.isPrimary)) {
    contacts[0].isPrimary = true;
  }

  return contacts;
}

function normalizeCategory(value: unknown): (typeof VALID_VENDOR_CATEGORIES extends Set<infer T> ? T : never) {
  return typeof value === "string" && VALID_VENDOR_CATEGORIES.has(value as never)
    ? (value as (typeof VALID_VENDOR_CATEGORIES extends Set<infer T> ? T : never))
    : "other";
}

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
    name: v.optional(v.string()),
    role: v.optional(v.string()),
    category: v.optional(vendorCategoryValidator),
    contacts: v.optional(v.array(v.object({
      email: v.string(),
      name: v.optional(v.string()),
      isPrimary: v.boolean(),
    }))),
    triggerConditions: v.optional(v.string()),
    geographicScope: v.optional(v.string()),
    defaultSLADays: v.optional(v.number()),
    notes: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
  },
  handler: async (ctx, { id, ...fields }) => {
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Vendor not found");
    }

    const replacement = {
      name: normalizeOptionalString(fields.name) ?? normalizeOptionalString(existing.name) ?? "Unknown partner",
      role: normalizeOptionalString(fields.role) ?? normalizeOptionalString(existing.role) ?? "Unknown role",
      category: normalizeCategory(fields.category ?? existing.category),
      contacts: normalizeContacts(fields.contacts ?? existing.contacts),
      triggerConditions: normalizeOptionalString(fields.triggerConditions ?? existing.triggerConditions),
      geographicScope: normalizeOptionalString(fields.geographicScope ?? existing.geographicScope),
      defaultSLADays: normalizeOptionalNumber(fields.defaultSLADays ?? existing.defaultSLADays),
      activeSiteCount: typeof existing.activeSiteCount === "number" && Number.isFinite(existing.activeSiteCount)
        ? existing.activeSiteCount
        : 0,
      status: fields.status ?? (existing.status === "inactive" ? "inactive" : "active"),
      notes: normalizeOptionalString(fields.notes ?? existing.notes),
    };

    await ctx.db.replace(id, replacement);
    return ctx.db.get(id);
  },
});

// ── Internal Mutations ──

export const autoCreate = internalMutation({
  args: {
    name: v.string(),
    email: v.string(),
    category: vendorCategoryValidator,
  },
  handler: async (ctx, { name, email, category }) => {
    // Dedup: check if any existing vendor has this email
    const normalizedEmail = email.toLowerCase().trim();
    const all = await ctx.db.query("vendors").collect();
    const existing = all.find((vendor) =>
      vendor.contacts.some((c) => c.email.toLowerCase().trim() === normalizedEmail)
    );
    if (existing) return existing._id;

    return ctx.db.insert("vendors", {
      name,
      role: "Auto-detected partner",
      category,
      contacts: [{ email: normalizedEmail, name, isPrimary: true }],
      activeSiteCount: 0,
      status: "active",
    });
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
