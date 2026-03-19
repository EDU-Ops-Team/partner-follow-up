import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getTaskProgressValue, TASK_STATES, type TaskState, type TaskType } from "../shared/taskModel";
import { detectTaskSignalFromMessage, explainTaskSignalDetection } from "./lib/taskSignalDetection";

const taskStateValidator = v.union(
  v.literal("not_started"),
  v.literal("requested"),
  v.literal("scheduled"),
  v.literal("in_progress"),
  v.literal("in_review"),
  v.literal("completed"),
  v.literal("blocked"),
  v.literal("not_needed")
);

const taskTypeValidator = v.union(
  v.literal("sir"),
  v.literal("lidar_scan"),
  v.literal("building_inspection")
);

function requireApiKey(apiKey: string) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) {
    throw new Error("Missing ADMIN_API_KEY");
  }
  if (apiKey !== expected) {
    throw new Error("Unauthorized");
  }
}

function isBackwardTransition(currentState: TaskState, nextState: TaskState) {
  return TASK_STATES.indexOf(nextState) < TASK_STATES.indexOf(currentState);
}

async function findTaskBySiteAndType(ctx: any, siteId: string, taskType: TaskType) {
  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_siteId", (q: any) => q.eq("siteId", siteId as never))
    .collect();

  return tasks.find((task: any) => task.taskType === taskType) ?? null;
}

async function supersedePendingSignalsForTask(
  ctx: any,
  siteId: string,
  taskType: TaskType,
  keepSignalId: string,
  reviewer: string,
  reviewedAt: number,
) {
  const signals = await ctx.db
    .query("taskSignals")
    .withIndex("by_siteId", (q: any) => q.eq("siteId", siteId as never))
    .collect();

  for (const signal of signals) {
    if (
      signal._id === keepSignalId ||
      signal.status !== "pending" ||
      signal.taskType !== taskType
    ) {
      continue;
    }

    await ctx.db.patch(signal._id, {
      status: "rejected",
      reviewedBy: reviewer,
      reviewedAt,
      reviewNote: "Superseded by a newer applied signal for the same task.",
      updatedAt: reviewedAt,
    });
  }
}

export const extractFromArchive = internalMutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit }) => {
    const sites = await ctx.db.query("sites").collect();
    const messages = await ctx.db.query("groupMessages").collect();
    const sortedMessages = [...messages]
      .sort((a, b) => a.sentAt - b.sentAt)
      .slice(0, limit ?? messages.length);

    let created = 0;
    let skipped = 0;

    for (const message of sortedMessages) {
      const existing = await ctx.db
        .query("taskSignals")
        .withIndex("by_messageId", (q) => q.eq("messageId", message._id))
        .first();

      if (existing) {
        skipped += 1;
        continue;
      }

      const detected = detectTaskSignalFromMessage(
        sites.map((site) => ({
          _id: String(site._id),
          siteAddress: site.siteAddress,
          fullAddress: site.fullAddress,
          responsiblePartyEmail: site.responsiblePartyEmail,
          inspectionContactEmail: site.inspectionContactEmail,
        })),
        {
          subject: message.subject,
          bodyText: message.bodyText,
          from: message.from,
          to: message.to,
          cc: message.cc,
          attachments: message.attachments,
        }
      );

      if (!detected) {
        skipped += 1;
        continue;
      }

      const site = detected.siteId ? sites.find((item) => String(item._id) === detected.siteId) : null;
      const currentTask = site && detected.taskType
        ? await findTaskBySiteAndType(ctx, String(site._id), detected.taskType)
        : null;

      await ctx.db.insert("taskSignals", {
        messageId: message._id,
        groupThreadId: message.groupThreadId,
        siteId: site?._id,
        partnerKey: detected.partnerKey,
        taskType: detected.taskType,
        proposedState: detected.proposedState,
        currentState: currentTask?.state,
        confidence: detected.confidence,
        evidenceSnippet: detected.evidenceSnippet,
        detector: detected.detector,
        status: "pending",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      created += 1;
    }

    return {
      messageCount: sortedMessages.length,
      created,
      skipped,
    };
  },
});

