import type { VercelRequest, VercelResponse } from "@vercel/node";
import { firestore, type KdsTicketDoc } from "../_firebase.js";
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
  items: { n: string; q: number; m?: string }[];
  status: "queued" | "in_progress";
  createdAtMs: number;
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

  try {
    // No `orderBy("createdAt")` here — combining it with a `where in`
    // requires a Firestore composite index that we'd have to provision
    // separately. We instead sort the small result set (≤50 rows) in
    // JS below, which is plenty fast for a kitchen board.
    const snap = await firestore()
      .collection("tickets")
      .where("status", "in", ["queued", "in_progress"])
      .limit(50)
      .get();

    const now = Date.now();
    const tickets: ResponseTicket[] = snap.docs
      .map((d: { data(): unknown }) => {
        const data = d.data() as KdsTicketDoc;
        // createdAt is a Firestore Timestamp once persisted; in transit
        // we treat it as having .toMillis().
        const createdAt = data.createdAt as { toMillis?: () => number } | null;
        const createdAtMs =
          createdAt && typeof createdAt.toMillis === "function"
            ? createdAt.toMillis()
            : 0;
        return {
          orderId: data.orderId,
          ticketNumber: data.ticketNumber,
          customerName: data.customerName,
          items: data.items ?? [],
          // Narrow to the response union — `as const` keeps the
          // ternary's literal type instead of letting TS widen to
          // `string` (which trips the assignability check below).
          status:
            data.status === "in_progress"
              ? ("in_progress" as const)
              : ("queued" as const),
          createdAtMs,
          elapsedSec: createdAtMs
            ? Math.floor((now - createdAtMs) / 1000)
            : 0,
          total: data.total,
        };
      })
      // Oldest first — matches the FIFO prep order the KDS card grid
      // expects (leftmost = next to make).
      .sort((a, b) => a.createdAtMs - b.createdAtMs);

    return res.status(200).json({ tickets });
  } catch (err) {
    console.error("[kds/tickets]", err);
    return res.status(500).json({ error: (err as Error).message });
  }
}
