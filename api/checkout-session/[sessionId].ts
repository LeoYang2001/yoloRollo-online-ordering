import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cloverConfig, cloverRest } from "../_clover.js";

/**
 * GET /api/checkout-session/:sessionId
 *
 * Look up which Clover order was created for a Hosted Checkout
 * session id. Called by the confirmation page when Clover redirected
 * us back without substituting the {order_id} placeholder in the
 * success URL — we use the sessionStorage-stashed sessionId to find
 * the real order ID after the fact.
 *
 * Three lookup paths, tried in order:
 *
 *   0. Vercel KV — fastest. Populated by
 *      /api/clover/hosted-checkout-webhook the moment Clover finishes
 *      processing payment. Hit rate ≈ 100% when KV is enabled AND
 *      the webhook is configured AND the customer landed on
 *      /confirmation a beat after the webhook fired.
 *
 *   1. GET /invoicingcheckoutservice/v1/checkouts/{sessionId} — the
 *      session resource on Clover's ecomm host. When a payment
 *      completes, Clover writes the orderId into the session record.
 *
 *   2. Fallback: list orders created in the last 5 min and pick the
 *      most recent paid one. Defensive — only kicks in if paths 0+1
 *      both miss.
 *
 * Returns:
 *   { orderId: "ABC123XYZ4567", via: "webhook" | "session" | "recent" }
 *   { orderId: null,            via: "none" }
 */

interface CloverOrder {
  id: string;
  paymentState?: string;
  createdTime?: number;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  const sessionId = (req.query.sessionId as string) ?? "";
  if (!sessionId) {
    return res.status(400).json({ error: "sessionId required" });
  }

  const config = cloverConfig();

  // ─── Path 0: KV cache populated by the webhook ────────────────
  // The webhook fires the moment Clover finishes Hosted Checkout,
  // typically before (or within milliseconds of) the customer
  // landing here. When KV is enabled this resolves in one round-trip
  // with no Clover API call.
  try {
    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;
    if (kvUrl && kvToken) {
      const r = await fetch(
        `${kvUrl}/get/${encodeURIComponent(`session:${sessionId}`)}`,
        { headers: { Authorization: `Bearer ${kvToken}` } },
      );
      if (r.ok) {
        const data = (await r.json()) as { result?: string | null };
        if (data.result) {
          return res
            .status(200)
            .json({ orderId: data.result, via: "webhook" });
        }
      }
    }
  } catch (err) {
    console.warn(
      "[checkout-session] KV read failed:",
      (err as Error).message,
    );
  }

  // ─── Path 1: query the checkout session directly ──────────────
  try {
    if (config.ecommPrivateKey) {
      const url = `${config.checkout}/invoicingcheckoutservice/v1/checkouts/${encodeURIComponent(sessionId)}`;
      const resp = await fetch(url, {
        headers: {
          Authorization: `Bearer ${config.ecommPrivateKey}`,
          "X-Clover-Merchant-Id": config.merchantId,
          Accept: "application/json",
        },
      });
      if (resp.ok) {
        const data = (await resp.json()) as {
          orderId?: string;
          order?: { id?: string };
        };
        const orderId =
          data.orderId ??
          data.order?.id ??
          (typeof (data as { order_id?: string }).order_id === "string"
            ? (data as { order_id?: string }).order_id
            : undefined);
        if (orderId) {
          return res.status(200).json({ orderId, via: "session" });
        }
        // Fall through to path 2 — session existed but no order yet.
      } else {
        console.warn(
          `[checkout-session] Clover session lookup returned ${resp.status}`,
        );
      }
    }
  } catch (err) {
    console.warn(
      "[checkout-session] session lookup failed:",
      (err as Error).message,
    );
  }

  // ─── Path 2: scan recent paid orders ──────────────────────────
  // Picks the most-recent paid order created in the last 5 minutes —
  // matches the customer who just completed Hosted Checkout, in the
  // overwhelming common case of one checkout-at-a-time. Multiple
  // simultaneous checkouts could in theory cross wires, but that
  // would be a very rare race for a counter shop.
  try {
    const since = Date.now() - 5 * 60 * 1000;
    const filter = `filter=${encodeURIComponent(`createdTime>${since}`)}`;
    const list = await cloverRest<{ elements?: CloverOrder[] }>(
      `/orders?${filter}&limit=20`,
    );
    const paid = (list.elements ?? [])
      .filter((o) => o.paymentState === "PAID")
      .sort((a, b) => (b.createdTime ?? 0) - (a.createdTime ?? 0));
    if (paid[0]) {
      return res.status(200).json({ orderId: paid[0].id, via: "recent" });
    }
  } catch (err) {
    console.warn(
      "[checkout-session] recent-orders fallback failed:",
      (err as Error).message,
    );
  }

  return res.status(200).json({ orderId: null, via: "none" });
}
