import { NextRequest, NextResponse } from "next/server";
import { api } from "convex/_generated/api";
import { getServerApiKey, getServerConvex } from "@/lib/serverConvex";

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status") ?? undefined;
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0 || limit > 500)) {
    return NextResponse.json({ error: "Invalid limit" }, { status: 400 });
  }

  const convex = getServerConvex();

  if (status) {
    const drafts = await convex.query(api.draftEmails.list, {
      apiKey: getServerApiKey(),
      status,
      limit,
    });

    return NextResponse.json({ drafts });
  }

  const queue = await convex.query(api.draftEmails.getReviewQueue, {
    apiKey: getServerApiKey(),
    limit,
  });

  return NextResponse.json(queue);
}
