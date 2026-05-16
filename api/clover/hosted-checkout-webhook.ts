import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { cloverRest } from "../_clover.js";
import { firestore, type KdsTicketDoc } from "../_firebase.js";

/**
 * POST /api/clover/hosted-checkout-webhook
 *
 * Receives the PAYMENT callback from Clover Hosted Checkout and writes
 * the resulting orderId into KV, keyed by the checkout sessionId. The
 * Confirmation page reads that mapping when the customer lands on
 * /confirmation without a real order_id in the URL.
 *
 * Setup checklist (do in this order):
 *
 *   1. Generate a Signing Secret on Clover Dashboard → Webhooks for
 *      this app. Copy it.
 *
 *   2. In Vercel → Settings → Environment Variables, add
 *      `CLOVER_HOSTED_WEBHOOK_SECRET` = the secret. Toggle for
 *      Production + Preview.
 *
 *   3. In Vercel → Storage, ensure KV is provisioned. Vercel auto-
 *      injects `KV_REST_API_URL` + `KV_REST_API_TOKEN`. Without these
 *      the webhook still receives + verifies events but can't persist
 *      the sessionId→orderId mapping; the lookup endpoint will fall
 *      back to its Path 1 / Path 2 strategies.
 *
 *   4. Back on Clover, paste the webhook URL:
 *        https://rolled-ice-cream-ordering.vercel.app/api/clover/hosted-checkout-webhook
 *      Subscribe to the Hosted Checkout PAYMENT event.
 *
 *   5. Redeploy Vercel so the new env vars take effect.
 *
 * Signature format (per Clover's Hosted Checkout webhook docs):
 *   Clover-Signature: t=<unix>,v1=<hex>
 *   signed payload   = "<unix>.<raw_body_bytes>"
 *   algorithm        = HMAC-SHA256
 * We require the RAW request bytes (not Vercel's pre-parsed body) for
 * the HMAC to match — JSON.stringify(req.body) re-serializes with
 * different whitespace/key-order/escaping and breaks verification.
 *
 * Payload format (also per docs): the PAYMENT event only carries
 *   { type:"PAYMENT", status:"APPROVED"|"DECLINED",
 *     id:<paymentUUID>, data:<checkoutSessionId>, merchantId, ... }
 * — there is no orderId in the body. We resolve it server-side via
 *   GET /v3/merchants/{mId}/payments/{id}?expand=order
 *
 * Reference:
 *   https://docs.clover.com/dev/docs/ecomm-hosted-checkout-webhook
 */

export const config = {
  api: { bodyParser: false }, // raw body needed for HMAC
};

/** How far the webhook timestamp can be from "now" before we reject. */
const REPLAY_WINDOW_SECONDS = 5 * 60;

/** KV TTL on the session→order mapping. 24h is well past the time a
 *  customer would still be looking at the confirmation page. */
const KV_TTL_SECONDS = 60 * 60 * 24;

async function readRaw(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) {
    chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  }
  return Buffer.concat(chunks);
}

interface CloverWebhookBody {
  type?: string;       // "PAYMENT"
  status?: string;     // "APPROVED" | "DECLINED"
  id?: string;         // payment UUID
  data?: string;       // checkoutSessionId
  merchantId?: string;
  createdTime?: number | string;
  message?: string;
}

interface CloverPaymentExpanded {
  id: string;
  amount: number;
  order?: { id: string };
}

/** Shape we read from /v3/merchants/{mid}/orders/{id}?expand=lineItems.modifications
 *  in order to materialize the KDS ticket. The `modifications` expand
 *  is what surfaces each modifier the customer chose (mix-in, topping,
 *  boba, etc.) so kitchen staff sees what to actually make. */
interface CloverOrderForKds {
  id: string;
  title?: string;
  total?: number;
  lineItems?: {
    elements?: {
      name?: string;
      unitQty?: number;
      note?: string;
      modifications?: {
        elements?: {
          name?: string;
          alternativeName?: string;
          modifier?: {
            name?: string;
            modifierGroup?: { name?: string };
          };
        }[];
      };
    }[];
  };
}

type Verdict =
  | { ok: true; ts: number }
  | { ok: false; reason: string };

/** Verify Clover-Signature header against the raw body + secret. */
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

/** Cache session→order in Upstash KV (REST). Returns false if KV isn't
 *  configured — caller logs and continues (lookup endpoint has its own
 *  fallback paths). */
