import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

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

      try {
        await convex.mutation(api.reviewers.syncFromOAuth, {
          googleId: account.providerAccountId,
          email: profile.email ?? user.email ?? "",
          name: profile.name ?? user.name ?? "",
          avatarUrl: (profile.picture as string | undefined) ?? user.image ?? undefined,
        });
      } catch (error) {
        console.error("Failed to sync reviewer to Convex:", error);
      }
      return true;
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
