import type { VercelRequest, VercelResponse } from "@vercel/node";
import { firestore, type KdsTicketDoc } from "../_firebase.js";
import {
  syncCloverToFirestore,
  type SyncResult,
} from "../_kds-sync.js";
import { storeMidnightMs } from "../_store-time.js";
import { tokenFromRequest, verifyToken } from "./_session.js";

/**
 * GET /api/kds/tickets
 *
 * Returns active kitchen tickets (status != "completed") for the
 * KDS UI to render. Sorted by createdAt ascending so the oldest
 * ticket sits on the left of the board (FIFO prep order).
 *
 * Auth: Authorization: Bearer <session token from /api/kds/auth>
 *
 * Response:
 *   { tickets: [
 *       { orderId, ticketNumber, customerName, items,
 *         status, createdAt (ms), elapsedSec, total }
 *     ] }
 */

interface ResponseTicket {
  orderId: string;
  ticketNumber: string;
  customerName?: string;
  items: {
    n: string;
    q: number;
    m?: string;
    /** Structured modifier list. Each entry: name + group ("Mix-in",
     *  "Topping", "Base", etc.) for KDS color-coding. */
    mods?: { n: string; g?: string }[];
  }[];
  /** Active tickets are "queued" | "in_progress" | "completed".
   *  "picked_up" is only returned when ?include=picked_up is set. */
  status: "queued" | "in_progress" | "completed" | "picked_up";
  createdAtMs: number;
  /** When the ticket was marked completed (if applicable). */
  completedAtMs?: number;
  /** When the customer received the order (if applicable). */
  pickedUpAtMs?: number;
  elapsedSec: number;
  total?: number;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (!verifyToken(tokenFromRequest(req))) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  res.setHeader("Cache-Control", "no-store");

  // Surface sync diagnostic in the response (in addition to logging)
  // so we can debug from the browser without digging through Vercel
  // logs. The KDS UI ignores `_debug`.
  let debugSyncError: string | undefined;
  let debugSyncResult: SyncResult | undefined;
  try {
    // Pull any paid Clover orders that haven't been recorded in
    // Firestore yet (online webhook orders are usually already in;
    // this catches in-store cash-register sales). 5s in-memory cache
    // keeps cost low when the KDS is polling rapidly.
    try {
      debugSyncResult = await syncCloverToFirestore();
      if (debugSyncResult.added > 0)
        console.log(
          `[kds/tickets] synced ${debugSyncResult.added} new tickets from Clover`,
        );
    } catch (e) {
      // Non-fatal — if Clover is down the KDS still reads whatever
      // Firestore already has and the board keeps working.
      debugSyncError = (e as Error).message;
      console.warn(
        "[kds/tickets] Clover sync failed (non-fatal):",
        debugSyncError,
      );
    }

    // Include picked-up tickets only when explicitly requested via
    // `?include=picked_up` — keeps the default response small for
    // the always-on KDS poll. The Picked Up history tab opts in.
    const includePickedUp =
      String(req.query.include ?? "") === "picked_up";
    const statuses = includePickedUp
      ? ["queued", "in_progress", "completed", "picked_up"]
      : ["queued", "in_progress", "completed"];

    // No `orderBy("createdAt")` here — combining it with a `where in`
    // requires a Firestore composite index that we'd have to provision
    // separately. We instead sort the small result set in JS below.
    const snap = await firestore()
      .collection("tickets")
      .where("status", "in", statuses)
      .limit(200)
      .get();

    // Drop anything older than today so the board self-resets at
    // midnight without a manual clear. Firestore docs from prior
    // days stay on disk but don't render.
    const dayStart = storeMidnightMs();

    const now = Date.now();
    const tsToMs = (v: unknown): number | undefined => {
      if (
        v &&
        typeof v === "object" &&
        typeof (v as { toMillis?: () => number }).toMillis === "function"
      ) {
        return (v as { toMillis: () => number }).toMillis();
      }
      return undefined;
    };
    const tickets: ResponseTicket[] = snap.docs
      .map((d: { data(): unknown }) => {
        const data = d.data() as KdsTicketDoc;
        const createdAtMs = tsToMs(data.createdAt) ?? 0;
        const completedAtMs = tsToMs(data.completedAt);
        const pickedUpAtMs = tsToMs(
          (data as { pickedUpAt?: unknown }).pickedUpAt,
        );
        const status: ResponseTicket["status"] =
          data.status === "completed"
            ? "completed"
            : data.status === "in_progress"
              ? "in_progress"
              : data.status === "picked_up"
                ? "picked_up"
                : "queued";
        return {
          orderId: data.orderId,
          ticketNumber: data.ticketNumber,
          customerName: data.customerName,
          items: data.items ?? [],
          status,
          createdAtMs,
          completedAtMs,
          pickedUpAtMs,
          elapsedSec: createdAtMs
            ? Math.floor((now - createdAtMs) / 1000)
            : 0,
          total: data.total,
        };
      })
      // Today-only — drop yesterday's leftovers so the board resets
      // automatically at midnight (store-local).
      .filter((t) => t.createdAtMs >= dayStart)
      // Oldest first — matches the FIFO prep order the KDS card grid
      // expects (leftmost = next to make).
      .sort((a, b) => a.createdAtMs - b.createdAtMs);

    return res.status(200).json({
      tickets,
      _debug: { syncError: debugSyncError, syncResult: debugSyncResult },
    });
  } catch (err) {
    console.error("[kds/tickets]", err);
    return res.status(500).json({ error: (err as Error).message });
  }
}
