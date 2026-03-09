import { mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { US_FEDERAL_HOLIDAYS } from "./lib/holidayData";

export const seed = mutation({
  handler: async (ctx) => {
    // Check if already seeded
    const existing = await ctx.db.query("holidays").first();
    if (existing) return { seeded: false, message: "Already seeded" };

    for (const h of US_FEDERAL_HOLIDAYS) {
      await ctx.db.insert("holidays", h);
    }
    return { seeded: true, count: US_FEDERAL_HOLIDAYS.length };
  },
});

export const isHoliday = internalQuery({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const result = await ctx.db
      .query("holidays")
      .withIndex("by_date", (q) => q.eq("date", date))
      .first();
    return !!result;
  },
});
