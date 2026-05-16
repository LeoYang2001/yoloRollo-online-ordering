/**
 * KDS session token — issued by /api/kds/auth on PIN match, verified
 * by every other /api/kds/* endpoint. NOT a real JWT (no library
 * needed); just a signed `<expirySeconds>.<hexHmacSha256>` string.
 *
 * Token format: "<expiryUnixSec>.<hmac>"
 *   hmac = HMAC-SHA256(secret, expiryUnixSec)
 *
 * Expires after 12 hours — covers a typical staff shift, then the
 * device prompts for PIN again. Stored in localStorage on the device.
 */
import crypto from "node:crypto";
import type { VercelRequest } from "@vercel/node";

const TOKEN_TTL_SEC = 12 * 60 * 60; // 12h

function secret(): string {
  const s = process.env.KDS_SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "KDS_SESSION_SECRET must be set (>= 16 chars). Run `openssl rand -hex 32` for a value.",
    );
  }
  return s;
}

function hmac(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

/** Mint a new token good for TOKEN_TTL_SEC. */
export function issueToken(): string {
  const expiry = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC;
  const exp = String(expiry);
  return `${exp}.${hmac(exp)}`;
}

/** Verify a token. Returns true iff well-formed + not expired + sig
 *  matches the configured secret. */
export function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expNum = Number(exp);
  if (!Number.isFinite(expNum)) return false;
  if (expNum < Math.floor(Date.now() / 1000)) return false;
  const expected = hmac(exp);
  if (expected.length !== sig.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(sig, "hex"),
    );
  } catch {
    return false;
  }
}

/** Pull the token from the request — checks Authorization Bearer
 *  first, then a `x-kds-token` header for clients that can't set
 *  Authorization (e.g. an EventSource). */
export function tokenFromRequest(req: VercelRequest): string | undefined {
  const auth = String(req.headers.authorization ?? "");
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (m) return m[1];
  const xh = req.headers["x-kds-token"];
  if (typeof xh === "string") return xh;
  return undefined;
}
