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

/**
 * Sync cache window. Was 5s, but every miss did a Firestore .get()
 * + sometimes a .set() per paid order, which blew through the daily
 * Spark-plan quota. 15s gives the KDS still-feels-live updates while
 * cutting sync invocations by 3×. The KDS UI itself polls every 2s
 * but only ONE call out of every ~7-8 actually triggers a Clover hit;
 * the rest hit the cache and read Firestore.
 */
const SYNC_TTL_MS = 15_000;
/**
 * Hard ceiling on how far back we'll ever scan, just to keep the
 * Clover payload bounded if midnight rolls over mid-shift. The actual
 * window is min(storeMidnightToday, now - this) — typically
 * `storeMidnightMs()` dominates so each sync covers "all of today".
 */
const MAX_LOOKBACK_MS = 18 * 60 * 60 * 1000; // 18 hours

interface CloverModification {
  name?: string;
  /** The modifier (full object when we expand
   *  `lineItems.modifications.modifier`). Clover caps expand depth at
   *  3 levels, so we can't directly expand modifierGroup here — it
   *  comes back as a `{id}` reference, and we resolve the group NAME
   *  via a separate cached fetch (`getModifierGroupNames()`). */
  modifier?: { id?: string; name?: string; modifierGroup?: { id?: string } };
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

// ─── Modifier-group name lookup ───────────────────────────────────
// Clover returns `modification.modifier.modifierGroup` as a bare
// `{id}` reference (because expand depth is capped at 3). To color-
// code mix-ins vs toppings vs base on the KDS we need the GROUP
// NAME, so we fetch all modifier groups once an hour and cache an
// id → name map per function instance.
interface CloverModifierGroup {
  id: string;
  name: string;
}
const GROUP_NAMES_TTL_MS = 60 * 60 * 1000;
let groupNamesCache: { ts: number; map: Map<string, string> } | null = null;
let groupNamesInFlight: Promise<Map<string, string>> | null = null;

export async function getModifierGroupNames(): Promise<Map<string, string>> {
  const now = Date.now();
  if (groupNamesCache && now - groupNamesCache.ts < GROUP_NAMES_TTL_MS) {
    return groupNamesCache.map;
  }
  if (groupNamesInFlight) return groupNamesInFlight;
  groupNamesInFlight = (async () => {
    try {
      const data = await cloverRest<{ elements?: CloverModifierGroup[] }>(
        `/modifier_groups?limit=200`,
      );
      const map = new Map<string, string>();
      for (const g of data.elements ?? []) {
        if (g.id && g.name) map.set(g.id, g.name);
      }
      groupNamesCache = { ts: now, map };
      return map;
    } catch (err) {
      console.warn(
        "[kds-sync] modifier-groups fetch failed:",
        (err as Error).message,
      );
      return groupNamesCache?.map ?? new Map<string, string>();
    } finally {
      groupNamesInFlight = null;
    }
  })();
  return groupNamesInFlight;
}

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
    // Clover caps expand depth at 3, so we stop at
    // `lineItems.modifications.modifier`. The modifier carries a
    // `modifierGroup: {id}` reference but not the group name — that's
    // resolved via the cached `getModifierGroupNames()` lookup we
    // run alongside, then merged in buildDoc(). The 4-level form
    // that included `.modifierGroup` returned HTTP 400 and broke
    // every sync until this fix.
    data = await cloverRest<{ elements?: CloverOrder[] }>(
      `/orders?expand=lineItems.modifications.modifier,payments&${filter}&limit=200`,
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

  // Look up modifier-group names (id → "Mix-in" / "Topping" / etc.).
  // Cached for an hour, so this is normally a free no-op.
  const groupNames = await getModifierGroupNames();

  const db = firestore();
  let existingSkipped = 0;
  const addedIds: string[] = [];

  // Run the existence checks + writes in parallel. We previously also
  // ran an unconditional `update()` on every existing doc to backfill
  // items / modifiers — that turned out to be the dominant Firestore
  // op-cost driver (1 read + 1 write per existing doc per sync × 12
  // syncs/min × 60 min × 12 hours = quota burn). Now we only TOUCH
  // new docs. Existing docs are left as-is, which means in-flight
  // item/modifier changes from Clover (rare — voided lines, renamed
  // orders) won't reflect until the doc gets recreated. Acceptable
  // tradeoff vs. running out of Firestore quota at 2pm.
  await Promise.all(
    paid.map(async (order) => {
      const docRef = db.collection("tickets").doc(order.id);
      const existing = await docRef.get();
      if (existing.exists) {
        existingSkipped++;
        return;
      }
      const doc = buildDoc(order, groupNames);
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

/** Translate a Clover order into the KdsTicketDoc shape Firestore stores.
 *  `groupNames` maps `modifierGroup.id → name` and is used to attach
 *  the parent group label to each modification (e.g. "Mix-in", "Topping")
 *  for KDS color-coding. Passed in so callers can share the cached map. */
function buildDoc(
  order: CloverOrder,
  groupNames: Map<string, string>,
): KdsTicketDoc {
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
    // Group name is resolved via the cached id → name map (Clover
    // doesn't return the name inline because of expand-depth limits).
    const mods = (li.modifications?.elements ?? [])
      .map((mod) => {
        const name = (
          mod.name ??
          mod.alternativeName ??
          mod.modifier?.name ??
          ""
        ).trim();
        const groupId = mod.modifier?.modifierGroup?.id;
        const group = groupId ? groupNames.get(groupId) : undefined;
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
