import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import type { OrderRequest, OrderResponse } from "../../src/types";
import {
  cloverCharge,
  cloverHostedCheckout,
  cloverRest,
  isMockMode,
} from "../_clover.js";

/**
 * POST /api/orders/create
 *
 * Two payment paths, each with different order-creation timing:
 *
 *   ─── Inline (paymentToken present) ─────────────────────────────
 *   1. Pre-create Clover order shell with line items.
 *   2. Charge the token via /v1/charges.
 *   3. Mark the order PAID + return its ID to the client.
 *   The pre-creation is mandatory here — the Charges API only
 *   creates a payment, not an order; the order has to exist first.
 *
 *   ─── Hosted Checkout (no paymentToken) ─────────────────────────
 *   1. Create a Hosted Checkout session with the cart line items.
 *      DO NOT pre-create an order — Clover Hosted Checkout creates
 *      its own order when payment completes. Pre-creating would
 *      result in a duplicate ticket in the kitchen queue.
 *   2. Return the redirect URL to the client.
 *   3. After payment, Clover redirects to /confirmation?order_id=…
 *      and the Confirmation page updates the order's title to
 *      "Online: <name>" so the kitchen ticket shows the right name.
 *
 * Clover Hosted Checkout REQUIRES HTTPS redirect URLs. On localhost
 * the resolved base URL is http://, so we either:
 *   - Use `process.env.CHECKOUT_BASE_URL` if you've set one (e.g.
 *     an ngrok HTTPS tunnel), or
 *   - Fail with a clear 400 telling you to deploy / set the env var.
 *
 * On real HTTPS deploys (Vercel preview / prod), the request's own
 * URL is HTTPS and everything just works.
 */

const ticketNumber = (orderId: string) => {
  const tail = orderId.slice(-4).toUpperCase();
  return `R-${tail}`;
};

