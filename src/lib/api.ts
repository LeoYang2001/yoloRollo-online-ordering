/**
 * Thin client wrapper around our own /api routes.
 * The browser never talks to Clover directly — everything goes through
 * Vercel serverless functions where the Clover API token lives.
 */
import type {
  Menu,
  OrderRequest,
  OrderResponse,
  OrderStatus,
  QueueEstimate,
} from "../types";

async function http<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    // Try to surface the friendly server error message ({"error":"..."})
    // before falling back to the raw body / status text.
    const text = await res.text().catch(() => "");
    let msg = text || res.statusText;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.error) msg = parsed.error;
    } catch {
      // not JSON; keep raw text
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getMenu: () => http<Menu>("/api/menu"),
  createOrder: (body: OrderRequest) =>
    http<OrderResponse>("/api/orders/create", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getOrderStatus: (orderId: string) =>
    http<OrderStatus>(`/api/orders/${encodeURIComponent(orderId)}/status`),
  /**
   * Live wait-time estimate, computed server-side from paid Clover orders.
   *
   *   placed=false (default) — caller's order is NOT yet in the queue
   *     (Cart / Checkout). The server adds 1 ticket worth of prep time
   *     for the upcoming order.
   *   placed=true — caller's order is already in the queue
   *     (Confirmation page, post-payment). No extra time is added.
   */
  getQueueEstimate: (placed = false) =>
    http<QueueEstimate>(`/api/queue?placed=${placed ? "true" : "false"}`),
};
