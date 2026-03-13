import type { Metadata } from "next";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { NavWrapper } from "./NavWrapper";
import "./globals.css";

export const metadata: Metadata = {
  title: "EDU Ops Agent",
  description: "Email agent for Alpha Schools EDU Ops",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <ConvexClientProvider>
          <NavWrapper />
          {children}
        </ConvexClientProvider>
      </body>
    </html>
  );
}