const dollarsToCents = (d: number) => Math.round(d * 100);

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body as OrderRequest;
  if (!body?.lines?.length) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  const subtotal = body.lines.reduce(
    (s, l) => s + l.unitPrice * l.quantity,
    0,
  );
  const tax = +(subtotal * 0.0975).toFixed(2);
  const total = +(subtotal + tax).toFixed(2);

  // Mock mode: keep the UI-only dev path working without Clover credentials.
  if (isMockMode()) {
    const fakeId = `mock_${Date.now()}`;
    return res.status(200).json({
      orderId: fakeId,
      ticketNumber: ticketNumber(fakeId),
      checkoutUrl: `/confirmation/${fakeId}`,
      totals: { subtotal, tax, total },
    } satisfies OrderResponse);
  }

  // ═══════════════════════════════════════════════════════════════
  //   INLINE CHARGE PATH (paymentToken present)
  // ═══════════════════════════════════════════════════════════════
  if (body.paymentToken) {
    // ─── 1. Pre-create order shell ──────────────────────────────
    let inlineOrderId: string;
    try {
      const order = await cloverRest<{ id: string }>("/orders", {
        method: "POST",
        body: JSON.stringify({
          state: "open",
          title: `Online: ${body.customerName}`,
          note: body.notes ?? "",
        }),
      });
      inlineOrderId = order.id;
    } catch (err) {
      console.error("[orders/create] order shell failed:", err);
      return res.status(500).json({
        error: `Could not create order: ${(err as Error).message}`,
      });
    }

    // ─── 2. Add line items + modifications ──────────────────────
    try {
      for (const line of body.lines) {
        const li = await cloverRest<{ id: string }>(
          `/orders/${inlineOrderId}/line_items`,
          {
            method: "POST",
            body: JSON.stringify({
              item: { id: line.itemId },
              price: dollarsToCents(line.unitPrice),
              unitQty: line.quantity,
              note: line.notes,
            }),
          },
        );

        for (const mod of line.modifiers) {
          await cloverRest(
            `/orders/${inlineOrderId}/line_items/${li.id}/modifications`,
            {
              method: "POST",
              body: JSON.stringify({
                modifier: { id: mod.id },
                amount: dollarsToCents(mod.priceDelta),
                name: mod.name,
              }),
            },
          ).catch((e) => {
            console.warn("[orders/create] modification add failed", mod.id, e);
          });
        }
      }
    } catch (err) {
      console.error("[orders/create] line items failed:", err);
      return res.status(500).json({
        error: `Could not attach line items: ${(err as Error).message}`,
        orderId: inlineOrderId,
      });
    }

    // ─── 3. Charge the token via /v1/charges ────────────────────
    try {
      const charge = await cloverCharge({
        source: body.paymentToken,
        amount: dollarsToCents(total),
        currency: "usd",
        description: `Yolo Rollo · ${ticketNumber(inlineOrderId)}`,
        capture: true,
      });
      if (charge.status !== "succeeded" || !charge.paid) {
        return res.status(402).json({
          error: `Payment ${charge.status}. Please try a different card.`,
          orderId: inlineOrderId,
        });
      }
      // Tag the order PAID. Best-effort — even if it fails, the money
      // already moved and the kitchen can pull the ticket up by ID.
      await cloverRest(`/orders/${inlineOrderId}`, {
        method: "POST",
        body: JSON.stringify({
          paymentState: "PAID",
          note: body.notes
            ? `${body.notes} — paid online (${charge.id})`
            : `paid online (${charge.id})`,
        }),
      }).catch((e) => {
        console.warn("[orders/create] order PAID tag failed:", e);
      });

      return res.status(200).json({
        orderId: inlineOrderId,
        ticketNumber: ticketNumber(inlineOrderId),
        // Empty-host checkoutUrl signals the client: no Clover redirect
        // needed, payment is already done — just go to /confirmation.
        checkoutUrl: `/confirmation/${inlineOrderId}`,
        totals: { subtotal, tax, total },
      } satisfies OrderResponse);
    } catch (err) {
      console.error("[orders/create] inline charge failed:", err);
      return res.status(500).json({
        error: `Could not charge card: ${(err as Error).message}`,
        orderId: inlineOrderId,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //   HOSTED CHECKOUT PATH (no paymentToken)
  // ═══════════════════════════════════════════════════════════════
  // No pre-creation. Clover creates the order from shoppingCart.lineItems
  // when payment succeeds. Avoids the duplicate-ticket bug we had when
  // we were doing both.

  const explicitBase = process.env.CHECKOUT_BASE_URL?.replace(/\/$/, "");
  const forwardedProto = req.headers["x-forwarded-proto"] as
    | string
    | undefined;
  const host = req.headers.host ?? "";
  const proto =
    forwardedProto ?? (host.includes("localhost") ? "http" : "https");
  const base = explicitBase ?? `${proto}://${host}`;

  if (!base.startsWith("https://")) {
    return res.status(400).json({
      error:
        "Clover Hosted Checkout requires HTTPS for the redirect URLs but " +
        `the resolved base is "${base}". Options:\n` +
        "  • Deploy to Vercel preview (npx vercel deploy) and test there\n" +
        "  • Run `npx ngrok http 3000` and set CHECKOUT_BASE_URL=https://<your-tunnel>.ngrok-free.app in .env.local",
    });
  }

  // Decision C: generate an 8-char correlation id and embed it on the
  // Hosted Checkout request so /api/checkout-session/[id]?cid=... can
  // find the resulting paid order in the recent-orders list.
  //
  // We tried `customer.firstName = cid` first — turns out Clover
  // pre-fills the customer-facing form with whatever we send there,
  // so the customer saw "807A20CD" in the First Name field. Bad UX.
  // Channels we use now (in order of cleanness):
  //   - merchantMetadata.correlationId     (cleanest — invisible
  //                                         everywhere; works only if
  //                                         Clover exposes it on the
  //                                         resulting order)
  //   - First line item's note appended    (definitely survives onto
  //     with ` · ref:<cid>`                 the order; visible to KDS
  //                                         as a small suffix, low-noise)
  const cid = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();

  try {
    const checkout = await cloverHostedCheckout<{
      href: string;
      checkoutSessionId: string;
    }>(
      {
        // Leave the customer block empty — Clover requires it to be
        // present (non-null) but all fields are optional. The "pickup
        // name" we collected is just the kitchen-ticket label, not
        // the cardholder; pre-filling Clover's First/Last/Email
        // fields would either (1) mislead the customer into thinking
        // we already have their card-billing info, or (2) overwrite
        // what they actually want to type for the card. We keep the
        // pickup name in merchantMetadata.customerName below so we
        // still have it for the order's "Online: <name>" rename and
        // for support lookups.
        customer: {},
        shoppingCart: {
          // Real cart items, plus a single "Tax" line. Clover Hosted
          // Checkout doesn't apply tax automatically from what we
          // send — it just charges sum(price × unitQty) — so without
          // this line the customer would be charged the subtotal
          // only, less than what our /checkout Pay button promised.
          // Adding it as a line item shows up on the receipt + KDS
          // as a separate "Tax" line.
          //
          // We also append the cid to the FIRST product line's note
          // (`· ref:XXX`) so the lookup endpoint can find this order
          // by scanning recent orders' line items.
          lineItems: [
            ...body.lines.map((l, i) => {
              const noteParts = [
                l.modifiers.map((m) => m.name).join(", "),
                l.notes,
              ].filter(Boolean);
              if (i === 0) noteParts.push(`ref:${cid}`);
              return {
                name: l.itemName,
                unitQty: l.quantity,
                price: dollarsToCents(l.unitPrice),
                note: noteParts.join(" · ") || undefined,
              };
            }),
            {
              name: "Tax",
              unitQty: 1,
              price: dollarsToCents(tax),
            },
          ],
        },
        // Sent as a second cid channel. We don't know whether Clover
        // persists this onto the resulting order's queryable fields —
        // if it does, the lookup endpoint can match on it without
        // touching line items at all. Free insurance.
        merchantMetadata: {
          fulfillment: "pickup",
          source: "yolo-rollo-web",
          customerName: body.customerName,
          customerPhone: body.customerPhone || "",
          customerEmail: body.customerEmail || "",
          correlationId: cid,
        },
      },
      {
        // Confirmed empirically: this merchant's Hosted Checkout does
        // NOT substitute {order_id} placeholders and does NOT auto-
        // append order_id to the success URL either. We keep the URL
        // plain — the Confirmation page detects the missing orderId
        // and looks it up via /api/checkout-session/{sessionId}?cid=…
        // using the sessionId + cid we stashed in sessionStorage
        // before the redirect.
        success: `${base}/confirmation`,
        failure: `${base}/checkout?error=payment_failed`,
      },
    );

    return res.status(200).json({
      // No real order ID yet — Clover hasn't created one. We surface
      // the session id as a placeholder so the existing OrderResponse
      // shape stays the same; the lookup endpoint exchanges it (+ cid)
      // for the real orderId after Clover finishes processing payment.
      orderId: checkout.checkoutSessionId,
      ticketNumber: "—",
      checkoutUrl: checkout.href,
      totals: { subtotal, tax, total },
      correlationId: cid,
    } satisfies OrderResponse);
  } catch (err) {
    console.error("[orders/create] hosted checkout failed:", err);
    return res.status(500).json({
      error: `Could not start payment: ${(err as Error).message}`,
    });
  }
}
