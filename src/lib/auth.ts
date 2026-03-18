import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { ConvexHttpClient } from "convex/browser";
import { api } from "convex/_generated/api";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required auth env var: ${name}`);
  }
  return value;
}

function parseCsvEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function getEmailDomain(email: string): string {
  const parts = email.toLowerCase().split("@");
  return parts.length === 2 ? parts[1] : "";
}

const convex = new ConvexHttpClient(requireEnv("NEXT_PUBLIC_CONVEX_URL"));
const allowedEmails = new Set(parseCsvEnv("AUTH_ALLOWED_EMAILS"));
const allowedDomains = (() => {
  const configured = parseCsvEnv("AUTH_ALLOWED_DOMAINS");
  return configured.length > 0 ? configured : ["trilogy.com", "2hourlearning.com"];
})();
const adminEmails = new Set(parseCsvEnv("AUTH_ADMIN_EMAILS"));

function isAllowedReviewerEmail(email: string): boolean {
  const normalized = email.toLowerCase();
  if (allowedEmails.has(normalized)) {
    return true;
  }
  const domain = getEmailDomain(normalized);
  return allowedDomains.includes(domain);
}

function getReviewerRole(email: string): "admin" | "reviewer" {
  return adminEmails.has(email.toLowerCase()) ? "admin" : "reviewer";
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: requireEnv("AUTH_SECRET"),
  trustHost: true,
  providers: [
    Google({
      clientId: requireEnv("AUTH_GOOGLE_ID"),
      clientSecret: requireEnv("AUTH_GOOGLE_SECRET"),
    }),
  ],
  callbacks: {
    authorized({ auth, request }) {
      const isAuthenticated = !!auth?.user?.email;
      if (request.nextUrl.pathname.startsWith("/api/")) {
        return isAuthenticated;
      }
      if (isAuthenticated) {
        return true;
      }
      const signInUrl = new URL("/auth/signin", request.nextUrl.origin);
      const callbackUrl = `${request.nextUrl.pathname}${request.nextUrl.search}`;
      if (callbackUrl && callbackUrl !== "/") {
        signInUrl.searchParams.set("callbackUrl", callbackUrl);
      }
      return Response.redirect(signInUrl);
    },
    async signIn({ user, account, profile }) {
      if (!account || !profile) return false;

      const email = (profile.email ?? user.email ?? "").toLowerCase();
      const emailVerified = profile.email_verified;

      if (!email) {
        return false;
      }
      if (emailVerified === false) {
        return false;
      }
      if (!isAllowedReviewerEmail(email)) {
        return false;
      }

      try {
        await convex.mutation(api.reviewers.syncFromOAuth, {
          apiKey: requireEnv("ADMIN_API_KEY"),
          googleId: account.providerAccountId,
          email,
          name: profile.name ?? user.name ?? email,
          avatarUrl: (profile.picture as string | undefined) ?? user.image ?? undefined,
          role: getReviewerRole(email),
        });
      } catch (error) {
        console.error("Failed to sync reviewer to Convex:", error);
      }
      return true;
    },
    async jwt({ token, account, profile }) {
      if (account && profile) {
        const email = (profile.email ?? token.email ?? "").toLowerCase();
        token.googleId = account.providerAccountId;
        token.email = email;
        token.name = profile.name;
        token.picture = profile.picture as string | undefined;
        token.role = email ? getReviewerRole(email) : "reviewer";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const user = session.user as typeof session.user & {
          googleId?: string;
          role?: "admin" | "reviewer";
        };
        if (typeof token.googleId === "string") {
          user.googleId = token.googleId;
        }
        user.role = token.role === "admin" ? "admin" : "reviewer";
        if (typeof token.email === "string") {
          session.user.email = token.email;
        }
        if (typeof token.name === "string") {
          session.user.name = token.name;
        }
        if (typeof token.picture === "string") {
          session.user.image = token.picture;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
});
