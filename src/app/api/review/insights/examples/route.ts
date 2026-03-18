import { NextRequest, NextResponse } from "next/server";
import { api } from "convex/_generated/api";
import { getServerApiKey, getServerConvex } from "@/lib/serverConvex";

export async function GET(request: NextRequest) {
  const classificationType = request.nextUrl.searchParams.get("type");
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : 8;

  if (!classificationType) {
    return NextResponse.json({ error: "Missing type" }, { status: 400 });
  }

  if (!Number.isFinite(limit) || limit <= 0 || limit > 25) {
    return NextResponse.json({ error: "Invalid limit" }, { status: 400 });
  }

  const convex = getServerConvex();
  const examples = await convex.query(api.draftEmails.getReviewedExamples, {
    apiKey: getServerApiKey(),
    classificationType,
    limit,
  });

  return NextResponse.json({ examples });
}
