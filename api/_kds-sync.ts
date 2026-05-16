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
const LOOKBACK_MS = 15 * 60 * 1000;

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

let lastSyncTs = 0;
let inFlight: Promise<{ scanned: number; added: number }> | null = null;

/**
 * Run a Clover→Firestore sync. Coalesces concurrent calls — if two
 * requests land within the same TTL window, they share one Clover
 * query. Returns instantly with {0,0} if the cache is fresh.
 */
export async function syncCloverToFirestore(): Promise<{
  scanned: number;
  added: number;
}> {
  const now = Date.now();
  if (now - lastSyncTs < SYNC_TTL_MS) {
    return { scanned: 0, added: 0 };
  }
  if (inFlight) return inFlight;

  inFlight = doSync(now).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doSync(
  now: number,
): Promise<{ scanned: number; added: number }> {
  // Update the timestamp BEFORE the network call so a slow Clover
  // doesn't get stampeded by every poll that lands during the window.
  lastSyncTs = now;

  const since = now - LOOKBACK_MS;
  const filter = `filter=${encodeURIComponent(`createdTime>${since}`)}`;
  const data = await cloverRest<{ elements?: CloverOrder[] }>(
    `/orders?expand=lineItems&${filter}&limit=100`,
  );

  const paid = (data.elements ?? []).filter(
    (o) => o.paymentState === "PAID",
  );

  const db = firestore();
  let added = 0;

  // Run the existence checks + writes in parallel — Firestore handles
  // burst writes fine, and serializing here would scale poorly when a
  // busy day brings dozens of fresh orders into the lookback window.
  await Promise.all(
    paid.map(async (order) => {
      const docRef = db.collection("tickets").doc(order.id);
      const existing = await docRef.get();
      if (existing.exists) {
        // Don't overwrite. Staff may have marked it completed or
        // in_progress, and Clover doesn't know about that.
        return;
      }
      await docRef.set(buildDoc(order), { merge: true });
      added++;
    }),
  );

  return { scanned: paid.length, added };
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
