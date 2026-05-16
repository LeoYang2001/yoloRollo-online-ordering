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
import { storeMidnightMs } from "./_store-time.js";

const SYNC_TTL_MS = 5_000;
/**
 * Hard ceiling on how far back we'll ever scan, just to keep the
 * Clover payload bounded if midnight rolls over mid-shift. The actual
 * window is min(storeMidnightToday, now - this) — typically
 * `storeMidnightMs()` dominates so each sync covers "all of today".
 */
const MAX_LOOKBACK_MS = 18 * 60 * 60 * 1000; // 18 hours

interface CloverModification {
  name?: string;
  /** The parent modifier group's name, e.g. "Base" / "Mix-in" /
   *  "Topping" / "Boba". Used to color-code in the KDS UI so staff
   *  don't mistake a mix-in for a topping. Clover surfaces this on
   *  the modifier nested under modification when we expand
   *  `lineItems.modifications.modifier`. */
  modifier?: { name?: string; modifierGroup?: { id?: string; name?: string } };
  /** Some accounts populate alternativeName directly. */
  alternativeName?: string;
}

interface CloverLineItem {
  name?: string;
  unitQty?: number;
  note?: string;
  /** Populated when the Clover query includes
   *  `expand=lineItems.modifications`. Each modification is one
   *  modifier the customer (or cashier) selected. */
  modifications?: {
    elements?: CloverModification[];
  };
}

interface CloverOrder {
  id: string;
  title?: string;
  total?: number;
  paymentState?: string;
  createdTime?: number;
  lineItems?: { elements?: CloverLineItem[] };
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
  // Pull EVERYTHING since store-midnight today so the KDS naturally
  // resets at the end of each business day. Bounded by MAX_LOOKBACK_MS
  // so a misconfigured clock or DST edge case can't blow up the
  // Clover payload.
  const since = Math.max(storeMidnightMs(), now - MAX_LOOKBACK_MS);
  const filter = `filter=${encodeURIComponent(`createdTime>${since}`)}`;

  let data: { elements?: CloverOrder[] };
  try {
    // CRITICAL: `expand=payments` is required. Without it the orders
    // list returns a stale `paymentState: "OPEN"` for every order
    // regardless of whether payment actually succeeded. The same gotcha
    // bit /api/orders/[orderId]/status.ts. `lineItems.modifications`
    // pulls each modifier (mix-ins / toppings / boba / etc.) so the
    // KDS card can show what the customer ordered, not just the base
    // item name.
    // Nested expand `lineItems.modifications.modifier.modifierGroup`
    // is required to surface each modification's parent group name
    // ("Mix-in" vs "Topping" etc.). The KDS uses that group name to
    // color-code the modifier lines so staff don't confuse one with
    // another while plating.
    data = await cloverRest<{ elements?: CloverOrder[] }>(
      `/orders?expand=lineItems.modifications.modifier.modifierGroup,payments&${filter}&limit=200`,
    );
  } catch (err) {
    const result: SyncResult = {
      cached: false,
      lookbackMs: now - since,
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
      const doc = buildDoc(order);
      if (existing.exists) {
        // Don't overwrite status/completedAt/createdAt — staff may
        // have marked it in_progress or completed. But DO refresh
        // items + customerName + total in case the cashier voided a
        // line, added a modifier, or renamed the order in Clover. This
        // also backfills modifications onto tickets that were synced
        // before we knew to expand `lineItems.modifications`.
        existingSkipped++;
        try {
          await docRef.update({
            items: doc.items,
            customerName: doc.customerName ?? null,
            total: doc.total ?? null,
            ticketNumber: doc.ticketNumber,
          });
        } catch (updateErr) {
          console.warn(
            `[kds-sync] backfill update failed for ${order.id}:`,
            (updateErr as Error).message,
          );
        }
        return;
      }
      try {
        await docRef.set(doc, { merge: true });
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
    lookbackMs: now - since,
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
    // Structured modifier list: each entry carries the modifier
    // name (e.g. "Oreo") AND its modifier-group name (e.g. "Mix-in"),
    // so the KDS can color-code mix-ins vs toppings vs base vs boba.
    const mods = (li.modifications?.elements ?? [])
      .map((mod) => {
        const name = (mod.name ?? mod.alternativeName ?? mod.modifier?.name ?? "")
          .trim();
        const group = (mod.modifier?.modifierGroup?.name ?? "").trim();
        return name ? { n: name, g: group || undefined } : null;
      })
      .filter(Boolean) as { n: string; g?: string }[];
    // Legacy `m` string — kept so older KDS clients render something
    // sensible until they pick up the new `mods` array.
    const m =
      mods.length > 0
        ? mods.map((mm) => mm.n).join(", ")
        : li.note?.trim() || undefined;
    return {
      n: li.name ?? "Item",
      q,
      ...(m ? { m } : {}),
      ...(mods.length > 0 ? { mods } : {}),
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
