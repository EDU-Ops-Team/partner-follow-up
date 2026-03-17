import { NextRequest, NextResponse } from "next/server";
import { api } from "convex/_generated/api";
import { getServerApiKey, getServerConvex, requireReviewer } from "@/lib/serverConvex";

export async function GET(request: NextRequest) {
  const reviewer = await requireReviewer();
  if (!reviewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : 100;

  if (!Number.isFinite(limit) || limit <= 0 || limit > 500) {
    return NextResponse.json({ error: "Invalid limit" }, { status: 400 });
  }

  const classifications = await getServerConvex().query(api.emailClassifications.listUnmatched, {
    apiKey: getServerApiKey(),
    limit,
  });

  return NextResponse.json({ classifications });
}

