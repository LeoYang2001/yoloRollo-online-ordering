import type { VercelRequest, VercelResponse } from "@vercel/node";
import { firestore, type KdsTicketDoc } from "../_firebase.js";
import { syncCloverToFirestore } from "../_kds-sync.js";
import { storeMidnightMs } from "../_store-time.js";

/**
 * GET /api/tv/display
 *
 * Public (no auth) data feed for the in-store TV at /tv. Returns:
 *
 *   {
 *     preparing: [{ ticketNumber, customerName?, agedSec }],  // oldest first
 *     ready:     [{ ticketNumber, customerName?, agedSec }],  // newest first
 *     asOf:      ISO string
 *   }
 *
 * "preparing" = status in [queued, in_progress], capped at 6.
 * "ready"     = status=completed AND completedAt within last 5 minutes,
 *               capped at 6.
 *
 * We only return ticket numbers (and optional first name) — no
 * line items, no prices, no full names — so the screen never reveals
 * customer info to other patrons.
 *
 * Cached in-memory for 2 seconds per Vercel instance to keep
 * Firestore reads low when multiple TVs poll concurrently.
 */

const PREPARING_CAP = 6;
const READY_CAP = 6;
/**
 * Cap how stale a "ready" ticket can be before we stop showing it on
 * the TV. With explicit Dismiss in the KDS the staff now controls when
 * a ticket leaves the board — but if they forget, this acts as a
 * safety net. Generous (30 min) since dismiss is the canonical exit.
 */
const READY_WINDOW_MS = 30 * 60 * 1000;
const CACHE_TTL_MS = 2_000;

interface TvTicket {
  ticketNumber: string;
  customerName?: string;
  agedSec: number;
}
interface TvPayload {
  preparing: TvTicket[];
  ready: TvTicket[];
  asOf: string;
}

let cache: { ts: number; payload: TvPayload } | null = null;

function firstName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  return name.split(/\s+/)[0];
}

function tsToMs(v: unknown): number {
  // Firestore Timestamp shape: { toMillis(): number }
  if (
    v &&
    typeof v === "object" &&
    typeof (v as { toMillis?: () => number }).toMillis === "function"
  ) {
    return (v as { toMillis: () => number }).toMillis();
  }
  return 0;
}

export default async function handler(
  _req: VercelRequest,
  res: VercelResponse,
) {
  // Edge cache hint — short, since the data changes.
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=2, stale-while-revalidate=8",
  );

  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return res.status(200).json(cache.payload);
  }

  const now = Date.now();
  const readyCutoff = now - READY_WINDOW_MS;
  // Filter out yesterday's leftovers so the TV resets at midnight.
  const dayStart = storeMidnightMs();

  // Sync newly-paid Clover orders into Firestore before reading. The
  // helper has its own 5s TTL so this is cheap when called every 3s.
  try {
    await syncCloverToFirestore();
  } catch (e) {
    console.warn(
      "[tv/display] Clover sync failed (non-fatal):",
      (e as Error).message,
    );
  }

  try {
    const db = firestore();

    // ─── Preparing ────────────────────────────────────────────────
    // Single-field equality where (no composite index needed). Sort
    // and cap client-side.
    const preparingSnap = await db
      .collection("tickets")
      .where("status", "in", ["queued", "in_progress"])
      .limit(50)
      .get();

    const preparing: TvTicket[] = preparingSnap.docs
      .map((d) => d.data() as KdsTicketDoc)
      .map((data) => ({
        data,
        createdMs: tsToMs(data.createdAt),
      }))
      // Today only — yesterday's stale tickets shouldn't loiter.
      .filter(({ createdMs }) => createdMs >= dayStart)
      .sort((a, b) => a.createdMs - b.createdMs)
      .slice(0, PREPARING_CAP)
      .map(({ data, createdMs }) => ({
        ticketNumber: data.ticketNumber,
        customerName: firstName(data.customerName),
        agedSec: createdMs ? Math.floor((now - createdMs) / 1000) : 0,
      }));

    // ─── Ready ────────────────────────────────────────────────────
    // Pull recent completions (cap 30 for safety), then filter to
    // the last 5 minutes and sort newest first.
    const readySnap = await db
      .collection("tickets")
      .where("status", "==", "completed")
      .limit(30)
      .get();

    const ready: TvTicket[] = readySnap.docs
      .map((d) => d.data() as KdsTicketDoc)
      .map((data) => ({
        data,
        completedMs: tsToMs(data.completedAt),
        createdMs: tsToMs(data.createdAt),
      }))
      // Today only — the 30-min READY_WINDOW_MS still applies on top
      // as a safety cap if staff forgets to dismiss.
      .filter(
        ({ completedMs, createdMs }) =>
          completedMs > readyCutoff && createdMs >= dayStart,
      )
      .sort((a, b) => b.completedMs - a.completedMs)
      .slice(0, READY_CAP)
      .map(({ data, completedMs }) => ({
        ticketNumber: data.ticketNumber,
        customerName: firstName(data.customerName),
        agedSec: completedMs ? Math.floor((now - completedMs) / 1000) : 0,
      }));

    const payload: TvPayload = {
      preparing,
      ready,
      asOf: new Date(now).toISOString(),
    };
    cache = { ts: now, payload };
    return res.status(200).json(payload);
  } catch (err) {
    console.error("[tv/display]", err);
    // Soft-fail: empty arrays so the TV keeps rendering rather than
    // showing an error state to in-store customers.
    return res.status(200).json({
      preparing: [],
      ready: [],
      asOf: new Date(now).toISOString(),
    } satisfies TvPayload);
  }
}