async function kvSet(
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<boolean> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return false;
  try {
    // Upstash Redis REST: SETEX <key> <ttl> <value>
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

  const raw = await readRaw(req);
  // Vercel lowercases header names; Clover sends "Clover-Signature".
  const headerSig = req.headers["clover-signature"] as string | undefined;
  const secret = process.env.CLOVER_HOSTED_WEBHOOK_SECRET;

  // When the secret is configured, require a valid signature. With no
  // secret set (only local dev), we log+accept unsigned so the endpoint
  // can be smoke-tested without Clover.
  if (secret) {
    const verdict = verifySignature(headerSig, raw, secret);
    if (!verdict.ok) {
      console.warn("[hosted-webhook] reject:", verdict.reason);
      return res.status(401).json({ error: verdict.reason });
    }
  } else {
    console.warn(
      "[hosted-webhook] CLOVER_HOSTED_WEBHOOK_SECRET not set — accepting unsigned webhook",
    );
  }

  let event: CloverWebhookBody;
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch (err) {
    console.warn("[hosted-webhook] bad json", err);
    return res.status(400).json({ error: "bad json" });
  }

  console.log(
    "[hosted-webhook]",
    event.type,
    event.status,
    "cs=",
    event.data,
    "pid=",
    event.id,
  );

  // Only APPROVED PAYMENT events carry a mapping worth persisting.
  // Everything else: ack so Clover stops retrying.
  if (event.type !== "PAYMENT" || event.status !== "APPROVED") {
    return res.status(200).json({ ok: true, ignored: true });
  }

  const checkoutSessionId = event.data;
  const paymentId = event.id;
  if (!checkoutSessionId || !paymentId) {
    console.warn("[hosted-webhook] APPROVED PAYMENT missing data/id", event);
    return res.status(400).json({ error: "missing payment/session id" });
  }

  // Resolve payment → order. The webhook payload doesn't include the
  // orderId, so we fetch the payment with the related order expanded.
  // 5xx on failure makes Clover retry, which is what we want — KV
  // outages, transient REST errors, or "order not committed yet" all
  // resolve themselves on the next attempt.
  let orderId: string | undefined;
  try {
    const payment = await cloverRest<CloverPaymentExpanded>(
      `/payments/${encodeURIComponent(paymentId)}?expand=order`,
    );
    orderId = payment.order?.id;
  } catch (err) {
    console.error("[hosted-webhook] payment lookup failed:", err);
    return res
      .status(500)
      .json({ error: `payment lookup failed: ${(err as Error).message}` });
  }

  if (!orderId) {
    console.warn("[hosted-webhook] payment has no order yet, pid=", paymentId);
    return res.status(500).json({ error: "no order on payment yet, retrying" });
  }

  // Key is `session:<sessionId>` — same shape the lookup endpoint at
  // api/checkout-session/[sessionId].ts reads back (Path 0).
  const ok = await kvSet(`session:${checkoutSessionId}`, orderId, KV_TTL_SECONDS);
  if (ok) {
    console.log(
      `[hosted-webhook] cached session:${checkoutSessionId} → ${orderId}`,
    );
  } else {
    console.warn(
      "[hosted-webhook] KV not configured; sessionId→orderId not cached " +
        "(lookup will fall back to Path 1/2)",
    );
  }

  // ─── Materialize the kitchen ticket in Firestore ──────────────────
  // The /kds page subscribes to `tickets` where status=queued and
  // renders one card per doc. We write idempotently (merge:true keyed
  // on orderId) so re-deliveries of the same webhook are harmless.
  try {
    const order = await cloverRest<CloverOrderForKds>(
      `/orders/${orderId}?expand=lineItems.modifications.modifier.modifierGroup`,
    );

    // Title is "Online: <customerName>" — strip the prefix for the
    // KDS card. If title is missing entirely, leave undefined.
    const customerName = order.title?.startsWith("Online: ")
      ? order.title.slice("Online: ".length).trim()
      : order.title?.trim();

    const items =
      (order.lineItems?.elements ?? []).map((li) => {
        // Clover stores quantity in per-mille units (1000 = 1 unit).
        const q = li.unitQty
          ? Math.max(1, Math.round(li.unitQty / 1000))
          : 1;
        // Structured modifier list with group names for KDS color-coding.
        const mods = (li.modifications?.elements ?? [])
          .map((mod) => {
            const name = (
              mod.name ??
              mod.alternativeName ??
              mod.modifier?.name ??
              ""
            ).trim();
            const group = (mod.modifier?.modifierGroup?.name ?? "").trim();
            return name ? { n: name, g: group || undefined } : null;
          })
          .filter(Boolean) as { n: string; g?: string }[];
        const m =
          mods.length > 0
            ? mods.map((mm) => mm.n).join(", ")
            : li.note?.trim() || undefined;
        return {
          n: li.name ?? "Item",
          q,
          ...(m ? { m } : {}),
          ...(mods.length > 0 ? { mods } : {}),
        };
      }) ?? [];

    const doc: KdsTicketDoc = {
      orderId,
      ticketNumber: orderId.slice(-6).toUpperCase(),
      customerName,
      items,
      status: "queued",
      createdAt: FieldValue.serverTimestamp(),
      total: typeof order.total === "number" ? order.total / 100 : undefined,
    };

    await firestore()
      .collection("tickets")
      .doc(orderId)
      .set(doc, { merge: true });

    console.log(`[hosted-webhook] firestore ticket queued: ${orderId}`);
  } catch (err) {
    // Don't fail the webhook on a Firestore hiccup — Clover would
    // retry the whole event, but the orderId↔session mapping is
    // already in KV and the customer's UI lookup still works. The
    // KDS would just miss this ticket; staff can catch it from the
    // Clover dashboard until next deploy.
    console.error(
      "[hosted-webhook] firestore write failed (non-fatal):",
      err,
    );
  }

  return res
    .status(200)
    .json({ ok: true, checkoutSessionId, orderId, cached: ok });
}
