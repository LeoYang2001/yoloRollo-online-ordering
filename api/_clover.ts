/**
 * Server-only Clover client. NEVER import this from /src — it reads
 * secret env vars (CLOVER_API_TOKEN etc) that must not be shipped to
 * the browser.
 *
 * Docs: https://docs.clover.com/docs/welcome-to-the-rest-api
 */

const REGION_HOSTS: Record<string, { rest: string; ecomm: string }> = {
  // Production North America. Ecommerce (charges, hosted checkout)
  // lives on the scl.* hostname, not the main REST host.
  us: {
    rest: "https://api.clover.com",
    ecomm: "https://scl.clover.com",
  },
  // Developer sandbox
  sandbox: {
    rest: "https://apisandbox.dev.clover.com",
    ecomm: "https://scl-sandbox.dev.clover.com",
  },
};

function env(name: string, fallback?: string) {
  const v = process.env[name];
  if (v && v.length > 0) return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required env var: ${name}`);
}

export function isMockMode() {
  return (
    process.env.USE_MOCK_CLOVER === "true" ||
    !process.env.CLOVER_API_TOKEN ||
    !process.env.CLOVER_MERCHANT_ID
  );
}

export function cloverConfig() {
  const region = env("CLOVER_REGION", "sandbox");
  const hosts = REGION_HOSTS[region] ?? REGION_HOSTS.sandbox;
  return {
    region,
    rest: hosts.rest,
    ecomm: hosts.ecomm,
    merchantId: env("CLOVER_MERCHANT_ID"),
    token: env("CLOVER_API_TOKEN"),
    ecommPrivateKey: env("CLOVER_ECOMM_PRIVATE_KEY", ""),
    ecommPublicKey: env("CLOVER_ECOMM_PUBLIC_KEY", ""),
  };
}

/**
 * Generic Clover REST helper. Adds bearer auth and merchant-scoped path.
 * Endpoint should NOT include the /v3/merchants/{mId} prefix — we add it.
 */
export async function cloverRest<T>(
  endpoint: string,
  init: RequestInit = {},
): Promise<T> {
  const { rest, merchantId, token } = cloverConfig();
  const url = `${rest}/v3/merchants/${merchantId}${endpoint}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clover ${res.status} on ${endpoint}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Hosted Checkout uses a different base URL and the ecomm private key.
 * https://docs.clover.com/docs/using-checkout-api
 */
export async function cloverHostedCheckout<T>(
  body: object,
  redirectUrls: { success: string; failure: string },
): Promise<T> {
  const { ecomm, ecommPrivateKey } = cloverConfig();
  const url = `${ecomm}/invoicingcheckoutservice/v1/checkouts`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Clover-Merchant-Id": cloverConfig().merchantId,
      Authorization: `Bearer ${ecommPrivateKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      ...body,
      redirectUrls,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clover Hosted Checkout ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Clover Ecommerce Charges API — turns a token (from Clover.js
 * `clover.createToken()`) into an actual charge against the customer's
 * card. The token represents a payment method only; this call moves
 * the money.
 *
 *   POST {ecomm}/v1/charges
 *   Authorization: Bearer {CLOVER_ECOMM_PRIVATE_KEY}
 *
 * Docs: https://docs.clover.com/reference/createcharge
 */
export interface CloverChargeResult {
  id: string;
  amount: number; // cents
  currency: string;
  status: "succeeded" | "pending" | "failed";
  paid: boolean;
  source?: { id?: string; brand?: string; last4?: string };
  // ...there are more fields; we only consume the ones above
}

export async function cloverCharge(input: {
  /** Card token from Clover.js. */
  source: string;
  /** Amount in cents. */
  amount: number;
  /** Lowercase ISO-4217 code; almost always "usd". */
  currency?: string;
  /** Short human-readable description shown on the customer's statement. */
  description?: string;
  /** Set true to capture immediately. We almost always want this. */
  capture?: boolean;
}): Promise<CloverChargeResult> {
  const { ecomm, ecommPrivateKey, merchantId } = cloverConfig();
  if (!ecommPrivateKey) {
    throw new Error("CLOVER_ECOMM_PRIVATE_KEY is not set");
  }
  const url = `${ecomm}/v1/charges`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Clover-Merchant-Id": merchantId,
      Authorization: `Bearer ${ecommPrivateKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      source: input.source,
      amount: input.amount,
      currency: input.currency ?? "usd",
      description: input.description,
      capture: input.capture ?? true,
      ecomind: "ecom",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clover Charge ${res.status}: ${text}`);
  }
  return res.json() as Promise<CloverChargeResult>;
}
