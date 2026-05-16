import type { VercelRequest, VercelResponse } from "@vercel/node";
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
 * Two divergent flows depending on whether the client included a
 * `paymentToken`:
 *
 *   - Inline (paymentToken present) — Clover.js / Apple Pay / Google Pay
 *     produced a card token on the client. We:
 *       1. Pre-create a Clover order shell + line items.
 *       2. Charge the token via the Ecommerce Charges API.
 *       3. Tag the order PAID.
 *     We end up holding a real Clover orderId, so the response carries
 *     `kind:"inline"` with `orderId` and the client navigates same-origin
 *     to `/confirmation/<orderId>`.
 *
 *   - Hosted (no paymentToken) — customer is redirected to Clover's
 *     hosted page. Clover creates its own order at payment time;
 *     /invoicingcheckoutservice/v1/checkouts has NO field to attach a
 *     session to a pre-existing order, so any shell we create here
 *     would be a forever-unpaid orphan. We skip the pre-create and:
 *       1. Create a Hosted Checkout session with the cart.
 *       2. Return `kind:"hosted"` with `checkoutSessionId` + the Clover
 *          redirect URL.
 *     The post-redirect confirmation page resolves the sessionId to a
 *     real orderId via GET /api/checkout-session/[cs], which reads a
 *     mapping populated by api/webhooks/clover.ts on the PAYMENT event.
 *
 * Clover Hosted Checkout REQUIRES HTTPS redirect URLs. On localhost the
 * resolved base URL is http://, so we either:
 *   - Use `process.env.CHECKOUT_BASE_URL` if you've set one (e.g. an
 *     ngrok HTTPS tunnel), or
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
      kind: "inline",
      orderId: fakeId,
      ticketNumber: ticketNumber(fakeId),
      checkoutUrl: `/confirmation/${fakeId}`,
      totals: { subtotal, tax, total },
    } satisfies OrderResponse);
  }

  // ───────────────────────────────────────────────────────────────────
  // INLINE PATH — paymentToken present, pre-create + charge + tag PAID
  // ───────────────────────────────────────────────────────────────────
  if (body.paymentToken) {
    let orderId: string;
    try {
      const order = await cloverRest<{ id: string }>("/orders", {
        method: "POST",
        body: JSON.stringify({
          state: "open",
          title: `Online: ${body.customerName}`,
          note: body.notes ?? "",
        }),
      });
      orderId = order.id;
    } catch (err) {
      console.error("[orders/create] order shell failed:", err);
      return res.status(500).json({
        error: `Could not create order: ${(err as Error).message}`,
      });
    }

    try {
      for (const line of body.lines) {
        const li = await cloverRest<{ id: string }>(
          `/orders/${orderId}/line_items`,
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
            `/orders/${orderId}/line_items/${li.id}/modifications`,
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
      });
    }

    try {
      const charge = await cloverCharge({
        source: body.paymentToken,
        amount: dollarsToCents(total),
        currency: "usd",
        description: `Yolo Rollo · ${ticketNumber(orderId)}`,
        capture: true,
      });
      if (charge.status !== "succeeded" || !charge.paid) {
        return res.status(402).json({
          error: `Payment ${charge.status}. Please try a different card.`,
        });
      }
      // Tag the order so it shows as PAID in Clover Dashboard. Best-effort —
      // even if it fails, the money already moved and the kitchen can pull
      // the ticket up by ID.
      await cloverRest(`/orders/${orderId}`, {
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
        kind: "inline",
        orderId,
        ticketNumber: ticketNumber(orderId),
        checkoutUrl: `/confirmation/${orderId}`,
        totals: { subtotal, tax, total },
      } satisfies OrderResponse);
    } catch (err) {
      console.error("[orders/create] inline charge failed:", err);
      return res.status(500).json({
        error: `Could not charge card: ${(err as Error).message}`,
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // HOSTED PATH — no paymentToken, redirect to Clover Hosted Checkout
  // ───────────────────────────────────────────────────────────────────
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

  try {
    const checkout = await cloverHostedCheckout<{
      href: string;
      checkoutSessionId: string;
    }>(
      {
        customer: {
          firstName: body.customerName.split(" ")[0] || "Customer",
          lastName: body.customerName.split(" ").slice(1).join(" ") || "",
          email: body.customerEmail,
        },
        shoppingCart: {
          lineItems: body.lines.map((l) => ({
            name: l.itemName,
            unitQty: l.quantity,
            price: dollarsToCents(l.unitPrice),
            note:
              [l.modifiers.map((m) => m.name).join(", "), l.notes]
                .filter(Boolean)
                .join(" — ") || undefined,
          })),
        },
        merchantMetadata: {
          fulfillment: "pickup",
          source: "yolo-rollo-web",
          customerName: body.customerName,
          customerPhone: body.customerPhone,
          customerEmail: body.customerEmail ?? "",
        },
      },
      {
        // Clover uses these URLs verbatim — it does NOT substitute
        // {order_id} / {checkoutSessionId} placeholders. We can't bake
        // the sessionId into the URL either, since we don't know it
        // until this call returns. The client stashes it in
        // sessionStorage right before redirecting; Confirmation.tsx
        // reads it back and polls /api/checkout-session/[cs] to
        // resolve the real orderId once our webhook has populated KV.
        success: `${base}/confirmation`,
        failure: `${base}/checkout?error=payment_failed`,
      },
    );

    return res.status(200).json({
      kind: "hosted",
      checkoutSessionId: checkout.checkoutSessionId,
      checkoutUrl: checkout.href,
      totals: { subtotal, tax, total },
    } satisfies OrderResponse);
  } catch (err) {
    console.error("[orders/create] hosted checkout failed:", err);
    return res.status(500).json({
      error: `Could not start payment: ${(err as Error).message}`,
    });
  }
}
