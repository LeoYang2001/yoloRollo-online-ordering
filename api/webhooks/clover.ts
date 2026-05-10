import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";

/**
 * POST /api/webhooks/clover
 *
 * Optional but recommended: configure this URL in your Clover app's
 * Webhooks settings to receive real-time order/payment updates instead
 * of relying purely on polling.
 *
 * For v1 we just verify and log. Wire up SMS / a Postgres write here if
 * you add notifications later.
 *
 * Docs: https://docs.clover.com/docs/webhooks
 */
export const config = {
  api: { bodyParser: false }, // need raw body for HMAC
};

async function readRaw(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks);
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  const secret = process.env.CLOVER_WEBHOOK_SECRET ?? "";
  const sig = req.headers["x-clover-signature"] as string | undefined;
  const raw = await readRaw(req);

  // Verify signature when secret is configured. Unsigned requests are
  // ignored to avoid log spam from random scanners.
  if (secret) {
    if (!sig) return res.status(401).end("missing signature");
    const expected = crypto
      .createHmac("sha256", secret)
      .update(raw)
      .digest("hex");
    if (
      sig.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    ) {
      return res.status(401).end("bad signature");
    }
  }

  // Acknowledge fast — Clover retries on non-2xx.
  res.status(200).json({ ok: true });

  try {
    const event = JSON.parse(raw.toString("utf8"));
    console.log("clover webhook", event.type, event.objectId);
    // TODO: emit SMS to body.customerPhone when state -> ready, etc.
  } catch (err) {
    console.warn("webhook parse fail", err);
  }
}
