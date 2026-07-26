import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { GatewayProvider } from "@/lib/gateway-store";
import { ConsoleHeader } from "@/components/console-header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AegisAgent Operator Console",
  description: "Fleet control, policy, and audit for autonomous financial agents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable}`}
      // The whole console is one scrolling document, so anchor jumps and the
      // scroll-spy both want smooth behaviour handled by the browser rather than
      // a scroll-hijacking library.
      style={{ scrollBehavior: "smooth" }}
    >
      <body className="min-h-dvh bg-[#070c16] text-slate-200 antialiased">
        {/* Fixed background wash. It does not scroll, so the panels read as
            floating past it rather than sitting on a flat page. */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10"
          style={{
            background:
              "radial-gradient(900px 500px at 20% -5%, rgba(23,195,162,0.09), transparent 60%), radial-gradient(700px 500px at 90% 10%, rgba(56,89,145,0.10), transparent 65%), #070c16",
          }}
        />
        <GatewayProvider>
          <ConsoleHeader />
          <main>{children}</main>
        </GatewayProvider>
      </body>
    </html>
  );
}
