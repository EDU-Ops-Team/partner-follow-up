import { NextRequest, NextResponse } from "next/server";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { getServerApiKey, getServerConvex } from "@/lib/serverConvex";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const body = (await request.json().catch(() => ({}))) as {
    reviewerGoogleId?: string;
    reviewerEmail?: string;
    feedbackNote?: string;
  };

  if (!body.reviewerGoogleId && !body.reviewerEmail) {
    return NextResponse.json({ error: "Missing reviewer identity" }, { status: 400 });
  }

  const { id } = await params;
  await getServerConvex().mutation(api.draftEmails.alreadyReplied, {
    id: id as Id<"draftEmails">,
    apiKey: getServerApiKey(),
    reviewerGoogleId: body.reviewerGoogleId,
    reviewerEmail: body.reviewerEmail,
    feedbackNote: body.feedbackNote,
  });

  return NextResponse.json({ ok: true });
}
