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
    note?: string;
  };

  if (!body.reviewerEmail) {
    return NextResponse.json({ error: "Missing reviewerEmail" }, { status: 400 });
  }

  await getServerConvex().mutation(api.taskSignals.reject, {
    apiKey: getServerApiKey(),
    id: id as never,
    reviewerEmail: body.reviewerEmail,
    reviewerName: body.reviewerName,
    note: body.note,
  });

  return NextResponse.json({ ok: true });
}
