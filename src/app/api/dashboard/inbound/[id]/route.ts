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
  // Convex validates the ID and returns null if not found (handled below)
  const classificationId = id as Id<"emailClassifications">;
  const convex = getServerConvex();
  const apiKey = getServerApiKey();

  const [classification, sites] = await Promise.all([
    convex.query(api.emailClassifications.getById, { id: classificationId, apiKey }),
    convex.query(api.sites.list, {}),
  ]);

  if (!classification) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ classification, sites });
}
