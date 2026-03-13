export { auth as middleware } from "@/lib/auth";

export const config = {
  // Protect all routes except auth endpoints and admin API
  matcher: [
    "/((?!api/auth|api/admin|auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
