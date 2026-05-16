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
  SessionLookupResponse,
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
   * Resolve a Clover Hosted Checkout sessionId to its underlying Clover
   * orderId. Returns null while the webhook hasn't yet written the
   * mapping (HTTP 202) — the caller should keep polling.
   */
  lookupCheckoutSession: async (
    cs: string,
  ): Promise<SessionLookupResponse | null> => {
    const res = await fetch(
      `/api/checkout-session/${encodeURIComponent(cs)}`,
      { headers: { Accept: "application/json" } },
    );
    if (res.status === 202) return null;
    if (!res.ok) {
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
    return res.json() as Promise<SessionLookupResponse>;
  },
};
