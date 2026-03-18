import { NextRequest, NextResponse } from "next/server";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { getServerApiKey, getServerConvex } from "@/lib/serverConvex";
import { parseReviewFeedbackReasons } from "../../../../../../../shared/reviewFeedback";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const body = (await request.json()) as {
    reviewerGoogleId?: string;
    reviewerEmail?: string;
    to?: string;
    cc?: string;
    subject?: string;
    body?: string;
    feedbackReasons?: string[];
    feedbackNote?: string;
  };

  if (!body.reviewerGoogleId && !body.reviewerEmail) {
    return NextResponse.json({ error: "Missing reviewer identity" }, { status: 400 });
  }

  if (!body.to || !body.subject || !body.body) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { id } = await params;
  await getServerConvex().mutation(api.draftEmails.editAndSend, {
    id: id as Id<"draftEmails">,
    apiKey: getServerApiKey(),
    reviewerGoogleId: body.reviewerGoogleId,
    reviewerEmail: body.reviewerEmail,
    to: body.to,
    cc: body.cc,
    subject: body.subject,
    body: body.body,
    feedbackReasons: parseReviewFeedbackReasons(body.feedbackReasons),
    feedbackNote: body.feedbackNote,
  });

  return NextResponse.json({ ok: true });
}

