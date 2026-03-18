export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: [
    "/((?!api/auth|api/admin|auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
