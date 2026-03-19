import { NextResponse } from "next/server";
import { api } from "convex/_generated/api";
import { getServerApiKey, getServerConvex } from "@/lib/serverConvex";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json()) as {
    reviewerEmail?: string;
    reviewerName?: string;
    siteId?: string;
    taskType?: "sir" | "lidar_scan" | "building_inspection";
    proposedState?: "not_started" | "requested" | "scheduled" | "in_progress" | "in_review" | "completed" | "blocked" | "not_needed";
    note?: string;
  };

  if (!body.reviewerEmail) {
    return NextResponse.json({ error: "Missing reviewerEmail" }, { status: 400 });
  }

  await getServerConvex().mutation(api.taskSignals.apply, {
    apiKey: getServerApiKey(),
    id: id as never,
    reviewerEmail: body.reviewerEmail,
    reviewerName: body.reviewerName,
    siteId: body.siteId as never,
    taskType: body.taskType,
    proposedState: body.proposedState,
    note: body.note,
  });

  return NextResponse.json({ ok: true });
}
