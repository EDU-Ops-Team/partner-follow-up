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

  const validStatus = status === "pending" || status === "approved" || status === "rejected" || status === "applied"
    ? status
    : undefined;

  const signals = await getServerConvex().query(api.taskSignals.list, {
    apiKey: getServerApiKey(),
    status: validStatus,
    limit,
  });

  return NextResponse.json({ signals });
}
