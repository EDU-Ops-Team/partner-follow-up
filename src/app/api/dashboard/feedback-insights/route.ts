import { NextResponse } from "next/server";
import { api } from "convex/_generated/api";
import { getServerApiKey, getServerConvex, requireReviewer } from "@/lib/serverConvex";

export async function GET() {
  const reviewer = await requireReviewer();
  if (!reviewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const convex = getServerConvex();
  const [siteFeedback, inboundFeedback] = await Promise.all([
    convex.query(api.sites.getFeedbackInsights, {
      apiKey: getServerApiKey(),
    }),
    convex.query(api.emailClassifications.getFeedbackInsights, {
      apiKey: getServerApiKey(),
    }),
  ]);

  return NextResponse.json({
    siteFeedback,
    inboundFeedback,
  });
}
