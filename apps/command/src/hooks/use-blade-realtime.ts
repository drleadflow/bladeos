import { useEffect } from "react";
import { toast } from "sonner";
import { API_URL } from "@/lib/api";
import { useBladeStore } from "@/stores/blade-store";

/**
 * Subscribes to the backend SSE stream and dispatches updates into the store.
 * Also kicks off an initial refresh and a slow polling fallback for static stats.
 */
export function useBladeRealtime() {
  const refreshAll = useBladeStore((s) => s.refreshAll);
  const pushTimelineEvent = useBladeStore((s) => s.pushTimelineEvent);
  const fetchCosts = useBladeStore((s) => s.fetchCosts);
  const fetchSecurity = useBladeStore((s) => s.fetchSecurity);
  const fetchJobs = useBladeStore((s) => s.fetchJobs);
  const fetchMissions = useBladeStore((s) => s.fetchMissions);

  useEffect(() => {
    refreshAll();

    let es: EventSource | null = null;
    try {
      const token = import.meta.env.VITE_BLADE_TOKEN as string | undefined;
      const streamUrl = `${API_URL}/api/stream${token ? `?token=${token}` : ""}`;
      es = new EventSource(streamUrl);
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          switch (data.type) {
            case "activity":
              if (data.payload) pushTimelineEvent(data.payload);
              break;
            case "security":
              fetchSecurity();
              if (data.payload?.severity === "critical" || data.payload?.severity === "high") {
                toast.error("Security event", { description: data.payload?.summary });
              }
              break;
            case "job":
              fetchJobs();
              if (data.payload?.status === "completed") {
                toast.success("PR opened", { description: data.payload?.summary });
              }
              break;
            case "mission":
              fetchMissions();
              break;
            case "cost":
              fetchCosts();
              break;
            case "connected":
            default:
              break;
          }
        } catch {
          /* ignore malformed events */
        }
      };
      es.onerror = () => {
        // EventSource auto-reconnects.
      };
    } catch (e) {
      console.warn("[realtime] SSE unavailable", e);
    }

    // Slow polling fallback every 30s.
    const poll = setInterval(() => {
      fetchCosts();
      fetchSecurity();
    }, 30_000);

    return () => {
      es?.close();
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
