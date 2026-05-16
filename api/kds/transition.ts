import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { firestore } from "../_firebase.js";
import { tokenFromRequest, verifyToken } from "./_session.js";

/**
 * POST /api/kds/transition
 *
 * Body: { orderId: string, action: "complete" | "dismiss" | "recall" }
 *
 * Single-endpoint state-machine driver for KDS ticket transitions —
 * replaces the old per-action /api/kds/complete so we stay under the
 * Hobby plan's 12-function limit while supporting the full workflow.
 *
 * Transitions:
 *   complete  any           → completed   (kitchen finished it)
 *   dismiss   completed     → picked_up   (customer received it)
 *   recall    completed     → queued      (back to the line; e.g. premature Complete)
 *   recall    picked_up     → completed   (customer came back / staff erred)
 *
 * Idempotent. Returns the new status so the client can update its UI
 * without waiting for the next poll.
 */
type Action = "complete" | "dismiss" | "recall";

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

  const body = (req.body ?? {}) as { orderId?: unknown; action?: unknown };
  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  const action = typeof body.action === "string" ? (body.action as Action) : "";
  if (!orderId) return res.status(400).json({ error: "orderId required" });
  if (!["complete", "dismiss", "recall"].includes(action)) {
    return res.status(400).json({
      error: "action must be one of: complete, dismiss, recall",
    });
  }

  try {
    const docRef = firestore().collection("tickets").doc(orderId);
    const snap = await docRef.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "ticket not found", orderId });
    }
    const current = (snap.data()?.status as string) ?? "queued";

    // Decide the next status + which timestamps to set/clear.
    let next: "queued" | "in_progress" | "completed" | "picked_up";
    const fields: Record<string, unknown> = {};

    if (action === "complete") {
      next = "completed";
      fields.completedAt = FieldValue.serverTimestamp();
      // Clear any prior pickedUpAt in case this is a re-complete after a
      // wrongly-applied dismiss.
      fields.pickedUpAt = FieldValue.delete();
    } else if (action === "dismiss") {
      if (current !== "completed") {
        return res.status(409).json({
          error: `dismiss requires status=completed (was ${current})`,
        });
      }
      next = "picked_up";
      fields.pickedUpAt = FieldValue.serverTimestamp();
    } else {
      // recall — branch on current state
      if (current === "picked_up") {
        next = "completed";
        fields.pickedUpAt = FieldValue.delete();
      } else if (current === "completed") {
        next = "queued";
        fields.completedAt = FieldValue.delete();
      } else {
        return res.status(409).json({
          error: `recall requires status=completed or picked_up (was ${current})`,
        });
      }
    }

    fields.status = next;
    await docRef.update(fields);
    return res.status(200).json({ ok: true, orderId, status: next });
  } catch (err) {
    console.error("[kds/transition]", err);
    return res.status(500).json({ error: (err as Error).message });
  }
}
