import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { NavLinks } from "../components/nav-links";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Blade Super Agent",
  description: "The AI agent that learns AND ships code",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-950 text-zinc-100`}
      >
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute inset-x-0 top-[-12rem] h-[28rem] bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_44%),radial-gradient(circle_at_18%_20%,rgba(59,130,246,0.16),transparent_24%),radial-gradient(circle_at_82%_12%,rgba(20,184,166,0.12),transparent_22%)]" />
          <div className="absolute left-[-6rem] top-[18rem] h-[18rem] w-[18rem] rounded-full bg-blue-500/10 blur-3xl" />
          <div className="absolute bottom-[-8rem] right-[-4rem] h-[18rem] w-[18rem] rounded-full bg-cyan-400/10 blur-3xl" />
        </div>

        <nav className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-zinc-950/80 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4 sm:px-6">
            <Link
              href="/"
              className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-zinc-100 transition-colors hover:border-cyan-400/40 hover:bg-white/10"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-cyan-300 via-sky-400 to-blue-500 text-[11px] font-bold text-zinc-950">
                B
              </span>
              <span>Blade</span>
            </Link>

            <div className="hidden h-5 w-px bg-white/10 md:block" />

            <div className="flex min-w-0 flex-1 items-center justify-center">
              <div className="scrollbar-none flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-white/10 bg-white/5 p-1">
                <NavLinks />
              </div>
            </div>

            <div className="hidden md:block">
              <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-300">
                Command Center
              </div>
            </div>
          </div>
        </nav>
        <main className="relative pt-14">
          {children}
        </main>
      </body>
    </html>
  );
}
