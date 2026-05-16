import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cloverRest } from "./_clover.js";

/**
 * GET /api/queue
 *
 * Real-time pickup wait estimate, computed directly from Clover orders.
 *
 *   { minutes, queueDepth, asOf, source }
 *
 * Previously this proxied a separate KDS service. We dropped that hop:
 * Clover is already the authoritative store for orders + payment state,
 * so going direct removes a moving part and saves a network round-trip.
 *
 * Rules:
 *   - Count orders that are PAID and were created within LOOKBACK_MS.
 *     Anything older is assumed handed off (Clover has no kitchen-done
 *     state, so we cap the window to avoid stuck orders inflating the
 *     ETA forever).
 *   - Cold-drink-only orders (bottled water, soda, frappuccino, etc.)
 *     don't add prep time — they're grab-and-go.
 *   - 2 minutes of prep per remaining ticket.
 *
 * Query params:
 *   - placed=true   → caller's order is already in the queue (Confirmation
 *                     page). Wait = queueDepth × 2 min.
 *   - placed=false  → caller hasn't ordered yet (Cart / Checkout). Wait =
 *                     (queueDepth + 1) × 2 min — their order will land
 *                     behind the queue.
 *
 * Falls back to a stable 8-minute estimate when Clover is unreachable so
 * the page never breaks just because an upstream is down.
 */

const PREP_MIN_PER_TICKET = 2;
const FALLBACK_MINUTES = 8;
/**
 * Server-side cache window for the Clover query. Short enough that
 * customers polling the queue see near-live numbers; long enough
 * that a busy storefront with multiple concurrent visitors doesn't
 * hammer Clover with a request per render.
 */
const CACHE_TTL_MS = 5_000;
/**
 * Treat any paid order older than this as already handed off. Clover
 * has no native kitchen-complete state — without a cap, a single
 * forgotten order would balloon the ETA indefinitely. 15 min × 1
 * ticket per 2 min ≈ 7 max tickets ahead, which matches a reasonable
 * peak-hour scenario for a counter shop.
 */
const LOOKBACK_MS = 15 * 60 * 1000; // 15 minutes

// Cold-drink patterns — anything purely grab-and-go.
const COLD_DRINK_PATTERNS: RegExp[] = [
  /\bwater\b/i,
  /\bred\s*bull\b/i,
  /\bbottle\b/i,
  /\bsoda\b/i,
  /\bjuice\b/i,
  /\bfrappuccino\b/i,
  /\bcoke\b/i,
  /\bsprite\b/i,
  /\bpepsi\b/i,
  /\bgatorade\b/i,
];

function isColdDrink(name: string): boolean {
  return COLD_DRINK_PATTERNS.some((re) => re.test(name));
}

// ─── Clover API response shapes (only the fields we read) ───────────
interface CloverLineItem {
  id: string;
  name?: string;
  refunded?: boolean;
}
interface CloverOrder {
  id: string;
  state?: string;
  paymentState?: string;
  createdTime?: number;
  lineItems?: { elements?: CloverLineItem[] };
}
interface CloverOrdersResponse {
  elements?: CloverOrder[];
}

/**
 * True if this paid order needs kitchen prep.
 * False if it's empty or entirely cold drinks (grab-and-go).
 */
function orderNeedsPrep(o: CloverOrder): boolean {
  const items = (o.lineItems?.elements ?? []).filter((i) => !i.refunded);
  if (items.length === 0) return false;
  return items.some((i) => !isColdDrink(i.name ?? ""));
}

// ─── Server-side cache (per Vercel function instance) ───────────────
// Clover order data only realistically changes every few seconds. 15s
// resolution is plenty for the UI and saves us a round-trip on every
// Cart / Checkout / Confirmation render.
let cache: {
  ts: number;
  queueDepth: number;
  asOf: string;
} | null = null;

async function fetchQueueFromClover(): Promise<{
  queueDepth: number;
  asOf: string;
} | null> {
  try {
    const since = Date.now() - LOOKBACK_MS;
    // Clover only supports server-side filtering on a small set of
    // fields (state, createdTime, modifiedTime, etc.). `paymentState` is
    // NOT in that set — filtering on it silently returns an empty list.
    // So we filter by createdTime server-side, then narrow to paid
    // orders in JS. The lookback window keeps the payload small enough
    // that this is cheap.
    //
    // Filter values containing `=` or `>` must be percent-encoded.
    const filter = `filter=${encodeURIComponent(`createdTime>${since}`)}`;
    // IMPORTANT: `expand=payments` is required — without it Clover's
    // order list returns a stale `paymentState: "OPEN"` for every
    // order regardless of whether payment actually succeeded. Adding
    // payments to the expansion forces the API to compute the real
    // paymentState, so the .filter(paymentState === "PAID") below
    // actually finds anything.
    const data = await cloverRest<CloverOrdersResponse>(
      `/orders?expand=lineItems,payments&${filter}&limit=100`,
    );
    const paid = (data.elements ?? []).filter(
      (o) => o.paymentState === "PAID",
    );
    const active = paid.filter(orderNeedsPrep);
    return {
      queueDepth: active.length,
      asOf: new Date().toISOString(),
    };
  } catch (err) {
    console.warn("[queue] Clover fetch failed:", (err as Error).message);
    return null;
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  // Edge cache hint — short, since wait times change.
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=15, stale-while-revalidate=30",
  );

  const placed = req.query.placed === "true";

  // Serve from cache when fresh enough.
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    const minutes =
      (cache.queueDepth + (placed ? 0 : 1)) * PREP_MIN_PER_TICKET;
    return res.status(200).json({
      minutes: Math.max(PREP_MIN_PER_TICKET, minutes),
      queueDepth: cache.queueDepth,
      asOf: cache.asOf,
      source: "clover" as const,
    });
  }

  const fresh = await fetchQueueFromClover();
  if (!fresh) {
    return res.status(200).json({
      minutes: FALLBACK_MINUTES,
      queueDepth: 0,
      asOf: new Date().toISOString(),
      source: "fallback" as const,
    });
  }

  cache = {
    ts: Date.now(),
    queueDepth: fresh.queueDepth,
    asOf: fresh.asOf,
  };

  const minutes =
    (fresh.queueDepth + (placed ? 0 : 1)) * PREP_MIN_PER_TICKET;
  return res.status(200).json({
    minutes: Math.max(PREP_MIN_PER_TICKET, minutes),
    queueDepth: fresh.queueDepth,
    asOf: fresh.asOf,
    source: "clover" as const,
  });
}
