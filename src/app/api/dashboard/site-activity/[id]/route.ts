import { NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../../convex/_generated/dataModel";
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
  const siteId = id as Id<"sites">;
  const convex = getServerConvex();
  const apiKey = getServerApiKey();

  const [classifications, threads, drafts] = await Promise.all([
    convex.query(api.emailClassifications.listBySiteId, { siteId, apiKey }),
    convex.query(api.emailThreads.listBySiteId, { siteId, apiKey }),
    convex.query(api.draftEmails.listBySiteId, { siteId, apiKey }),
  ]);

  return NextResponse.json({ classifications, threads, drafts });
}
