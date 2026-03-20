import { NextRequest, NextResponse } from "next/server";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { getServerApiKey, getServerConvex, requireReviewer } from "@/lib/serverConvex";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const reviewer = await requireReviewer();
  if (!reviewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json() as {
    correctedClassificationType?: string;
    correctedSiteId?: string;
    note?: string;
  };

  if (!body.correctedClassificationType) {
    return NextResponse.json({ error: "correctedClassificationType is required" }, { status: 400 });
  }

  const { id } = await params;
  const correctedMatchedSiteIds = body.correctedSiteId
    ? [body.correctedSiteId as Id<"sites">]
    : [];

  const result = await getServerConvex().mutation(api.emailClassifications.applyFeedback, {
    id: id as Id<"emailClassifications">,
    apiKey: getServerApiKey(),
    correctedClassificationType: body.correctedClassificationType,
    correctedMatchedSiteIds,
    note: body.note,
    reviewedBy: reviewer.email,
  });

  return NextResponse.json(result);
}
