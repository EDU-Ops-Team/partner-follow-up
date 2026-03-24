import { NextRequest, NextResponse } from "next/server";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { getServerApiKey, getServerConvex } from "@/lib/serverConvex";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const classification = draft.classificationId
    ? await convex.query(api.emailClassifications.getById, { id: draft.classificationId, apiKey })
    : null;

  return NextResponse.json({ draft, classification });
}
