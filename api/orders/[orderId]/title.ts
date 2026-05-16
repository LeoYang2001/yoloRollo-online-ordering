import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cloverRest, isMockMode } from "../../_clover.js";

/**
 * POST /api/orders/:orderId/title
 *
 * Updates the title of a Clover order. Used by the Confirmation page
 * to rename Hosted-Checkout-created orders from Clover's auto-assigned
 * IDs (e.g. "#ANYHKM") to "Online: <customer name>" so the kitchen
 * ticket reads cleanly.
 *
 * Body: { title: string }
 *
 * Called fire-and-forget from the client — non-blocking, best-effort.
 * If it fails, the kitchen sees the original Clover ticket title and
 * can still pull up the order; nothing breaks.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const orderId = (req.query.orderId as string) ?? "";
  if (!orderId) {
    return res.status(400).json({ error: "orderId required in path" });
  }

  const body = req.body as { title?: string };
  const title = body?.title?.trim();
  if (!title) {
    return res.status(400).json({ error: "title required in body" });
  }
  if (title.length > 120) {
    return res.status(400).json({ error: "title too long (max 120 chars)" });
  }

  if (isMockMode() || orderId.startsWith("mock_")) {
    // No-op in mock mode — just echo back.
    return res.status(200).json({ ok: true, orderId, title, mock: true });
  }

  try {
    await cloverRest(`/orders/${orderId}`, {
      method: "POST",
      body: JSON.stringify({ title }),
    });
    return res.status(200).json({ ok: true, orderId, title });
  } catch (err) {
    console.error("[orders/title] update failed:", err);
    return res.status(500).json({ error: (err as Error).message });
  }
}
