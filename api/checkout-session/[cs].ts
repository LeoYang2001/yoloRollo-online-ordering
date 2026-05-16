import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { SessionLookupResponse } from "../../src/types";
import { isMockMode } from "../_clover.js";
import { getKV, sessionKey } from "../_kv.js";

/**
 * GET /api/checkout-session/[cs]
 *
 * Resolves a Clover Hosted Checkout `checkoutSessionId` (from the
 * confirmation page) to the underlying Clover `orderId`, looking up
 * the mapping written by api/webhooks/clover.ts on the PAYMENT event.
 *
 * Status semantics:
 *   - 200 { orderId }       — mapping exists, payment is confirmed
 *   - 202 { pending: true } — no mapping yet, client should keep polling
 *                             (webhook usually lands within 1-5s of the
 *                             redirect, sometimes a bit longer)
 *   - 404 { error }         — looks like the session never existed (mock
 *                             or expired); client should stop polling
 *
 * In mock mode (no Clover creds), we don't actually use KV — there's
 * no Hosted Checkout, so this endpoint just returns a stub orderId so
 * the dev UI flow still works if anyone manually hits it.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const cs = (req.query.cs as string) ?? "";
  if (!cs) return res.status(400).json({ error: "cs required" });

  res.setHeader("Cache-Control", "no-store");

  if (isMockMode()) {
    return res.status(200).json({
      orderId: `mock_${Date.now()}`,
    } satisfies SessionLookupResponse);
  }

  try {
    const kv = getKV();
    const orderId = await kv.get<string>(sessionKey(cs));
    if (orderId) {
      return res.status(200).json({ orderId } satisfies SessionLookupResponse);
    }
    // Mapping not written yet — webhook hasn't landed. Tell client to
    // keep polling.
    return res.status(202).json({ pending: true });
  } catch (err) {
    console.error("[checkout-session] KV read failed:", err);
    return res.status(500).json({ error: (err as Error).message });
  }
}
