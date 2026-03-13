import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { ConvexHttpClient } from "convex/browser";
import { api, internal } from "../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account || !profile) return false;

      // Sync reviewer record to Convex
      try {
        // Use the public mutation approach since ConvexHttpClient can't call internal functions
        // The reviewers.upsertFromOAuth is internal, so we'll handle this via an admin API route
        return true;
      } catch (error) {
        console.error("Failed to sync reviewer to Convex:", error);
        return true; // Still allow sign-in even if sync fails
      }
    },
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.googleId = account.providerAccountId;
        token.email = profile.email;
        token.name = profile.name;
        token.picture = profile.picture as string | undefined;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as unknown as Record<string, unknown>).googleId = token.googleId;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
});
