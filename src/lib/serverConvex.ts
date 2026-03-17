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
  const user = session?.user as Record<string, unknown> | undefined;
  const email = typeof user?.email === "string" ? user.email : null;
  if (!email) {
    return null;
  }
  return {
    googleId: typeof user?.googleId === "string" ? user.googleId : email,
    email,
    name: typeof user?.name === "string" ? user.name : email,
    avatarUrl: typeof user?.image === "string" ? user.image : undefined,
  };
}
