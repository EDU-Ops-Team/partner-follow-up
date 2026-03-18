import { NextRequest, NextResponse } from "next/server";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { getServerApiKey, getServerConvex } from "@/lib/serverConvex";
import { parseReviewFeedbackReasons } from "../../../../../../../shared/reviewFeedback";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const body = (await request.json().catch(() => ({}))) as {
    reviewerGoogleId?: string;
    reviewerEmail?: string;
    feedbackReasons?: string[];
    feedbackNote?: string;
  };

  if (!body.reviewerGoogleId && !body.reviewerEmail) {
    return NextResponse.json({ error: "Missing reviewer identity" }, { status: 400 });
  }

  const feedbackReasons = parseReviewFeedbackReasons(body.feedbackReasons) ?? [];
  if (feedbackReasons.length === 0) {
    return NextResponse.json({ error: "At least one reason is required" }, { status: 400 });
  }

  const { id } = await params;
  await getServerConvex().mutation(api.draftEmails.reject, {
    id: id as Id<"draftEmails">,
    apiKey: getServerApiKey(),
    reviewerGoogleId: body.reviewerGoogleId,
    reviewerEmail: body.reviewerEmail,
    feedbackReasons,
    feedbackNote: body.feedbackNote,
  });

  return NextResponse.json({ ok: true });
}

