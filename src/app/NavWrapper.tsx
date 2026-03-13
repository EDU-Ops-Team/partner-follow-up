"use client";

import { usePathname } from "next/navigation";
import { Nav } from "@/components/Nav";

export function NavWrapper() {
  const pathname = usePathname();
  // Hide nav on auth pages
  if (pathname.startsWith("/auth")) return null;
  return <Nav />;
}
