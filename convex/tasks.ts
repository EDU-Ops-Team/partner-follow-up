import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { PHASE_ONE_TASK_TEMPLATES, deriveTaskStateFromSite, getTaskProgressValue, type TaskState } from "../shared/taskModel";

function nowOr(value?: number) {
  return value ?? Date.now();
}

async function ensurePhaseOneTasksForSite(
  ctx: any,
  siteId: string,
  createdBy: string,
  createdAt?: number,
) {
  const existing = await ctx.db
    .query("tasks")
    .withIndex("by_siteId", (q: any) => q.eq("siteId", siteId as never))
    .collect();

  const byKey = new Set(existing.map((task: any) => `${task.partnerKey}:${task.taskType}`));
  const timestamp = nowOr(createdAt);
  let createdCount = 0;

  for (const template of PHASE_ONE_TASK_TEMPLATES) {
    const key = `${template.partnerKey}:${template.taskType}`;
    if (byKey.has(key)) {
      continue;
    }

    const taskId = await ctx.db.insert("tasks", {
      siteId: siteId as never,
      partnerKey: template.partnerKey,
      partnerName: template.partnerName,
      taskType: template.taskType,
      milestone: template.milestone,
      state: "requested",
      stateUpdatedAt: timestamp,
      lastProgressValue: getTaskProgressValue("requested"),
      createdBy,
      source: "task_template",
    });

    await ctx.db.insert("taskEvents", {
      taskId,
      siteId: siteId as never,
      toState: "requested",
      sourceType: "site_seed",
      note: "Seeded M1 task template",
      createdAt: timestamp,
    });
    createdCount += 1;
  }

  return createdCount;
}

async function syncDerivedTasksForSite(
  ctx: any,
  siteId: string,
  updatedAt?: number,
) {
  const site = await ctx.db.get(siteId as never);
  if (!site) {
    throw new Error("Site not found");
  }

  await ensurePhaseOneTasksForSite(ctx, siteId, "system", updatedAt);
  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_siteId", (q: any) => q.eq("siteId", siteId as never))
    .collect();

  const timestamp = nowOr(updatedAt);
  let updatedCount = 0;

  for (const task of tasks) {
    let nextState: TaskState | null = null;
    let deliverableUrl = task.deliverableUrl;

    if (task.taskType === "lidar_scan") {
      nextState = deriveTaskStateFromSite("lidar_scan", site);
    } else if (task.taskType === "building_inspection") {
      nextState = deriveTaskStateFromSite("building_inspection", site);
      deliverableUrl = site.reportLink ?? task.deliverableUrl;
    }

    if (!nextState) {
      continue;
    }

    const nextProgressValue = getTaskProgressValue(nextState, task.lastProgressValue);
    const patch: Record<string, unknown> = {};
    if (task.state !== nextState) {
      patch.state = nextState;
      patch.stateUpdatedAt = timestamp;
      patch.lastProgressValue = nextProgressValue;
    } else if (task.lastProgressValue !== nextProgressValue) {
      patch.lastProgressValue = nextProgressValue;
    }

    if (deliverableUrl && deliverableUrl !== task.deliverableUrl) {
      patch.deliverableUrl = deliverableUrl;
    }

    if (Object.keys(patch).length === 0) {
      continue;
    }

    await ctx.db.patch(task._id, patch);
    if (task.state !== nextState) {
      await ctx.db.insert("taskEvents", {
        taskId: task._id,
        siteId: site._id,
        fromState: task.state,
        toState: nextState,
        sourceType: "site_sync",
        note: "Synced task state from site tracking fields",
        createdAt: timestamp,
      });
    }
    updatedCount += 1;
  }

  return updatedCount;
}

export const listBySite = query({
  args: { siteId: v.id("sites") },
  handler: async (ctx, { siteId }) => {
    return ctx.db
      .query("tasks")
      .withIndex("by_siteId", (q) => q.eq("siteId", siteId))
      .collect();
  },
});

export const ensurePhaseOneForSite = internalMutation({
  args: {
    siteId: v.id("sites"),
    createdBy: v.optional(v.string()),
    createdAt: v.optional(v.number()),
  },
  handler: async (ctx, { siteId, createdBy, createdAt }) => {
    return ensurePhaseOneTasksForSite(ctx, siteId, createdBy ?? "system", createdAt);
  },
});

export const syncFromSite = internalMutation({
  args: {
    siteId: v.id("sites"),
    updatedAt: v.optional(v.number()),
  },
  handler: async (ctx, { siteId, updatedAt }) => {
    return syncDerivedTasksForSite(ctx, siteId, updatedAt);
  },
});

export const backfillAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sites = await ctx.db.query("sites").collect();
    const timestamp = Date.now();
    let created = 0;
    let updated = 0;

    for (const site of sites) {
      created += await ensurePhaseOneTasksForSite(ctx, site._id, "system", timestamp);
      updated += await syncDerivedTasksForSite(ctx, site._id, timestamp);
    }

    return {
      siteCount: sites.length,
      tasksCreated: created,
      tasksUpdated: updated,
    };
  },
});
