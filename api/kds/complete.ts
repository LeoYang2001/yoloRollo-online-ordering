import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { firestore } from "../_firebase.js";
import { tokenFromRequest, verifyToken } from "./_session.js";

/**
 * POST /api/kds/complete
 *
 * Body: { orderId: string }
 *
 * Marks the ticket completed. The customer's confirmation page reads
 * the same Firestore doc (via /api/orders/:orderId/status) so it
 * advances to "Ready for pickup" immediately.
 *
 * Auth: Authorization: Bearer <session token>
 *
 * Idempotent — re-completing a ticket is a no-op.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!verifyToken(tokenFromRequest(req))) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const orderId = String((req.body as { orderId?: unknown })?.orderId ?? "");
  if (!orderId) {
    return res.status(400).json({ error: "orderId required" });
  }

  try {
    await firestore()
      .collection("tickets")
      .doc(orderId)
      .set(
        {
          status: "completed",
          completedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    return res.status(200).json({ ok: true, orderId });
  } catch (err) {
    console.error("[kds/complete]", err);
    return res.status(500).json({ error: (err as Error).message });
  }
}
