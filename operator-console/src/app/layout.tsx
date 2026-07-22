import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

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

const navItems = [
  { href: "/fleet", label: "Fleet Overview" },
  { href: "/policy", label: "Policy Editor" },
  { href: "/audit", label: "Live Audit Feed" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex bg-[#0B1220] text-slate-100">
        <aside className="w-56 shrink-0 border-r border-slate-800 flex flex-col justify-between p-4">
          <div>
            <div className="text-sm font-semibold tracking-wide text-slate-300 mb-6">
              AegisAgent
            </div>
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          {/* Placeholder kill-switch status chip — wired to real state in a later task */}
          <div className="rounded border border-slate-800 px-3 py-2 text-xs text-slate-400">
            Kill switch: <span className="text-[#17C3A2]">armed</span>
          </div>
        </aside>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
