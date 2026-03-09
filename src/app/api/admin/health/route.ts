import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function GET() {
  const status = {
    status: "ok" as "ok" | "degraded" | "down",
    convex: false,
    timestamp: new Date().toISOString(),
  };

  try {
    // Test Convex connectivity by running a simple query
    await convex.query(api.sites.getStats);
    status.convex = true;
  } catch {
    status.status = "down";
  }

  const httpStatus = status.status === "down" ? 503 : 200;
  return NextResponse.json(status, { status: httpStatus });
}
