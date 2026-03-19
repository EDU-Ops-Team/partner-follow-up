import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const attachmentValidator = v.object({
  name: v.string(),
  mimeType: v.optional(v.string()),
  url: v.optional(v.string()),
});

const messageValidator = v.object({
  externalMessageId: v.string(),
  from: v.string(),
  to: v.array(v.string()),
  cc: v.array(v.string()),
  sentAt: v.number(),
  subject: v.string(),
  bodyText: v.string(),
  bodyHtml: v.optional(v.string()),
  attachments: v.optional(v.array(attachmentValidator)),
  sourceUrl: v.optional(v.string()),
});

const threadValidator = v.object({
  groupThreadId: v.string(),
  subject: v.string(),
  participants: v.array(v.string()),
  firstMessageAt: v.optional(v.number()),
  lastMessageAt: v.optional(v.number()),
  sourceUrl: v.optional(v.string()),
  messages: v.array(messageValidator),
});

type IngestBatchResult = {
  threadCount: number;
  messageCount: number;
  insertedMessages: number;
  scrapedAt: number;
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

export const ingestBatchInternal = internalMutation({
  args: {
    threads: v.array(threadValidator),
    scrapedAt: v.number(),
    checkpointKey: v.optional(v.string()),
  },
  handler: async (ctx, { threads, scrapedAt }) => {
    let threadCount = 0;
    let messageCount = 0;
    let insertedMessages = 0;

    for (const thread of threads) {
      const existingThread = await ctx.db
        .query("groupThreads")
        .withIndex("by_groupThreadId", (q) => q.eq("groupThreadId", thread.groupThreadId))
        .first();

      if (existingThread) {
        await ctx.db.patch(existingThread._id, {
          subject: thread.subject,
          participants: thread.participants,
          firstMessageAt: thread.firstMessageAt,
          lastMessageAt: thread.lastMessageAt,
          sourceUrl: thread.sourceUrl,
          scrapedAt,
        });
      } else {
        await ctx.db.insert("groupThreads", {
          groupThreadId: thread.groupThreadId,
          subject: thread.subject,
          participants: thread.participants,
          firstMessageAt: thread.firstMessageAt,
          lastMessageAt: thread.lastMessageAt,
          sourceUrl: thread.sourceUrl,
          scrapedAt,
        });
      }

      threadCount += 1;

      for (const message of thread.messages) {
        messageCount += 1;
        const existingMessage = await ctx.db
          .query("groupMessages")
          .withIndex("by_externalMessageId", (q) => q.eq("externalMessageId", message.externalMessageId))
          .first();

        if (existingMessage) {
          await ctx.db.patch(existingMessage._id, {
            groupThreadId: thread.groupThreadId,
            from: message.from,
            to: message.to,
            cc: message.cc,
            sentAt: message.sentAt,
            subject: message.subject,
            bodyText: message.bodyText,
            bodyHtml: message.bodyHtml,
            attachments: message.attachments,
            sourceUrl: message.sourceUrl,
            scrapedAt,
          });
          continue;
        }

        await ctx.db.insert("groupMessages", {
          groupThreadId: thread.groupThreadId,
          externalMessageId: message.externalMessageId,
          from: message.from,
          to: message.to,
          cc: message.cc,
          sentAt: message.sentAt,
          subject: message.subject,
          bodyText: message.bodyText,
          bodyHtml: message.bodyHtml,
          attachments: message.attachments,
          sourceUrl: message.sourceUrl,
          scrapedAt,
        });
        insertedMessages += 1;
      }
    }

    return {
      threadCount,
      messageCount,
      insertedMessages,
      scrapedAt,
    };
  },
});

export const ingestBatch = mutation({
  args: {
    apiKey: v.string(),
    threads: v.array(threadValidator),
    scrapedAt: v.optional(v.number()),
    checkpointKey: v.optional(v.string()),
  },
  handler: async (ctx, { apiKey, threads, scrapedAt, checkpointKey }): Promise<IngestBatchResult> => {
    requireApiKey(apiKey);
    return ctx.runMutation(internal.groupArchive.ingestBatchInternal, {
      threads,
      scrapedAt: scrapedAt ?? Date.now(),
      checkpointKey,
    });
  },
});

export const getArchiveStats = query({
  args: {},
  handler: async (ctx) => {
    const [threads, messages] = await Promise.all([
      ctx.db.query("groupThreads").collect(),
      ctx.db.query("groupMessages").collect(),
    ]);

    const latestMessageAt = messages.reduce<number | null>((latest, message) => {
      if (latest === null || message.sentAt > latest) {
        return message.sentAt;
      }
      return latest;
    }, null);

    return {
      threadCount: threads.length,
      messageCount: messages.length,
      latestMessageAt,
    };
  },
});
