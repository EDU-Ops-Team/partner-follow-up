import { NextRequest, NextResponse } from "next/server";
import { api } from "convex/_generated/api";
import { getServerApiKey, getServerConvex, requireReviewer } from "@/lib/serverConvex";

type TriggerType = "scheduling" | "completion" | "tracking" | "tasks" | "signals" | "discover_sites";

function isTriggerType(value: string): value is TriggerType {
  return value === "scheduling" || value === "completion" || value === "tracking" || value === "tasks" || value === "signals" || value === "discover_sites";
}

export async function POST(request: NextRequest) {
  const reviewer = await requireReviewer();
  if (!reviewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (reviewer.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { type } = body as { type?: string };

  if (!type || !isTriggerType(type)) {
    return NextResponse.json(
      { error: "type must be one of: scheduling, completion, tracking, tasks, signals, discover_sites" },
      { status: 400 }
    );
  }

  const triggerCheck = (api as Record<string, any>).admin.triggerCheck;

  const result = await getServerConvex().action(triggerCheck, {
    apiKey: getServerApiKey(),
    type,
  });

  return NextResponse.json({
    ok: true,
    type,
    result,
  });
}
