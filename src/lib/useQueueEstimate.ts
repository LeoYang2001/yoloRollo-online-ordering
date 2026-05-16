import { useEffect, useState } from "react";
import { api } from "./api";
import type { QueueEstimate } from "../types";

/**
 * Live pickup wait-time estimate.
 *
 *   const { estimate, loading } = useQueueEstimate({ placed: false });
 *   estimate?.minutes   // → 12
 *   estimate?.queueDepth // → 5
 *
 * Fetches /api/queue once on mount, then re-polls every 30s. The
 * server-side endpoint caches for 15s so this is cheap.
 *
 *   placed=false  → caller is on Cart / Checkout, hasn't placed yet.
 *                  Server adds 1 ticket's worth of prep time.
 *   placed=true   → caller is on Confirmation, ticket already in queue.
 *
 * If Clover is unreachable the endpoint returns a fallback (8 minutes)
 * — the hook still resolves, never throws, so the UI always shows a
 * number.
 */
interface Options {
  placed?: boolean;
  /** Disable to stop polling (e.g. component unmounted but still in
   *  AnimatePresence). Defaults to true. */
  enabled?: boolean;
  /** ms between polls. Defaults to 10s so the cart and checkout
   *  pages reflect kitchen load nearly live without hammering
   *  /api/queue (which itself caches Clover for 5s). */
  intervalMs?: number;
}

export function useQueueEstimate({
  placed = false,
  enabled = true,
  intervalMs = 10_000,
}: Options = {}) {
  const [estimate, setEstimate] = useState<QueueEstimate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const data = await api.getQueueEstimate(placed);
        if (!cancelled) {
          setEstimate(data);
          setLoading(false);
        }
      } catch {
        // Endpoint already handles its own failures — if even our /api
        // is down, we just keep the previous estimate. Loading stays
        // true on the very first failed call so the caller can show a
        // skeleton if it wants.
      }
    };

    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [placed, enabled, intervalMs]);

  return { estimate, loading };
}
