import { useEffect, useState } from "react";

/**
 * Returns `null` until mounted on the client, then a live Date.
 * Avoids SSR/CSR hydration mismatch for clock displays.
 */
export function useMountedClock(intervalMs = 1000) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
