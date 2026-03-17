import { ConvexHttpClient } from "convex/browser";
import { auth } from "@/lib/auth";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error("Missing NEXT_PUBLIC_CONVEX_URL");
}

const convex = new ConvexHttpClient(convexUrl);

export function getServerConvex() {
  return convex;
}

export function getServerApiKey(): string {
  const apiKey = process.env.ADMIN_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ADMIN_API_KEY");
  }
  return apiKey;
}

export async function requireReviewer() {
  const session = await auth();
  const googleId = (session?.user as Record<string, unknown> | undefined)?.googleId;
  if (!googleId || typeof googleId !== "string") {
    return null;
  }
  return { googleId };
}
