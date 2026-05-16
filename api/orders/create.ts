import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { OrderRequest, OrderResponse } from "../../src/types";
import { cloverCharge, cloverRest, isMockMode } from "../_clover.js";

/**
 * POST /api/orders/create
 *
 * Inline-charge path only (Decision A). Every order MUST arrive with a
 * `paymentToken` from Clover.js. Flow:
 *
 *   1. Pre-create a Clover order shell with line items.
 *   2. Charge the token via /v1/charges.
 *   3. Mark the order PAID + return its real Clover ID to the client.
 *
 * The Hosted Checkout fallback path has been removed — see PR comment
 * on the Decision A branch for rationale. tl;dr: Hosted Checkout
 * creates its order asynchronously at payment time and gives us no
 * synchronous way to know the resulting orderId, which makes the
 * confirmation page's ticket lookup fragile (requires webhook + KV +
 * polling). The inline path returns the orderId immediately because
 * we pre-created the order ourselves.
 *
 * If you re-enable Hosted Checkout later, restore from git history
 * (this file pre the "Decision A" commit) and put it back behind a
 * `body.paymentToken == null` guard.
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
  if (!body.paymentToken && !isMockMode()) {
    // Belt-and-suspenders. The type system already requires this on
    // the client; this catches misbehaving callers / curl pokes /
    // accidental regressions.
    return res.status(400).json({
      error:
        "Missing paymentToken. The inline-charge flow is the only " +
        "supported payment path — call clover.createToken() on the " +
        "client and include the resulting token in this request.",
    });
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

  // ─── 1. Pre-create the order shell ─────────────────────────────────
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

  // ─── 2. Attach line items + modifications ──────────────────────────
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

  // ─── 3. Charge the token ───────────────────────────────────────────
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
        orderId,
      });
    }

    // Tag the order PAID. Best-effort — even if it fails the money
    // already moved and the kitchen can pull the ticket up by ID.
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
      orderId,
      ticketNumber: ticketNumber(orderId),
      // Same-origin path — no Clover redirect. The browser navigates
      // straight to /confirmation/{orderId}.
      checkoutUrl: `/confirmation/${orderId}`,
      totals: { subtotal, tax, total },
    } satisfies OrderResponse);
  } catch (err) {
    console.error("[orders/create] inline charge failed:", err);
    return res.status(500).json({
      error: `Could not charge card: ${(err as Error).message}`,
      orderId,
    });
  }
}
