"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { sendEmail } from "./services/agentGmail";

export const sendApproved = internalAction({
  args: { id: v.id("draftEmails") },
  handler: async (ctx, { id }) => {
    const draft = await ctx.runQuery(internal.draftEmails.getByIdInternal, { id });
    if (!draft || !draft.sentTo || !draft.sentSubject || !draft.sentBody) {
      throw new Error("Draft missing required send fields");
    }

    const classification = await ctx.runQuery(
      internal.emailClassifications.getByIdInternal,
      { classificationId: draft.classificationId }
    );

    const threading = classification?.threadId
      ? { threadId: classification.threadId }
      : undefined;

    await sendEmail(
      draft.sentTo,
      draft.sentSubject,
      draft.sentBody,
      draft.sentCc ?? undefined,
      threading
    );

    await ctx.runMutation(internal.auditLogs.create, {
      siteId: draft.siteId,
      action: "draft_email_sent",
      details: {
        draftId: id,
        to: draft.sentTo,
        subject: draft.sentSubject,
        status: draft.status,
      },
      level: "info",
    });
  },
});