export const list = query({
  args: {
    apiKey: v.string(),
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("applied")
    )),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { apiKey, status, limit }) => {
    requireApiKey(apiKey);

    const signals = status
      ? await ctx.db.query("taskSignals").withIndex("by_status", (q) => q.eq("status", status)).collect()
      : await ctx.db.query("taskSignals").collect();

    const items = await Promise.all(
      [...signals]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit ?? signals.length)
        .map(async (signal) => {
          const [message, site] = await Promise.all([
            ctx.db.get(signal.messageId),
            signal.siteId ? ctx.db.get(signal.siteId) : Promise.resolve(null),
          ]);

          return {
            signal,
            message,
            site,
          };
        })
    );

    return items.filter((item) => item.message);
  },
});

export const get = query({
  args: {
    apiKey: v.string(),
    id: v.id("taskSignals"),
  },
  handler: async (ctx, { apiKey, id }) => {
    requireApiKey(apiKey);

    const signal = await ctx.db.get(id);
    if (!signal) {
      return null;
    }

    const [message, siteOptions] = await Promise.all([
      ctx.db.get(signal.messageId),
      ctx.db.query("sites").collect(),
    ]);

    const siteTasks = signal.siteId
      ? await ctx.db.query("tasks").withIndex("by_siteId", (q) => q.eq("siteId", signal.siteId!)).collect()
      : [];

    return {
      signal,
      message,
      siteOptions: siteOptions.map((site) => ({
        _id: site._id,
        label: site.fullAddress ?? site.siteAddress,
      })),
      siteTasks: siteTasks.map((task) => ({
        _id: task._id,
        taskType: task.taskType,
        partnerName: task.partnerName,
        state: task.state,
      })),
    };
  },
});

export const diagnostics = query({
  args: {
    apiKey: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { apiKey, limit }) => {
    requireApiKey(apiKey);

    const [sites, messages, signals] = await Promise.all([
      ctx.db.query("sites").collect(),
      ctx.db.query("groupMessages").collect(),
      ctx.db.query("taskSignals").collect(),
    ]);

    const signalByMessageId = new Map(
      signals.map((signal) => [String(signal.messageId), signal])
    );
    const siteLabelById = new Map(
      sites.map((site) => [String(site._id), site.fullAddress ?? site.siteAddress])
    );
    const siteCandidates = sites.map((site) => ({
      _id: String(site._id),
      siteAddress: site.siteAddress,
      fullAddress: site.fullAddress,
      responsiblePartyEmail: site.responsiblePartyEmail,
      inspectionContactEmail: site.inspectionContactEmail,
    }));

    return [...messages]
      .sort((a, b) => b.sentAt - a.sentAt)
      .slice(0, limit ?? messages.length)
      .map((message) => {
        const explanation = explainTaskSignalDetection(siteCandidates, {
          subject: message.subject,
          bodyText: message.bodyText,
          from: message.from,
          to: message.to,
          cc: message.cc,
          attachments: message.attachments,
        });
        const existingSignal = signalByMessageId.get(String(message._id)) ?? null;
        const matchedSiteId = existingSignal?.siteId ? String(existingSignal.siteId) : explanation.siteId;

        return {
          message: {
            _id: message._id,
            subject: message.subject,
            from: message.from,
            sentAt: message.sentAt,
            bodyPreview: message.bodyText.slice(0, 240),
            groupThreadId: message.groupThreadId,
          },
          existingSignal: existingSignal
            ? {
                _id: existingSignal._id,
                status: existingSignal.status,
                taskType: existingSignal.taskType,
                proposedState: existingSignal.proposedState,
                confidence: existingSignal.confidence,
                currentState: existingSignal.currentState,
              }
            : null,
          diagnostic: {
            outcome: explanation.outcome,
            reason: explanation.reason,
            taskType: explanation.taskType,
            proposedState: explanation.proposedState,
            confidence: explanation.confidence,
            matchedSiteId,
            matchedSiteLabel: matchedSiteId ? siteLabelById.get(matchedSiteId) ?? null : null,
            evidenceSnippet: explanation.evidenceSnippet,
          },
        };
      });
  },
});

