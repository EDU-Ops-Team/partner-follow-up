import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "convex/_generated/api";
import { Id } from "convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function checkAuth(request: NextRequest): boolean {
  return request.headers.get("x-api-key") === process.env.ADMIN_API_KEY;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const site = await convex.query(api.sites.getById, { id: id as Id<"sites"> });
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const logs = await convex.query(api.auditLogs.listBySite, { siteId: id as Id<"sites">, limit: 20 });
  return NextResponse.json({ site, auditLogs: logs });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const allowedFields = [
    "phase", "lidarScheduled", "inspectionScheduled",
    "reportReceived", "reportLink", "resolved", "nextCheckDate",
  ];

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) updates[field] = body[field];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = await convex.mutation(api.sites.adminUpdate, {
    id: id as Id<"sites">,
    updates,
  });

  return NextResponse.json({ site: updated });
}
