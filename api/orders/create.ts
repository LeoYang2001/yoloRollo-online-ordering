import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { OrderRequest, OrderResponse } from "../../src/types";
import { cloverRest, cloverHostedCheckout, isMockMode } from "../_clover";

/**
 * POST /api/orders/create
 *
 * 1. Creates a Clover order in `open` state with the cart line items.
 * 2. Adds modifiers as line modifications (so they print on the kitchen ticket).
 * 3. Creates a Hosted Checkout session for that order so the customer
 *    can pay with card. Clover redirects the browser to /confirmation/:id
 *    on success.
 *
 * Returns the Clover order ID, a short ticket number, and the checkout URL.
 */

const ticketNumber = (orderId: string) => {
  // Last 4 of the Clover ID — short enough to read off the TV screen.
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

  // ----- MOCK MODE -----------------------------------------------------
  // Lets the UI flow be tested before Clover is wired up.
  if (isMockMode()) {
    const fakeId = `mock_${Date.now()}`;
    const subtotal = body.lines.reduce(
      (s, l) => s + l.unitPrice * l.quantity,
      0,
    );
    const tax = +(subtotal * 0.0975).toFixed(2); // Memphis ~9.75%
    const out: OrderResponse = {
      orderId: fakeId,
      ticketNumber: ticketNumber(fakeId),
      // In mock mode, send straight to /confirmation so you can see the flow.
      checkoutUrl: `/confirmation/${fakeId}`,
      totals: {
        subtotal,
        tax,
        total: +(subtotal + tax).toFixed(2),
      },
    };
    return res.status(200).json(out);
  }

  // ----- REAL CLOVER ---------------------------------------------------
  try {
    // 1. Create order shell
    const order = await cloverRest<{ id: string }>("/orders", {
      method: "POST",
      body: JSON.stringify({
        state: "open",
        title: `Online: ${body.customerName}`,
        note: body.notes ?? "",
      }),
    });

    // 2. Add line items
    for (const line of body.lines) {
      const li = await cloverRest<{ id: string }>(
        `/orders/${order.id}/line_items`,
        {
          method: "POST",
          body: JSON.stringify({
            item: { id: line.itemId },
            // Clover uses unit price in cents. Use the price the client
            // computed (which already includes modifier deltas) to defend
            // against menu drift mid-session.
            price: dollarsToCents(line.unitPrice),
            unitQty: line.quantity,
            note: line.notes,
          }),
        },
      );

      // Attach selected modifiers to the line — Clover prints these on
      // the kitchen ticket so the team knows what to roll.
      for (const mod of line.modifiers) {
        await cloverRest(`/orders/${order.id}/line_items/${li.id}/modifications`, {
          method: "POST",
          body: JSON.stringify({
            modifier: { id: mod.id },
            amount: dollarsToCents(mod.priceDelta),
            name: mod.name,
          }),
        }).catch((e) => {
          // Modifier failures shouldn't block the order — log and continue.
          console.warn("modification add failed", mod.id, e);
        });
      }
    }

    // 3. Compute totals (Clover returns total once order is finalized,
    //    but we want to show the user something now).
    const subtotal = body.lines.reduce(
      (s, l) => s + l.unitPrice * l.quantity,
      0,
    );
    const tax = +(subtotal * 0.0975).toFixed(2);
    const total = +(subtotal + tax).toFixed(2);

    // 4. Hosted Checkout session
    const proto =
      (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
    const host = req.headers.host;
    const base = `${proto}://${host}`;
    const checkout = await cloverHostedCheckout<{
      href: string;
      checkoutSessionId: string;
    }>(
      {
        customer: {
          email: undefined,
          firstName: body.customerName.split(" ")[0],
          lastName: body.customerName.split(" ").slice(1).join(" "),
          phoneNumber: body.customerPhone,
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
      },
      {
        success: `${base}/confirmation/${order.id}`,
        failure: `${base}/checkout?error=payment_failed`,
      },
    );

    const out: OrderResponse = {
      orderId: order.id,
      ticketNumber: ticketNumber(order.id),
      checkoutUrl: checkout.href,
      totals: { subtotal, tax, total },
    };
    return res.status(200).json(out);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: (err as Error).message });
  }
}
