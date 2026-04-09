import type { Metadata } from "next";
import localFont from "next/font/local";
import { BladeSidebar } from "../components/sidebar/blade-sidebar";
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
  title: "Blade OS",
  description: "AI-powered operating system for your business",
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

        <BladeSidebar />
        <main className="relative md:pl-64">
          {children}
        </main>
      </body>
    </html>
  );
}
