import { NextRequest, NextResponse } from "next/server";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { getServerConvex, requireReviewer } from "@/lib/serverConvex";

type SiteDisposition = "unreviewed" | "confirmed" | "needs_review" | "invalid";

function isDisposition(value: string): value is SiteDisposition {
  return value === "unreviewed" || value === "confirmed" || value === "needs_review" || value === "invalid";
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const reviewer = await requireReviewer();
  if (!reviewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json() as {
    disposition?: string;
    note?: string;
  };

  if (!body.disposition || !isDisposition(body.disposition)) {
    return NextResponse.json(
      { error: "disposition must be one of: unreviewed, confirmed, needs_review, invalid" },
      { status: 400 }
    );
  }

  const trimmedNote = typeof body.note === "string" ? body.note.trim() : "";
  const site = await getServerConvex().mutation(api.sites.adminUpdate, {
    id: id as Id<"sites">,
    updates: {
      recordDisposition: body.disposition,
      recordDispositionNote: trimmedNote || undefined,
      recordDispositionBy: reviewer.email,
      recordDispositionAt: Date.now(),
    },
  });

  return NextResponse.json({ site });
}
