import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X, Check, MessageSquare } from "lucide-react";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "https://blade-web-production.up.railway.app";
const AUTH_TOKEN = import.meta.env.VITE_BLADE_TOKEN as string | undefined;

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
}

export function NotificationBanner() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const poll = async () => {
      try {
        const headers: Record<string, string> = {};
        if (AUTH_TOKEN) headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;
        const res = await fetch(`${API_URL}/api/notifications`, { headers });
        const json = await res.json();
        if (json.success && json.data) {
          const unread = json.data.filter((n: Notification) => !n.read && ["mission_review", "mission_failed", "mission_input"].includes(n.type));
          setNotifications(unread.slice(0, 3));
        }
      } catch { /* ignore */ }
    };
    poll();
    const interval = setInterval(poll, 10_000);
    return () => clearInterval(interval);
  }, []);

  const dismiss = async (id: string) => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (AUTH_TOKEN) headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;
      await fetch(`${API_URL}/api/notifications`, { method: "POST", headers, body: JSON.stringify({ id }) });
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch { /* ignore */ }
  };

  if (notifications.length === 0) return null;

  const typeConfig: Record<string, { color: string; icon: typeof AlertTriangle }> = {
    mission_review: { color: "#22C55E", icon: Check },
    mission_failed: { color: "#EF4444", icon: AlertTriangle },
    mission_input: { color: "#F59E0B", icon: MessageSquare },
  };

  return (
    <div className="fixed top-12 left-16 right-0 z-40 px-4 space-y-1">
      <AnimatePresence>
        {notifications.map((n) => {
          const cfg = typeConfig[n.type] ?? { color: "#666", icon: AlertTriangle };
          const Icon = cfg.icon;
          return (
            <motion.div
              key={n.id}
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              className="flex items-center gap-3 rounded-md border px-4 py-2 backdrop-blur-xl"
              style={{ borderColor: `${cfg.color}44`, background: `${cfg.color}11` }}
            >
              <Icon size={14} style={{ color: cfg.color }} />
              <div className="flex-1">
                <div className="font-mono text-[10px] uppercase" style={{ color: cfg.color }}>{n.title}</div>
                <div className="font-mono text-[11px] text-white/60 truncate">{n.message}</div>
              </div>
              <button onClick={() => dismiss(n.id)} className="text-white/30 hover:text-white/60">
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
