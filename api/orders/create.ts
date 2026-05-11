import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { OrderRequest, OrderResponse } from "../../src/types";
import { cloverHostedCheckout, cloverRest, isMockMode } from "../_clover.js";

/**
 * POST /api/orders/create
 *
 *   1. Create a Clover order in `open` state with the cart line items.
 *   2. Add modifiers as line modifications so they print on the kitchen
 *      ticket.
 *   3. Create a Clover Hosted Checkout session for the order so the
 *      customer can pay with card / Apple Pay / Google Pay on Clover's
 *      hosted page.
 *   4. Return the orderId, a short ticket number, and the checkoutUrl
 *      the client should redirect to.
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
      orderId: fakeId,
      ticketNumber: ticketNumber(fakeId),
      checkoutUrl: `/confirmation/${fakeId}`,
      totals: { subtotal, tax, total },
    } satisfies OrderResponse);
  }

  // ─── 1. Create order shell ──────────────────────────────────────────
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

  // ─── 2. Add line items + modifications ─────────────────────────────
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
      orderId,
    });
  }

  // ─── 3. Hosted Checkout session ─────────────────────────────────────
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
        "  • Run `npx ngrok http 3000` and set CHECKOUT_BASE_URL=https://<your-tunnel>.ngrok-free.app in .env.local\n" +
        "Local order shell was still created (orderId below) so you can " +
        "see it in Clover Dashboard.",
      orderId,
    });
  }

  let checkoutUrl: string;
  try {
    const checkout = await cloverHostedCheckout<{
      href: string;
      checkoutSessionId: string;
    }>(
      {
        // NOTE: We intentionally do NOT pass `customer.phoneNumber` here.
        // When Hosted Checkout sees a phoneNumber it flags the session as
        // a "contact" session, which causes Apple Pay's payment sheet to
        // request `requiredShippingContactFields` and prompts the user to
        // "Update shipping contact". We already capture the phone in our
        // own form for SMS pickup — Clover doesn't need it.
        //
        // We DO pass email when available because that lets Apple Pay /
        // Google Pay skip the "add contact info" prompt entirely.
        customer: {
          firstName: body.customerName.split(" ")[0],
          lastName: body.customerName.split(" ").slice(1).join(" "),
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
          // Hint to Clover that this is a pickup order — no shipping.
          // Setting shippingAmount: 0 also keeps the order summary tidy.
          shippingAmount: 0,
        },
        // Free-form tags Clover stores on the session. We use it as an
        // extra signal that this is a pickup order. Visible in Clover
        // dashboard under the order's metadata.
        merchantMetadata: {
          fulfillment: "pickup",
          source: "yolo-rollo-web",
          customerPhone: body.customerPhone,
        },
      },
      {
        success: `${base}/confirmation/${orderId}`,
        failure: `${base}/checkout?error=payment_failed`,
      },
    );
    checkoutUrl = checkout.href;
  } catch (err) {
    console.error("[orders/create] hosted checkout failed:", err);
    return res.status(500).json({
      error: `Could not start payment: ${(err as Error).message}`,
      orderId,
    });
  }

  // ─── 4. Done. Client redirects browser to checkoutUrl. ──────────────
  return res.status(200).json({
    orderId,
    ticketNumber: ticketNumber(orderId),
    checkoutUrl,
    totals: { subtotal, tax, total },
  } satisfies OrderResponse);
}
