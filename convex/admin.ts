import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

function requireApiKey(apiKey: string) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) {
    throw new Error("Missing ADMIN_API_KEY");
  }
  if (apiKey !== expected) {
    throw new Error("Unauthorized");
  }
}

export const triggerCheck = action({
  args: {
    apiKey: v.string(),
    type: v.union(
      v.literal("scheduling"),
      v.literal("completion"),
      v.literal("tracking")
    ),
  },
  handler: async (ctx, { apiKey, type }) => {
    requireApiKey(apiKey);

    if (type === "tracking") {
      const scheduling = await ctx.runAction(internal.checkScheduling.run, {});
      const completion = await ctx.runAction(internal.checkCompletion.run, {});
      return {
        type,
        scheduling,
        completion,
      };
    }

    if (type === "scheduling") {
      return ctx.runAction(internal.checkScheduling.run, {});
    }

    return ctx.runAction(internal.checkCompletion.run, {});
  },
});
