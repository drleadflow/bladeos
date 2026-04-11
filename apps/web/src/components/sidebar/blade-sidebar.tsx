"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

interface NavSection {
  id: string;
  label: string;
  icon: string;
  color: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    id: "command-center",
    label: "Command Center",
    icon: "⌘",
    color: "#22d3ee",
    items: [
      { href: "/", label: "Cockpit", icon: "◈" },
      { href: "/scorecard", label: "Scorecard", icon: "◉" },
      { href: "/compass", label: "Clarity Compass", icon: "◎" },
      { href: "/focus", label: "Focus Timer", icon: "◌" },
      { href: "/delegation", label: "Delegation", icon: "◆" },
      { href: "/chat", label: "Advisor Chat", icon: "◇" },
    ],
  },
  {
    id: "studio",
    label: "Studio",
    icon: "▶",
    color: "#c084fc",
    items: [
      { href: "/studio", label: "Content Studio", icon: "◈" },
      { href: "/studio/library", label: "Library", icon: "◉" },
      { href: "/studio/calendar", label: "Calendar", icon: "◎" },
      { href: "/studio/analytics", label: "Analytics", icon: "◌" },
    ],
  },
  {
    id: "revenue",
    label: "Revenue",
    icon: "$",
    color: "#34d399",
    items: [
      { href: "/revenue", label: "Dashboard", icon: "◈" },
      { href: "/revenue/pipeline", label: "Pipeline", icon: "◉" },
      { href: "/revenue/leads", label: "Leads OS", icon: "◎" },
      { href: "/revenue/clients", label: "Clients", icon: "◌" },
      { href: "/revenue/closer", label: "Closer", icon: "◆" },
      { href: "/revenue/outreach", label: "Outreach", icon: "◇" },
      { href: "/revenue/campaigns", label: "Campaigns", icon: "▣" },
    ],
  },
  {
    id: "workforce",
    label: "Workforce",
    icon: "⚡",
    color: "#a78bfa",
    items: [
      { href: "/workforce", label: "All Employees", icon: "◈" },
      { href: "/workforce/performance", label: "Performance", icon: "◉" },
      { href: "/workforce/routines", label: "Routines", icon: "◎" },
      { href: "/workforce/approvals", label: "Approvals", icon: "◌" },
      { href: "/workforce/playbooks", label: "Playbooks", icon: "◆" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    icon: "⚙",
    color: "#f59e0b",
    items: [
      { href: "/operations", label: "Dashboard", icon: "◈" },
      { href: "/operations/workflows", label: "Workflows", icon: "◉" },
      { href: "/operations/monitors", label: "Monitors", icon: "◎" },
      { href: "/operations/automations", label: "Automations", icon: "◌" },
      { href: "/operations/cron", label: "Cron Jobs", icon: "◆" },
    ],
  },
  {
    id: "engineering",
    label: "Engineering",
    icon: "▸",
    color: "#60a5fa",
    items: [
      { href: "/engineering", label: "Dashboard", icon: "◈" },
      { href: "/engineering/runs", label: "Runs", icon: "◉" },
      { href: "/engineering/workers", label: "Workers", icon: "◎" },
      { href: "/engineering/jobs", label: "Jobs", icon: "◌" },
      { href: "/engineering/costs", label: "Costs", icon: "◆" },
    ],
  },
  {
    id: "memory",
    label: "Memory",
    icon: "◉",
    color: "#f472b6",
    items: [
      { href: "/memory", label: "Business Memory", icon: "◈" },
      { href: "/memory/sops", label: "SOPs & Wiki", icon: "◉" },
      { href: "/memory/decisions", label: "Decision Log", icon: "◎" },
      { href: "/memory/customers", label: "Customer Memory", icon: "◌" },
    ],
  },
  {
    id: "control",
    label: "Control",
    icon: "⊡",
    color: "#94a3b8",
    items: [
      { href: "/control/settings", label: "Settings", icon: "◈" },
      { href: "/control/integrations", label: "Integrations", icon: "◉" },
      { href: "/control/permissions", label: "Permissions", icon: "◎" },
      { href: "/control/billing", label: "Billing", icon: "◌" },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function isSectionActive(pathname: string, section: NavSection): boolean {
  return section.items.some((item) => isActive(pathname, item.href));
}

export function BladeSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    const active = sections.find((s) => isSectionActive("", s));
    return new Set(active ? [active.id] : ["command-center"]);
  });

  // Auto-expand the active section on route change
  useEffect(() => {
    const active = sections.find((s) => isSectionActive(pathname, s));
    if (active) {
      setExpandedSections((prev) => {
        const next = new Set(prev);
        next.add(active.id);
        return next;
      });
    }
  }, [pathname]);

  // Close mobile on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Prevent body scroll on mobile open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  function toggleSection(id: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-300 via-sky-400 to-blue-500 text-xs font-bold text-zinc-950">
          B
        </div>
        {!collapsed && (
          <div>
            <div className="text-sm font-semibold text-zinc-100">Blade OS</div>
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Command Center
            </div>
          </div>
        )}
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 scrollbar-none">
        {sections.map((section, idx) => {
          const expanded = expandedSections.has(section.id);
          const sectionActive = isSectionActive(pathname, section);

          return (
            <div key={section.id}>
              {idx > 0 && <div className="my-2 border-t border-white/5" />}

              {/* Section header */}
              <button
                onClick={() => toggleSection(section.id)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/5"
              >
                <span
                  className="flex h-5 w-5 items-center justify-center rounded text-[11px] font-semibold"
                  style={{
                    backgroundColor: `${section.color}18`,
                    color: section.color,
                  }}
                >
                  {section.icon}
                </span>
                {!collapsed && (
                  <>
                    <span
                      className="flex-1 text-xs font-semibold uppercase tracking-widest"
                      style={{
                        color: sectionActive ? section.color : "#71717a",
                      }}
                    >
                      {section.label}
                    </span>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-zinc-600 transition-transform"
                      style={{
                        transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                      }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </>
                )}
              </button>

              {/* Section items */}
              {expanded && !collapsed && (
                <div className="mt-0.5 space-y-0.5 pl-2">
                  {section.items.map((item) => {
                    const active = isActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] transition-all"
                        style={{
                          backgroundColor: active ? `${section.color}15` : "transparent",
                          color: active ? section.color : "#a1a1aa",
                          fontWeight: active ? 500 : 400,
                        }}
                      >
                        <span className="text-[10px] opacity-50">{item.icon}</span>
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 px-5 py-3">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="hidden w-full items-center justify-center rounded-lg py-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300 md:flex"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: collapsed ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
            }}
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="text-center text-[10px] text-zinc-600">
          Blade OS v2.0
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-zinc-900 shadow-lg md:hidden"
        aria-label="Open menu"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-cyan-400"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`fixed bottom-0 left-0 top-0 z-50 flex w-64 transform flex-col border-r border-white/10 bg-zinc-950 transition-transform duration-300 ease-in-out md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-zinc-900"
          aria-label="Close menu"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-zinc-400"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex fixed bottom-0 left-0 top-0 z-10 flex-col border-r border-white/10 bg-zinc-950/95 backdrop-blur-xl transition-all duration-200 ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
