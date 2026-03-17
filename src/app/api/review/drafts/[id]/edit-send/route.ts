import { NextRequest, NextResponse } from "next/server";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { getServerApiKey, getServerConvex, requireReviewer } from "@/lib/serverConvex";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const reviewer = await requireReviewer();
  if (!reviewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    to?: string;
    cc?: string;
    subject?: string;
    body?: string;
  };

  if (!body.to || !body.subject || !body.body) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { id } = await params;
  await getServerConvex().mutation(api.draftEmails.editAndSend, {
    id: id as Id<"draftEmails">,
    apiKey: getServerApiKey(),
    reviewerGoogleId: reviewer.googleId,
    to: body.to,
    cc: body.cc,
    subject: body.subject,
    body: body.body,
  });

  return NextResponse.json({ ok: true });
}


