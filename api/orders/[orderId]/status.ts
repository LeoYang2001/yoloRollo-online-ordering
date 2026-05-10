import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { OrderStatus } from "../../../src/types";
import { cloverRest, isMockMode } from "../../_clover";

/**
 * GET /api/orders/:orderId/status
 *
 * Polled by the confirmation page every 5s.
 * In mock mode we cycle through a few states so the UI is testable.
 */

interface CIOrder {
  id: string;
  state: string;
  paymentState?: string;
  modifiedTime?: number;
}

const ticketNumber = (orderId: string) => {
  if (orderId.startsWith("mock_")) return `R-DEMO`;
  return `R-${orderId.slice(-4).toUpperCase()}`;
};

const cloverStateToUi = (
  o: CIOrder,
): OrderStatus["state"] => {
  if (o.paymentState === "PAID") {
    if (o.state === "open") return "preparing";
    if (o.state === "locked") return "ready";
    if (o.state === "done") return "completed";
    return "paid";
  }
  if (o.state === "cancelled") return "cancelled";
  return "pending_payment";
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  const orderId = (req.query.orderId as string) ?? "";
  if (!orderId) return res.status(400).json({ error: "orderId required" });

  res.setHeader("Cache-Control", "no-store");

  if (isMockMode() || orderId.startsWith("mock_")) {
    // Move through states based on time-since-creation so the demo
    // confirmation screen shows progress.
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
    const order = await cloverRest<CIOrder>(`/orders/${orderId}`);
    const status: OrderStatus = {
      orderId,
      ticketNumber: ticketNumber(orderId),
      state: cloverStateToUi(order),
      updatedAt: order.modifiedTime
        ? new Date(order.modifiedTime).toISOString()
        : new Date().toISOString(),
    };
    return res.status(200).json(status);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: (err as Error).message });
  }
}
