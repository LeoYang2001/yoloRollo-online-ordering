import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";
import { cloverRest } from "../_clover.js";
import { getKV, SESSION_TTL_SECONDS, sessionKey } from "../_kv.js";

/**
 * POST /api/webhooks/clover
 *
 * Receives Clover Hosted Checkout PAYMENT events. We use them to map
 * the opaque `checkoutSessionId` (which the client knows) to the real
 * Clover `orderId` (which we don't, because the Hosted Checkout
 * response doesn't carry one — and the API has no field to attach the
 * session to a pre-existing order).
 *
 * Flow:
 *   1. Verify the Clover-Signature header (t=,v1= HMAC-SHA256).
 *   2. If type=PAYMENT && status=APPROVED:
 *        - fetch /payments/{id}?expand=order to get the order id
 *        - KV.set(cs:{sessionId}, orderId, ex=24h)
 *   3. GET /api/checkout-session/[cs] (called by the confirmation page)
 *      reads that mapping back.
 *
 * Setup:
 *   - Clover Dashboard → Apps → Your app → Webhooks
 *     • URL:    https://<host>/api/webhooks/clover
 *     • Event:  Hosted Checkout PAYMENT
 *   - Copy the webhook signing secret -> Vercel env CLOVER_WEBHOOK_SECRET
 *   - Provision Vercel KV (Marketplace Database → Upstash Redis)
 *
 * Docs: https://docs.clover.com/dev/docs/ecomm-hosted-checkout-webhook
 */

export const config = {
  api: { bodyParser: false }, // need the raw body bytes for HMAC
};

/** How far the webhook timestamp can be from "now" before we reject. */
const REPLAY_WINDOW_SECONDS = 5 * 60;

async function readRaw(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) {
    chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  }
  return Buffer.concat(chunks);
}

interface CloverWebhookBody {
  type?: string; // "PAYMENT"
  status?: string; // "APPROVED" | "DECLINED"
  id?: string; // payment UUID
  data?: string; // checkoutSessionId
  merchantId?: string;
  createdTime?: number | string;
  message?: string;
}

interface CloverPaymentExpanded {
  id: string;
  amount: number;
  order?: { id: string };
}

type Verdict =
  | { ok: true; ts: number }
  | { ok: false; reason: string };

function verifySignature(
  header: string | undefined,
  rawBody: Buffer,
  secret: string,
): Verdict {
  if (!header) return { ok: false, reason: "missing signature header" };
  const m = /^t=(\d+),v1=([0-9a-f]+)$/i.exec(header.trim());
  if (!m) return { ok: false, reason: "malformed signature header" };
  const ts = Number(m[1]);
  const sig = m[2].toLowerCase();

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > REPLAY_WINDOW_SECONDS) {
    return {
      ok: false,
      reason: `timestamp outside replay window (skew=${now - ts}s)`,
    };
  }

  // Signed payload per docs: "<unix_ts>.<raw_body>"
  const signed = Buffer.concat([Buffer.from(`${ts}.`), rawBody]);
  const expected = crypto
    .createHmac("sha256", secret)
    .update(signed)
    .digest("hex");

  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(
      Buffer.from(sig, "hex"),
      Buffer.from(expected, "hex"),
    )
  ) {
    return { ok: false, reason: "signature mismatch" };
  }
  return { ok: true, ts };
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  const raw = await readRaw(req);
  // Vercel normalizes header names to lowercase.
  const headerSig = req.headers["clover-signature"] as string | undefined;
  const secret = process.env.CLOVER_WEBHOOK_SECRET ?? "";

  // In every deployed env we require a secret + valid signature. With
  // no secret set (only local dev), we accept unsigned events so the
  // endpoint can be smoke-tested without Clover.
  if (secret) {
    const verdict = verifySignature(headerSig, raw, secret);
    if (!verdict.ok) {
      console.warn("[webhook] reject:", verdict.reason);
      return res.status(401).end(verdict.reason);
    }
  }

  let event: CloverWebhookBody;
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch (err) {
    console.warn("[webhook] bad json", err);
    return res.status(400).end("bad json");
  }

  console.log(
    "[webhook]",
    event.type,
    event.status,
    "cs=",
    event.data,
    "pid=",
    event.id,
  );

  // Only APPROVED PAYMENT events carry a session->order mapping worth
  // persisting. Everything else is ack-and-drop so Clover stops
  // retrying.
  if (event.type !== "PAYMENT" || event.status !== "APPROVED") {
    return res.status(200).json({ ok: true, ignored: true });
  }

  const checkoutSessionId = event.data;
  const paymentId = event.id;
  if (!checkoutSessionId || !paymentId) {
    console.warn("[webhook] APPROVED PAYMENT missing data/id", event);
    return res.status(400).end("missing payment/session id");
  }

  // Resolve payment -> order. Returning 5xx makes Clover retry, which
  // is what we want: if KV is down or the order isn't queryable yet,
  // we'd rather backstop with a retry than silently drop.
  let orderId: string | undefined;
  try {
    const payment = await cloverRest<CloverPaymentExpanded>(
      `/payments/${encodeURIComponent(paymentId)}?expand=order`,
    );
    orderId = payment.order?.id;
  } catch (err) {
    console.error("[webhook] payment lookup failed:", err);
    return res
      .status(500)
      .end(`payment lookup failed: ${(err as Error).message}`);
  }

  if (!orderId) {
    console.warn("[webhook] payment has no order yet, paymentId=", paymentId);
    return res.status(500).end("no order on payment yet, will retry");
  }

  try {
    const kv = getKV();
    await kv.set(sessionKey(checkoutSessionId), orderId, {
      ex: SESSION_TTL_SECONDS,
    });
    console.log(
      "[webhook] wrote",
      sessionKey(checkoutSessionId),
      "->",
      orderId,
    );
  } catch (err) {
    console.error("[webhook] KV write failed:", err);
    return res.status(500).end(`kv write failed: ${(err as Error).message}`);
  }

  return res.status(200).json({ ok: true, orderId, checkoutSessionId });
}
