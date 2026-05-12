/**
 * Clover.js SDK wrapper.
 *
 * The Clover.js script tag in index.html loads `window.Clover` async.
 * We wrap it in a singleton so the rest of the app:
 *
 *   - never has to know about the script-tag race condition,
 *   - never re-instantiates the SDK on hot reload,
 *   - never accidentally uses the SDK before it's ready.
 *
 * Usage:
 *
 *   const clover = await getClover();
 *   const elements = clover.elements();
 *   const cardNumber = elements.create("CARD_NUMBER", { ... });
 *   ...
 *   const { token, errors } = await clover.createToken();
 *
 * We pass the token to /api/orders/create as `paymentToken`. The server
 * exchanges it for a real charge via Clover's /v1/charges endpoint.
 *
 * Apple Pay / Google Pay live on top of this same SDK but use the W3C
 * PaymentRequest API directly (see WalletButtons.tsx). They produce a
 * different kind of token — a wallet payment payload — which Clover.js
 * can also tokenize via createToken().
 */

// ─── Public-key sourcing ────────────────────────────────────────────────
// VITE_CLOVER_ECOMM_PUBLIC_KEY is set in .env.local + Vercel project env.
// It's the SAME value as the server-side CLOVER_ECOMM_PUBLIC_KEY, but
// exposed to the browser via the VITE_ prefix. Public keys are fine to
// ship — they only authorize tokenization, not charges. Charges still
// require the SECRET key on the server.
const PUBLIC_KEY = import.meta.env.VITE_CLOVER_ECOMM_PUBLIC_KEY as
  | string
  | undefined;

// ─── Type stubs ─────────────────────────────────────────────────────────
// Clover.js doesn't ship official .d.ts files, so we declare just enough
// of the surface area we use. Anything not declared here we'll cast `any`
// at the call site with a comment.

export type CloverElementType =
  | "CARD_NUMBER"
  | "CARD_DATE"
  | "CARD_CVV"
  | "CARD_POSTAL_CODE";

export interface CloverElementOptions {
  /** Inline styles applied inside the iframe input. */
  style?: Record<string, Record<string, string>>;
  /** Placeholder text. */
  placeholder?: string;
}

export interface CloverElement {
  mount: (selector: string | HTMLElement) => void;
  unmount: () => void;
  // Clover.js exposes DOM-style addEventListener, not Stripe-style .on().
  // The event payload differs by SDK version, so we accept any.
  addEventListener: (
    event: "change" | "blur" | "focus",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: (state: any) => void,
  ) => void;
  destroy?: () => void;
}

export interface CloverElements {
  create: (type: CloverElementType, options?: CloverElementOptions) => CloverElement;
}

export interface CloverTokenResult {
  token?: string;
  errors?: Record<string, string>;
  // Clover sometimes returns a richer payload; we only consume `token`.
  // Anything else lives in `raw` for debugging in the console.
  raw?: unknown;
}

export interface CloverInstance {
  elements: () => CloverElements;
  createToken: () => Promise<CloverTokenResult>;
  // PaymentRequest helpers exist on newer SDK versions; we feature-detect
  // before using to be safe.
  paymentRequest?: (config: unknown) => unknown;
}

declare global {
  interface Window {
    Clover?: new (publicKey: string, options?: { merchantId?: string }) => CloverInstance;
  }
}

// ─── Singleton lifecycle ────────────────────────────────────────────────
let cached: CloverInstance | null = null;
let loadPromise: Promise<CloverInstance> | null = null;

/**
 * Wait for window.Clover to exist. The script tag in index.html is
 * `async`, so we may be called before it's parsed. We poll on
 * requestAnimationFrame for up to ~10 seconds, then reject — that's
 * plenty even on slow mobile connections.
 */
function waitForCloverScript(): Promise<NonNullable<Window["Clover"]>> {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const tick = () => {
      if (window.Clover) return resolve(window.Clover);
      if (performance.now() - start > 10_000) {
        return reject(
          new Error(
            "Clover.js failed to load within 10s. Check the script tag in index.html and the network tab for blocked requests.",
          ),
        );
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/**
 * Lazily get the Clover SDK instance, initialized with our public key.
 * Safe to call repeatedly — subsequent calls return the cached instance.
 */
export async function getClover(): Promise<CloverInstance> {
  if (cached) return cached;
  if (!PUBLIC_KEY) {
    throw new Error(
      "VITE_CLOVER_ECOMM_PUBLIC_KEY is not set. Add it to .env.local (and Vercel project env vars). It's the same value as the server-side CLOVER_ECOMM_PUBLIC_KEY.",
    );
  }
  if (!loadPromise) {
    loadPromise = waitForCloverScript().then((Clover) => {
      cached = new Clover(PUBLIC_KEY);
      return cached;
    });
  }
  return loadPromise;
}

/**
 * Quick check — useful for showing a "loading payment..." spinner while
 * the SDK script is still in flight.
 */
export function isCloverReady(): boolean {
  return Boolean(window.Clover);
}
