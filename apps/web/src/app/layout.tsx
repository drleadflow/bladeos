import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
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
        <nav className="fixed top-0 left-0 right-0 z-50 h-12 bg-zinc-900/80 backdrop-blur-sm border-b border-zinc-800 flex items-center px-4">
          <Link href="/" className="text-lg font-bold text-zinc-100 hover:text-white transition-colors">
            Blade
          </Link>
          <div className="flex-1 flex items-center justify-center gap-6">
            <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors">
              Chat
            </Link>
            <Link href="/jobs" className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors">
              Jobs
            </Link>
            <Link href="/costs" className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors">
              Costs
            </Link>
            <Link href="/settings" className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors">
              Settings
            </Link>
          </div>
          <div className="w-[60px]" />
        </nav>
        <main className="pt-12">
          {children}
        </main>
      </body>
    </html>
  );
}
