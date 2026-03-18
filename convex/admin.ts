import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

type TriggerRunResult = {
  success: boolean;
  processed: number;
  errors: string[];
};

type TriggerCheckResult =
  | TriggerRunResult
  | {
      type: "tracking";
      scheduling: TriggerRunResult;
      completion: TriggerRunResult;
    };

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
  handler: async (ctx, { apiKey, type }): Promise<TriggerCheckResult> => {
    requireApiKey(apiKey);

    if (type === "tracking") {
      const scheduling: TriggerRunResult = await ctx.runAction(internal.checkScheduling.run, {});
      const completion: TriggerRunResult = await ctx.runAction(internal.checkCompletion.run, {});
      return {
        type,
        scheduling,
        completion,
      };
    }

    if (type === "scheduling") {
      return (await ctx.runAction(internal.checkScheduling.run, {})) as TriggerRunResult;
    }

    return (await ctx.runAction(internal.checkCompletion.run, {})) as TriggerRunResult;
  },
});
