import { NextResponse } from "next/server";
import { api } from "convex/_generated/api";
import { getServerApiKey, getServerConvex } from "@/lib/serverConvex";

export async function GET() {
  const insights = await getServerConvex().query(api.draftEmails.getInsights, {
    apiKey: getServerApiKey(),
  });

  return NextResponse.json({ insights });
}
