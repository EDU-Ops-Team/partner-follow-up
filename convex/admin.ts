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
    }
  | {
      type: "tasks";
      siteCount: number;
      tasksCreated: number;
      tasksUpdated: number;
    }
  | {
      type: "signals";
      messageCount: number;
      created: number;
      skipped: number;
    }
  | {
      type: "discover_sites";
      discovery: {
        reviewed: number;
        eligible: number;
        created: number;
        matchedExisting: number;
        noAddress: number;
      };
      signals: {
        messageCount: number;
        created: number;
        skipped: number;
      };
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
      v.literal("tracking"),
      v.literal("tasks"),
      v.literal("signals"),
      v.literal("discover_sites")
    ),
  },
  handler: async (ctx, { apiKey, type }): Promise<TriggerCheckResult> => {
    requireApiKey(apiKey);

    if (type === "tracking") {
      const scheduling: TriggerRunResult = await ctx.runAction(internal.checkScheduling.run, { includeAll: true });
      const completion: TriggerRunResult = await ctx.runAction(internal.checkCompletion.run, { includeAll: true });
      return {
        type,
        scheduling,
        completion,
      };
    }

    if (type === "scheduling") {
      return (await ctx.runAction(internal.checkScheduling.run, { includeAll: true })) as TriggerRunResult;
    }

    if (type === "tasks") {
      return {
        type,
        ...(await ctx.runMutation(internal.tasks.backfillAll, {})),
      };
    }

    if (type === "signals") {
      return {
        type,
        ...(await ctx.runMutation(internal.taskSignals.extractFromArchive, {})),
      };
    }

    if (type === "discover_sites") {
      const discovery = await ctx.runMutation(internal.sites.discoverFromArchive, {});
      const signals = await ctx.runMutation(internal.taskSignals.extractFromArchive, {});
      return {
        type,
        discovery,
        signals,
      };
    }

    return (await ctx.runAction(internal.checkCompletion.run, { includeAll: true })) as TriggerRunResult;
  },
});
