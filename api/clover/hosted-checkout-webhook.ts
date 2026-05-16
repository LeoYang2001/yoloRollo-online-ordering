import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";

/**
 * POST /api/clover/hosted-checkout-webhook
 *
 * Receives the payment-completed callback from Clover Hosted Checkout
 * and writes the resulting orderId into KV, keyed by the checkout
 * sessionId. The Confirmation page reads that mapping when the
 * customer lands on /confirmation without a real order_id in the URL.
 *
 * Setup checklist (do in this order):
 *
 *   1. Generate a Signing Secret on Clover (the screen with the
 *      "Generate" button you're looking at). Copy it.
 *
 *   2. In Vercel → Settings → Environment Variables, add
 *      `CLOVER_HOSTED_WEBHOOK_SECRET` = the secret. Toggle for
 *      Production + Preview.
 *
 *   3. In Vercel → Storage → Create Database → KV. Vercel auto-injects
 *      `KV_REST_API_URL` + `KV_REST_API_TOKEN`. Without these the
 *      webhook still receives and verifies events but can't persist
 *      the sessionId→orderId mapping (session lookup will fall back
 *      to the Clover query path).
 *
 *   4. Back on Clover, paste the webhook URL:
 *        https://rolled-ice-cream-ordering.vercel.app/api/clover/hosted-checkout-webhook
 *
 *   5. Redeploy Vercel so the new env vars take effect.
 *
 * Verification: every Hosted Checkout callback is signed with the
 * shared secret. We compute HMAC-SHA256 of the raw request body and
 * compare to the `X-Signature` (or `X-Clover-Auth`) header. If the
 * computed value doesn't match, we 401 and Clover retries.
 */

interface CloverWebhookBody {
  /** The sessionId we created when starting Hosted Checkout. */
  checkoutSessionId?: string;
  /** Some payload variants use these key names — handle all. */
  sessionId?: string;
  session_id?: string;
  /** The order Clover created when this session's payment landed. */
  orderId?: string;
  order_id?: string;
  order?: { id?: string };
  /** Charge / payment id (useful for receipts). */
  chargeId?: string;
  charge_id?: string;
  /** Status of the payment — usually "succeeded" / "approved". */
  status?: string;
  paymentStatus?: string;
}

function pickSessionId(body: CloverWebhookBody): string | undefined {
  return body.checkoutSessionId ?? body.sessionId ?? body.session_id;
}
function pickOrderId(body: CloverWebhookBody): string | undefined {
  return body.orderId ?? body.order_id ?? body.order?.id;
}

/** Verify the request was signed with our shared secret. Clover's
 *  exact header name varies by API version — we accept either. */
function verifySignature(req: VercelRequest, secret: string): boolean {
  const sig =
    String(req.headers["x-signature"] ?? "") ||
    String(req.headers["x-clover-auth"] ?? "") ||
    String(req.headers["clover-signature"] ?? "");
  if (!sig) return false;
  // Vercel pre-parses JSON, so rawBody isn't directly available. We
  // re-serialize the body — Clover signs the JSON canonicalization.
  const body = JSON.stringify(req.body ?? {});
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");
  // Constant-time compare to avoid timing attacks.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(sig.replace(/^sha256=/, ""), "hex"),
    );
  } catch {
    return false;
  }
}

async function kvSet(
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<boolean> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return false;
  try {
    // Upstash Redis REST: SETEX
    const res = await fetch(
      `${url}/setex/${encodeURIComponent(key)}/${ttlSeconds}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: value,
      },
    );
    return res.ok;
  } catch (e) {
    console.warn("[hosted-webhook] KV set failed:", (e as Error).message);
    return false;
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Log a compact summary of every incoming webhook — useful while
  // we're still mapping Clover's exact payload shape. View in Vercel
  // → Deployments → latest → Functions → this endpoint → Logs.
  const body = (req.body ?? {}) as CloverWebhookBody;
  console.log(
    "[hosted-webhook] received:",
    JSON.stringify({
      headers: {
        "x-signature": req.headers["x-signature"],
        "x-clover-auth": req.headers["x-clover-auth"],
      },
      bodyKeys: Object.keys(body),
      sessionId: pickSessionId(body),
      orderId: pickOrderId(body),
      status: body.status ?? body.paymentStatus,
    }),
  );

  // Signature verification — soft-fail with a 401 + log so misconfig
  // is visible but doesn't silently let unsigned requests through.
  const secret = process.env.CLOVER_HOSTED_WEBHOOK_SECRET;
  if (secret) {
    if (!verifySignature(req, secret)) {
      console.warn(
        "[hosted-webhook] signature MISMATCH — refusing to process",
      );
      return res.status(401).json({ error: "Invalid signature" });
    }
  } else {
    console.warn(
      "[hosted-webhook] CLOVER_HOSTED_WEBHOOK_SECRET not set — accepting unsigned webhook",
    );
  }

  // Pull out the two IDs we care about and persist the mapping in KV.
  const sessionId = pickSessionId(body);
  const orderId = pickOrderId(body);

  if (sessionId && orderId) {
    const ok = await kvSet(`session:${sessionId}`, orderId, 60 * 60); // 1h TTL
    if (ok) {
      console.log(
        `[hosted-webhook] cached session:${sessionId} → ${orderId}`,
      );
    } else {
      console.warn(
        "[hosted-webhook] KV not configured; sessionId→orderId not cached",
      );
    }
  }

  // Always 200. Clover retries non-2xx, so we never want a transient
  // error to spam our endpoint.
  return res.status(200).json({ ok: true });
}
