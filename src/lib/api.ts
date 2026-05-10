/**
 * Thin client wrapper around our own /api routes.
 * The browser never talks to Clover directly — everything goes through
 * Vercel serverless functions where the Clover API token lives.
 */
import type { Menu, OrderRequest, OrderResponse, OrderStatus } from "../types";

async function http<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
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
};
