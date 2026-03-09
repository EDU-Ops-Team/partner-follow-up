import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  if (apiKey !== process.env.ADMIN_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { type } = body as { type?: string };

  if (!type || !["email", "scheduling", "completion"].includes(type)) {
    return NextResponse.json(
      { error: "type must be one of: email, scheduling, completion" },
      { status: 400 }
    );
  }

  // With Convex, cron actions run server-side in Convex infrastructure.
  // Manual triggers can be done via Convex dashboard or by scheduling
  // an immediate run. For now, return guidance.
  return NextResponse.json({
    message: `To manually trigger '${type}', use the Convex dashboard to run the corresponding action, or call the Convex function directly via the SDK.`,
    action: `internal.check${type.charAt(0).toUpperCase() + type.slice(1)}.run`,
  });
}