export const apply = mutation({
  args: {
    apiKey: v.string(),
    id: v.id("taskSignals"),
    reviewerEmail: v.string(),
    reviewerName: v.optional(v.string()),
    siteId: v.optional(v.id("sites")),
    taskType: v.optional(taskTypeValidator),
    proposedState: v.optional(taskStateValidator),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { apiKey, id, reviewerEmail, reviewerName, siteId, taskType, proposedState, note }) => {
    requireApiKey(apiKey);

    const signal = await ctx.db.get(id);
    if (!signal) {
      throw new Error("Signal not found");
    }
    if (signal.status !== "pending") {
      throw new Error(`Signal is already ${signal.status}`);
    }

    const resolvedSiteId = siteId ?? signal.siteId;
    const resolvedTaskType = taskType ?? signal.taskType;
    const resolvedState = proposedState ?? signal.proposedState;

    if (!resolvedSiteId || !resolvedTaskType || !resolvedState) {
      throw new Error("Signal must have a site, task type, and state before it can be applied");
    }

    const task = await findTaskBySiteAndType(ctx, String(resolvedSiteId), resolvedTaskType);
    if (!task) {
      throw new Error("Task not found for selected site and task type");
    }

    if (isBackwardTransition(task.state, resolvedState) && !note?.trim()) {
      throw new Error(
        `This signal is older than the current task state (${task.state} -> ${resolvedState}). Reject it if stale, or add a note to allow a backward transition.`
      );
    }

    const now = Date.now();
    const progressValue = getTaskProgressValue(resolvedState, task.lastProgressValue);
    await ctx.db.patch(task._id, {
      state: resolvedState,
      stateUpdatedAt: now,
      lastProgressValue: progressValue,
      source: signal.detector,
      notes: note?.trim() || task.notes,
    });

    await ctx.db.insert("taskEvents", {
      taskId: task._id,
      siteId: resolvedSiteId,
      fromState: task.state,
      toState: resolvedState,
      sourceType: "email_backfill",
      sourceMessageId: String(signal.messageId),
      approvedBy: reviewerEmail,
      approvedAt: now,
      note: note?.trim() || undefined,
      evidence: signal.evidenceSnippet,
      createdAt: now,
    });

    await ctx.db.patch(id, {
      siteId: resolvedSiteId,
      partnerKey: task.partnerKey,
      taskType: resolvedTaskType,
      proposedState: resolvedState,
      currentState: task.state,
      status: "applied",
      reviewedBy: reviewerName ?? reviewerEmail,
      reviewedAt: now,
      reviewNote: note?.trim() || undefined,
      appliedTaskId: task._id,
      updatedAt: now,
    });

    await supersedePendingSignalsForTask(
      ctx,
      String(resolvedSiteId),
      resolvedTaskType,
      String(id),
      reviewerName ?? reviewerEmail,
      now,
    );

    return { ok: true };
  },
});

export const reject = mutation({
  args: {
    apiKey: v.string(),
    id: v.id("taskSignals"),
    reviewerEmail: v.string(),
    reviewerName: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { apiKey, id, reviewerEmail, reviewerName, note }) => {
    requireApiKey(apiKey);

    const signal = await ctx.db.get(id);
    if (!signal) {
      throw new Error("Signal not found");
    }

    await ctx.db.patch(id, {
      status: "rejected",
      reviewedBy: reviewerName ?? reviewerEmail,
      reviewedAt: Date.now(),
      reviewNote: note?.trim() || undefined,
      updatedAt: Date.now(),
    });

    return { ok: true };
  },
});
