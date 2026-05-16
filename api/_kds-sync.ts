/**
 * Server-only sync: Clover → Firestore. Called at the top of
 * /api/kds/tickets and /api/tv/display before they read Firestore, so
 * any paid Clover order (online OR in-store cash-register sale)
 * shows up on the KDS within ~5 seconds even though it didn't go
 * through our Hosted Checkout webhook.
 *
 * Why this exists:
 *   - Hosted Checkout payment events fire our webhook → Firestore. ✓
 *   - In-store POS sales (rung up directly on the Clover Station)
 *     never touch our Hosted Checkout flow, so the webhook never
 *     fires. Without this sync the KDS would only ever see online
 *     orders. This pull bridges the gap.
 *
 * Cost discipline:
 *   - 5-second TTL gate so a busy KDS polling every 2s only triggers
 *     a real Clover query every 5s.
 *   - Last-15-minute lookback so payload is small.
 *   - Per-doc `exists` check before write so we never overwrite a
 *     ticket the kitchen has already marked completed or in-progress.
 *
 * Returns {scanned, added} so callers can log it for diagnostics.
 */

import { FieldValue } from "firebase-admin/firestore";
import { cloverRest } from "./_clover.js";
import { firestore, type KdsTicketDoc } from "./_firebase.js";

const SYNC_TTL_MS = 5_000;
/**
 * How far back the sync scans for paid Clover orders that may need to
 * be brought into Firestore. Wider than the queue / status endpoints'
 * 15-min "kitchen load" window — those concern current prep capacity,
 * but the SYNC just needs to find orders that haven't been mirrored
 * yet. 60 min gives plenty of headroom to catch in-store sales that
 * existed before a deploy or after a brief outage.
 *
 * Safe to widen further (e.g. 4h, 8h) — the per-doc `exists` guard
 * inside `doSync()` prevents overwriting already-mirrored tickets.
 * The only cost is a slightly larger Clover payload per sync.
 */
const LOOKBACK_MS = 60 * 60 * 1000;

interface CloverOrder {
  id: string;
  title?: string;
  total?: number;
  paymentState?: string;
  createdTime?: number;
  lineItems?: {
    elements?: { name?: string; unitQty?: number; note?: string }[];
  };
}

export interface SyncResult {
  /** Was this call served from the in-memory TTL cache (no Clover hit)? */
  cached: boolean;
  /** Lookback window in ms — useful for verifying the deploy. */
  lookbackMs: number;
  /** Total orders Clover returned in the lookback window. */
  totalOrders: number;
  /** Of those, how many had paymentState === "PAID". */
  paidOrders: number;
  /** Skipped because the Firestore doc already existed. */
  existingSkipped: number;
  /** Newly written to Firestore. */
  added: number;
  /** Order ids we wrote (for debugging). Empty in cached results. */
  addedIds?: string[];
  /** Error from the Clover/Firestore round-trip, if any. */
  error?: string;
}

let lastResult: { ts: number; result: SyncResult } | null = null;
let inFlight: Promise<SyncResult> | null = null;

/**
 * Run a Clover→Firestore sync. Coalesces concurrent calls — if two
 * requests land within the same TTL window, they share one Clover
 * query and the cached SyncResult.
 */
export async function syncCloverToFirestore(): Promise<SyncResult> {
  const now = Date.now();
  if (lastResult && now - lastResult.ts < SYNC_TTL_MS) {
    // Return the cached result with the cached flag flipped on so
    // the caller can tell this didn't actually hit Clover.
    return { ...lastResult.result, cached: true };
  }
  if (inFlight) return inFlight;

  inFlight = doSync().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doSync(): Promise<SyncResult> {
  const now = Date.now();
  const since = now - LOOKBACK_MS;
  const filter = `filter=${encodeURIComponent(`createdTime>${since}`)}`;

  let data: { elements?: CloverOrder[] };
  try {
    // CRITICAL: `expand=payments` is required. Without it the orders
    // list returns a stale `paymentState: "OPEN"` for every order
    // regardless of whether payment actually succeeded. The same gotcha
    // bit /api/orders/[orderId]/status.ts. We have to expand payments
    // to force Clover to compute the real paymentState. (lineItems is
    // needed by buildDoc to populate the ticket card.)
    data = await cloverRest<{ elements?: CloverOrder[] }>(
      `/orders?expand=lineItems,payments&${filter}&limit=100`,
    );
  } catch (err) {
    const result: SyncResult = {
      cached: false,
      lookbackMs: LOOKBACK_MS,
      totalOrders: 0,
      paidOrders: 0,
      existingSkipped: 0,
      added: 0,
      error: `Clover: ${(err as Error).message}`,
    };
    lastResult = { ts: now, result };
    return result;
  }

  const allOrders = data.elements ?? [];
  const paid = allOrders.filter((o) => o.paymentState === "PAID");

  const db = firestore();
  let existingSkipped = 0;
  const addedIds: string[] = [];

  // Run the existence checks + writes in parallel — Firestore handles
  // burst writes fine, and serializing here would scale poorly when a
  // busy day brings dozens of fresh orders into the lookback window.
  await Promise.all(
    paid.map(async (order) => {
      const docRef = db.collection("tickets").doc(order.id);
      const existing = await docRef.get();
      if (existing.exists) {
        existingSkipped++;
        return;
      }
      try {
        await docRef.set(buildDoc(order), { merge: true });
        addedIds.push(order.id);
      } catch (writeErr) {
        console.warn(
          `[kds-sync] write failed for ${order.id}:`,
          (writeErr as Error).message,
        );
      }
    }),
  );

  const result: SyncResult = {
    cached: false,
    lookbackMs: LOOKBACK_MS,
    totalOrders: allOrders.length,
    paidOrders: paid.length,
    existingSkipped,
    added: addedIds.length,
    addedIds,
  };
  lastResult = { ts: now, result };
  return result;
}

/** Translate a Clover order into the KdsTicketDoc shape Firestore stores. */
function buildDoc(order: CloverOrder): KdsTicketDoc {
  const title = order.title?.trim() ?? "";
  // Distinguish source visually: "Online: Leo" → just "Leo" so the
  // first-name shows on the card. Numeric POS titles ("01", "07") get
  // prefixed so kitchen staff can spot a cash-register order at a
  // glance. Empty / missing titles leave customerName undefined.
  const customerName = title.startsWith("Online: ")
    ? title.slice("Online: ".length).trim() || undefined
    : title
      ? `Counter #${title}`
      : undefined;

  const items = (order.lineItems?.elements ?? []).map((li) => {
    // Clover stores quantity in per-mille units (1000 = 1 unit).
    const q = li.unitQty
      ? Math.max(1, Math.round(li.unitQty / 1000))
      : 1;
    return {
      n: li.name ?? "Item",
      q,
      ...(li.note ? { m: li.note } : {}),
    };
  });

  return {
    orderId: order.id,
    ticketNumber: order.id.slice(-6).toUpperCase(),
    customerName,
    items,
    status: "queued",
    createdAt: FieldValue.serverTimestamp(),
    total: typeof order.total === "number" ? order.total / 100 : undefined,
  };
}
