import { NextRequest, NextResponse } from "next/server";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { getServerApiKey, getServerConvex, requireReviewer } from "@/lib/serverConvex";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const reviewer = await requireReviewer();
  if (!reviewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const convex = getServerConvex();
  const apiKey = getServerApiKey();

  const draft = await convex.query(api.draftEmails.getById, {
    id: id as Id<"draftEmails">,
    apiKey,
  });

  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  const classification = await convex.query(api.emailClassifications.getById, {
    id: draft.classificationId,
    apiKey,
  });

  return NextResponse.json({ draft, classification });
}


