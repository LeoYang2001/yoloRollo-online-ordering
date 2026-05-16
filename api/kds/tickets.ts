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
    const snap = await firestore()
      .collection("tickets")
      .where("status", "in", ["queued", "in_progress"])
      .orderBy("createdAt", "asc")
      .limit(50)
      .get();

    const now = Date.now();
    const tickets: ResponseTicket[] = snap.docs.map((d: { data(): unknown }) => {
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
        status: data.status === "in_progress" ? "in_progress" : "queued",
        createdAtMs,
        elapsedSec: createdAtMs ? Math.floor((now - createdAtMs) / 1000) : 0,
        total: data.total,
      };
    });

    return res.status(200).json({ tickets });
  } catch (err) {
    console.error("[kds/tickets]", err);
    return res.status(500).json({ error: (err as Error).message });
  }
}
