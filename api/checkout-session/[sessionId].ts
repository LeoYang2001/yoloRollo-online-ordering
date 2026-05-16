import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cloverConfig, cloverRest } from "../_clover.js";

/**
 * GET /api/checkout-session/:sessionId?cid=…
 *
 * Look up which Clover order was created for a Hosted Checkout
 * session id. Called by the confirmation page when Clover redirected
 * us back without substituting the {order_id} placeholder in the
 * success URL — we use the sessionStorage-stashed sessionId (+ a
 * server-generated correlation id `cid` that was embedded into the
 * Clover order's customer.firstName) to find the real order ID after
 * the fact.
 *
 * Lookup paths, tried in order:
 *
 *   0. Vercel KV — populated by /api/clover/hosted-checkout-webhook
 *      if the webhook is wired up. Skipped automatically when KV
 *      isn't provisioned or the webhook never fires.
 *
 *   1. GET /invoicingcheckoutservice/v1/checkouts/{sessionId} — the
 *      session resource on Clover's ecomm host. When a payment
 *      completes, Clover writes the orderId into the session record.
 *      Undocumented but works on some merchants.
 *
 *   2. Decision-C correlation match (preferred): list orders created
 *      in the last 5 min with customers expanded, then filter to the
 *      order whose customer.firstName === cid. Reliable and precise
 *      because each /api/orders/create generates a unique cid.
 *
 *   3. Last-resort fallback: most-recent paid order in the last 5 min.
 *      Only correct under no-concurrency; we tag the response so the
 *      client (and logs) know we used this fuzzy path.
 *
 * Returns:
 *   { orderId: "ABC123XYZ4567",
 *     via: "webhook" | "session" | "cid-match" | "recent" }
 *   { orderId: null, via: "none" }
 */

interface CloverLineItem {
  id?: string;
  name?: string;
  note?: string;
}

interface CloverOrder {
  id: string;
  paymentState?: string;
  createdTime?: number;
  /** Populated when we query with ?expand=lineItems. The cid is
   *  appended to the first line item's note as `· ref:XXXXXXXX`. */
  lineItems?: { elements?: CloverLineItem[] };
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  const sessionId = (req.query.sessionId as string) ?? "";
  if (!sessionId) {
    return res.status(400).json({ error: "sessionId required" });
  }
  // Decision-C correlation id. Server-generated 8-char token passed to
  // Clover via customer.firstName + merchantMetadata.correlationId
  // during /api/orders/create. The Confirmation page stashes it in
  // sessionStorage and sends it back here so Path 2 can match the
  // exact order rather than guess by recency.
  const cid = ((req.query.cid as string) ?? "").trim() || undefined;

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

  // ─── Path 2: scan recent paid orders, prefer cid match ────────
  // List orders created in the last 5 minutes with line items expanded.
  // If a cid was passed, find the order whose first line item's note
  // contains `ref:<cid>` (precise — each /api/orders/create generates
  // a unique cid). Otherwise (or if cid match misses) fall back to the
  // most-recent paid order, which is correct under no concurrency.
  try {
    const since = Date.now() - 5 * 60 * 1000;
    const filter = `filter=${encodeURIComponent(`createdTime>${since}`)}`;
    const list = await cloverRest<{ elements?: CloverOrder[] }>(
      `/orders?${filter}&expand=lineItems&limit=20`,
    );
    const paid = (list.elements ?? []).filter(
      (o) => o.paymentState === "PAID",
    );

    if (cid) {
      const marker = `ref:${cid.toUpperCase()}`;
      const exact = paid.find((o) =>
        o.lineItems?.elements?.some((li) =>
          (li.note ?? "").toUpperCase().includes(marker),
        ),
      );
      if (exact) {
        console.log(
          `[checkout-session] cid match cid=${cid} -> order=${exact.id}`,
        );
        return res.status(200).json({ orderId: exact.id, via: "cid-match" });
      }
      console.warn(
        `[checkout-session] cid=${cid} not found in last-5-min paid orders ` +
          `(scanned ${paid.length} orders). Falling back to most-recent.`,
      );
    }

    const mostRecent = [...paid].sort(
      (a, b) => (b.createdTime ?? 0) - (a.createdTime ?? 0),
    )[0];
    if (mostRecent) {
      return res
        .status(200)
        .json({ orderId: mostRecent.id, via: "recent" });
    }
  } catch (err) {
    console.warn(
      "[checkout-session] recent-orders fallback failed:",
      (err as Error).message,
    );
  }

  return res.status(200).json({ orderId: null, via: "none" });
}
