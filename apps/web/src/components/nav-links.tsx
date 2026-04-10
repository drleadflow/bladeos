"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/today", label: "Today" },
  { href: "/", label: "Chat" },
  { href: "/clients", label: "Clients" },
  { href: "/performance", label: "Performance" },
  { href: "/agents", label: "Agents" },
  { href: "/runs", label: "Runs" },
  { href: "/workers", label: "Workers" },
  { href: "/jobs", label: "Jobs" },
  { href: "/costs", label: "Costs" },
  { href: "/settings", label: "Settings" },
] as const;

export function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {navItems.map(({ href, label }) => {
        const isActive =
          href === "/" ? pathname === "/" : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            className={`rounded-full px-3 py-1.5 text-sm transition-all ${
              isActive
                ? "bg-white text-zinc-950 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                : "text-zinc-400 hover:bg-white/8 hover:text-zinc-100"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </>
  );
}
