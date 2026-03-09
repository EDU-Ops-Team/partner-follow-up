import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { normalizeAddress } from "../../../../../convex/lib/addressNormalizer";
import { addBusinessDays } from "../../../../../convex/lib/businessDays";
import { SCHEDULING_CHECK_INTERVAL_DAYS } from "../../../../../convex/lib/constants";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function checkAuth(request: NextRequest): boolean {
  return request.headers.get("x-api-key") === process.env.ADMIN_API_KEY;
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sites = await convex.query(api.sites.list);
  return NextResponse.json({ sites });
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { address, responsiblePartyEmail, responsiblePartyName } = body;

  if (!address || !responsiblePartyEmail) {
    return NextResponse.json({ error: "address and responsiblePartyEmail are required" }, { status: 400 });
  }

  const now = Date.now();
  const nextCheck = addBusinessDays(new Date(now), SCHEDULING_CHECK_INTERVAL_DAYS).getTime();

  const siteId = await convex.mutation(api.sites.adminCreate, {
    siteAddress: address,
    normalizedAddress: normalizeAddress(address),
    responsiblePartyEmail,
    responsiblePartyName: responsiblePartyName ?? responsiblePartyEmail,
    triggerDate: now,
    nextCheckDate: nextCheck,
  });

  return NextResponse.json({ siteId }, { status: 201 });
}
