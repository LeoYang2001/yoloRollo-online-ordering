import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { OrderStatus } from "../../../src/types";
import { cloverRest, isMockMode } from "../../_clover.js";

/**
 * GET /api/orders/:orderId/status
 *
 * Polled by the confirmation page. Returns the customer's order
 * status PLUS the derived UI step ("paid"/"preparing"/"ready") that
 * powers the three checkmarks on the confirmation screen.
 *
 * Why this is more than a passthrough to Clover:
 *   Clover doesn't have a native "kitchen prep" state machine. Once
 *   payment lands, the Clover order sits in `state: "locked"` /
 *   `paymentState: "PAID"` forever unless the KDS pushes a state
 *   update back — which it currently doesn't. So we derive the step
 *   the customer sees from two real signals:
 *
 *     1. queue position — how many PAID orders are ahead of this one
 *        in the last 15 min window (same window /api/queue uses)
 *     2. elapsed time since our order was paid
 *
 *   Rules:
 *     - position > 0  AND  elapsed < (position+1)*2min  → "paid" (in queue)
 *     - position == 0 AND  elapsed < 2min                → "preparing" (next up)
 *     - position == 0 AND  elapsed >= 2min               → "ready"
 *     - elapsed >= (position+1)*2min  → "ready" (time-cap, in case the
 *       queue isn't draining — assume the kitchen got to us)
 *     - order not found in last-15-min window           → "ready"
 *     - paymentState != PAID                            → "pending_payment"
 *
 * Ticket number is the last 6 chars of the Clover order id,
 * uppercased — matches what shows on the KDS (e.g. CT6EQC).
 *
 * In mock mode we cycle through states by elapsed time so the UI is
 * testable without a real Clover account.
 */

const PREP_SECONDS = 120; // 2 minutes per ticket
const LOOKBACK_MS = 15 * 60 * 1000;

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

interface CIItem {
  id: string;
  name?: string;
  refunded?: boolean;
}
interface CIOrder {
  id: string;
  state?: string;
  paymentState?: string;
  createdTime?: number;
  modifiedTime?: number;
  lineItems?: { elements?: CIItem[] };
}

function orderNeedsPrep(o: CIOrder): boolean {
  const items = (o.lineItems?.elements ?? []).filter((i) => !i.refunded);
  if (items.length === 0) return false;
  return items.some(
    (i) => !COLD_DRINK_PATTERNS.some((re) => re.test(i.name ?? "")),
  );
}

const ticketNumber = (orderId: string) => {
  if (orderId.startsWith("mock_")) return "DEMO01";
  return orderId.slice(-6).toUpperCase();
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  const orderId = (req.query.orderId as string) ?? "";
  if (!orderId) return res.status(400).json({ error: "orderId required" });

  res.setHeader("Cache-Control", "no-store");

  // ─── Mock mode — simulate time-based progression ────────────────
  if (isMockMode() || orderId.startsWith("mock_")) {
    const ts = Number(orderId.split("_")[1] ?? Date.now());
    const elapsed = Date.now() - ts;
    let state: OrderStatus["state"] = "preparing";
    if (elapsed < 8_000) state = "paid";
    else if (elapsed < 25_000) state = "preparing";
    else if (elapsed < 60_000) state = "ready";
    else state = "completed";

    return res.status(200).json({
      orderId,
      ticketNumber: ticketNumber(orderId),
      state,
      updatedAt: new Date().toISOString(),
    } satisfies OrderStatus);
  }

  try {
    // One Clover call that gets us the queue AND this order in the
    // same response (the order is created inside the lookback window,
    // so it'll appear in the queue list).
    const since = Date.now() - LOOKBACK_MS;
    const filter = `filter=${encodeURIComponent(`createdTime>${since}`)}`;
    // IMPORTANT: `expand=payments` is required — without it Clover's
    // order list returns a stale `paymentState: "OPEN"` for every
    // order regardless of whether payment actually succeeded. Adding
    // payments to the expansion forces the API to compute the real
    // paymentState. (lineItems is needed by orderNeedsPrep below.)
    const queueResp = await cloverRest<{ elements?: CIOrder[] }>(
      `/orders?expand=lineItems,payments&${filter}&limit=100`,
    );
    const allOrders = queueResp.elements ?? [];

    const myOrder = allOrders.find((o) => o.id === orderId);

    // ─── Branch 1: order not in last-15-min queue ──────────────────
    // Either the order is too old (kitchen probably finished it) or
    // it was deleted. Either way, treat as ready/done.
    if (!myOrder) {
      // Fall back to a single direct fetch so we can return a real
      // ticketNumber when the order does exist but is older than
      // 15 min, AND still cover the 404 case gracefully.
      try {
        // Same `?expand=payments` quirk as the list query above —
        // without it Clover returns stale paymentState=OPEN.
        const fallback = await cloverRest<CIOrder>(
          `/orders/${orderId}?expand=payments`,
        );
        return res.status(200).json({
          orderId,
          ticketNumber: ticketNumber(orderId),
          state:
            fallback.paymentState === "PAID" ? "ready" : "pending_payment",
          updatedAt: fallback.modifiedTime
            ? new Date(fallback.modifiedTime).toISOString()
            : new Date().toISOString(),
        } satisfies OrderStatus);
      } catch {
        return res.status(200).json({
          orderId,
          ticketNumber: ticketNumber(orderId),
          state: "ready", // optimistic: assume it cleared
          updatedAt: new Date().toISOString(),
        } satisfies OrderStatus);
      }
    }

    // ─── Branch 2: payment hasn't landed yet ────────────────────────
    if (myOrder.paymentState !== "PAID") {
      return res.status(200).json({
        orderId,
        ticketNumber: ticketNumber(orderId),
        state: "pending_payment",
        updatedAt: myOrder.modifiedTime
          ? new Date(myOrder.modifiedTime).toISOString()
          : new Date().toISOString(),
      } satisfies OrderStatus);
    }

    // ─── Branch 3: paid — compute queue position + derived state ───
    const myCreatedTime = myOrder.createdTime ?? Date.now();
    const aheadOfMe = allOrders
      .filter((o) => o.paymentState === "PAID")
      .filter(orderNeedsPrep)
      .filter((o) => (o.createdTime ?? 0) < myCreatedTime)
      .filter((o) => o.id !== orderId)
      .length;
    const elapsedSec = (Date.now() - myCreatedTime) / 1000;

    let state: OrderStatus["state"];
    if (aheadOfMe === 0) {
      state = elapsedSec >= PREP_SECONDS ? "ready" : "preparing";
    } else if (elapsedSec >= (aheadOfMe + 1) * PREP_SECONDS) {
      // Hard time cap — even if Clover/KDS hasn't moved, assume done
      // after the estimated wait expires so the customer's UI doesn't
      // get stuck on "Order received" forever.
      state = "ready";
    } else {
      state = "paid";
    }

    return res.status(200).json({
      orderId,
      ticketNumber: ticketNumber(orderId),
      state,
      updatedAt: myOrder.modifiedTime
        ? new Date(myOrder.modifiedTime).toISOString()
        : new Date().toISOString(),
    } satisfies OrderStatus);
  } catch (err) {
    console.error("[orders/status]", err);
    return res.status(500).json({ error: (err as Error).message });
  }
}
