/**
 * Server-only KV (Upstash Redis) wrapper.
 *
 * Vercel KV (provisioned via Vercel Dashboard → Storage → Marketplace
 * Database → Upstash Redis) auto-populates env vars in both formats:
 *   - KV_REST_API_URL / KV_REST_API_TOKEN  (Vercel naming)
 *   - UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN  (Upstash native)
 *
 * We accept either so the same code works if you provision Upstash
 * directly or move providers later.
 *
 * Used by:
 *   - api/webhooks/clover.ts        — writes cs:{sessionId} -> orderId on payment
 *   - api/checkout-session/[cs].ts  — reads it back for the confirmation page
 */
import { Redis } from "@upstash/redis";

export function getKV(): Redis {
  const url =
    process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "KV not configured. Set KV_REST_API_URL + KV_REST_API_TOKEN " +
        "(Vercel KV) or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN " +
        "(direct Upstash).",
    );
  }
  return new Redis({ url, token });
}

/**
 * TTL for checkoutSessionId -> orderId mappings. A customer typically
 * loads the confirmation page within seconds of the redirect, so 24h is
 * a very generous safety margin against KV outages or page reloads.
 */
export const SESSION_TTL_SECONDS = 60 * 60 * 24;

export const sessionKey = (checkoutSessionId: string) =>
  `cs:${checkoutSessionId}`;
