import { Outlet } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { TopBar } from "./TopBar";
import { LeftNav } from "./LeftNav";
import { useBladeRealtime } from "@/hooks/use-blade-realtime";

export function AppShell() {
  useBladeRealtime();
  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-[#050508] text-[var(--blade-text)]">
      {/* Background layers */}
      <div className="pointer-events-none fixed inset-0 blade-hex-bg opacity-60" />
      <div className="pointer-events-none fixed inset-0 blade-scanlines opacity-50" />
      <div
        className="pointer-events-none fixed inset-0 blade-heartbeat"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(220,38,38,0.10), transparent 70%)",
        }}
      />

      <TopBar />
      <div className="relative flex flex-1 overflow-hidden">
        <LeftNav />
        <main className="relative flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>

      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: "rgba(0,0,0,0.85)",
            border: "1px solid rgba(220,38,38,0.4)",
            color: "white",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: "12px",
          },
        }}
      />
    </div>
  );
}
