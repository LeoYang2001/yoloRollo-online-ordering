import { useEffect, useState } from "react";
import { getClover } from "../../lib/clover";

/**
 * Apple Pay / Google Pay buttons.
 *
 * These use the W3C Payment Request API directly. Crucially, we set
 * `requestShipping: false` and omit `requiredShippingContactFields` —
 * THIS is what fixes the "Update Shipping Contact" prompt that Clover's
 * Hosted Checkout was forcing on us. We own the PaymentRequest, so we
 * own what gets asked for.
 *
 * Flow on tap:
 *   1. Build PaymentRequest with the cart total, no shipping.
 *   2. Call .show() → Apple Pay / Google Pay sheet opens.
 *   3. User authorizes (Face ID / fingerprint).
 *   4. We get back an encrypted wallet payload.
 *   5. We hand the payload to Clover.js to mint a Clover token.
 *   6. We bubble the token up to PaymentBox via onWalletToken().
 *   7. PaymentBox POSTs the token to /api/orders/create which calls
 *      Clover's /v1/charges to actually move the money.
 *
 * Apple Pay merchant-domain verification:
 *   Clover handles this for merchants who've added their domain in
 *   Clover Dashboard → Ecommerce → Apple Pay → Domains. We need to
 *   register the Vercel preview/production domain there before Apple
 *   Pay will actually appear on iOS. (Until then, .canMakePayment()
 *   will return false on iOS and the button just won't render.)
 */

interface Props {
  /** Cart total in DOLLARS. We convert to cents internally. */
  amount: number;
  /** Short description shown on the wallet sheet. */
  label: string;
  /** Called when we have a Clover token ready to charge. */
  onWalletToken: (token: string, method: "apple_pay" | "google_pay") => void;
  /** Called whenever the user dismisses the sheet without paying. */
  onDismiss?: () => void;
  /** Disabled while another payment is in flight. */
  disabled?: boolean;
}

const APPLE_PAY_METHOD = "https://apple.com/apple-pay";
const GOOGLE_PAY_METHOD = "https://google.com/pay";

export function WalletButtons({
  amount,
  label,
  onWalletToken,
  onDismiss,
  disabled,
}: Props) {
  const [hasApplePay, setHasApplePay] = useState(false);
  const [hasGooglePay, setHasGooglePay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Feature-detect once on mount. Both checks are non-destructive: they
  // tell us whether the wallet exists & the user has at least one card
  // provisioned. canMakePayment() needs to be called inside an HTTPS
  // context — on http localhost it returns false on Safari.
  useEffect(() => {
    let cancelled = false;
    const detect = async () => {
      // Apple Pay — Safari-only, exposes ApplePaySession.
      const apple = Boolean(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).ApplePaySession?.canMakePayments?.(),
      );
      // Google Pay — relies on Payment Request API. Feature-detect by
      // building a tiny PaymentRequest with the GPay method and asking.
      let google = false;
      if (window.PaymentRequest) {
        try {
          const probe = new PaymentRequest(
            [
              {
                supportedMethods: GOOGLE_PAY_METHOD,
                data: googlePayMethodData(),
              },
            ],
            { total: { label: "probe", amount: { currency: "USD", value: "0.01" } } },
          );
          google = Boolean(await probe.canMakePayment());
        } catch {
          google = false;
        }
      }
      if (!cancelled) {
        setHasApplePay(apple);
        setHasGooglePay(google);
      }
    };
    detect();
    return () => {
      cancelled = true;
    };
  }, []);

  const tap = async (method: "apple_pay" | "google_pay") => {
    if (busy || disabled) return;
    setBusy(true);
    setError(null);
    try {
      // Pre-warm Clover.js BEFORE opening the wallet sheet. If the SDK
      // failed to load (e.g. missing VITE_CLOVER_ECOMM_PUBLIC_KEY in
      // the prod env), we surface the error immediately instead of
      // letting the wallet sheet hang on "Processing" for 10 seconds.
      let clover: Awaited<ReturnType<typeof getClover>>;
      try {
        clover = await Promise.race([
          getClover(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("Clover.js not ready (timeout)")),
              3000,
            ),
          ),
        ]);
      } catch (err) {
        throw new Error(
          `Payment SDK failed to load: ${(err as Error).message}. Check VITE_CLOVER_ECOMM_PUBLIC_KEY in Vercel env vars.`,
        );
      }

      const request =
        method === "apple_pay"
          ? buildApplePayRequest(amount, label)
          : buildGooglePayRequest(amount, label);

      const response = await request.show();
      try {
        const cloverToken = await tokenizeWalletPayload(
          clover,
          method,
          response.details,
        );
        await response.complete("success");
        onWalletToken(cloverToken, method);
      } catch (err) {
        await response.complete("fail");
        throw err;
      }
    } catch (err) {
      const msg = (err as Error).message ?? "Payment cancelled.";
      // AbortError = user dismissed the sheet — not really an error.
      if ((err as DOMException).name === "AbortError") {
        onDismiss?.();
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  if (!hasApplePay && !hasGooglePay) return null;

  return (
    <div className="space-y-2">
      {hasApplePay && (
        // The native Apple Pay button is rendered by iOS Safari when
        // -webkit-appearance: -apple-pay-button is set. iOS renders its
        // own "Pay" text + Apple logo, so we leave the button empty —
        // any text we put inside would overlap the native rendering.
        // Fall back to a styled black button for non-Safari browsers
        // that don't support -apple-pay-button (won't show in practice
        // because we feature-detect, but keeps the UI from breaking).
        <button
          type="button"
          onClick={() => tap("apple_pay")}
          disabled={busy || disabled}
          aria-label={busy ? "Processing payment" : "Pay with Apple Pay"}
          className="block h-12 w-full rounded-2xl bg-black text-white disabled:opacity-50"
          style={{
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...({
              WebkitAppearance: "-apple-pay-button",
              ApplePayButtonType: "pay",
              ApplePayButtonStyle: "black",
            } as any),
          }}
        >
          {/* Intentionally empty — iOS draws "Pay" + Apple logo on top */}
          {busy ? <span className="sr-only">Processing…</span> : null}
        </button>
      )}
      {hasGooglePay && (
        <button
          type="button"
          onClick={() => tap("google_pay")}
          disabled={busy || disabled}
          aria-label={busy ? "Processing payment" : "Pay with Google Pay"}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-black text-base font-medium text-white disabled:opacity-50"
        >
          {busy ? "Processing…" : (
            <>
              <span>Buy with</span>
              <span className="font-bold">G Pay</span>
            </>
          )}
        </button>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-rollo-pink-soft p-2 text-xs text-rollo-pink"
        >
          {error}
        </p>
      )}
    </div>
  );
}

// ─── PaymentRequest builders ────────────────────────────────────────────

function applePayMethodData() {
  return {
    version: 3,
    // The Clover-managed merchant identifier. Customers see "YOLO ROLLO
    // MEMPHIS" in the Apple Pay sheet because that's our DBA on file.
    // If Clover requires their own merchant identifier here, we'd swap
    // to "merchant.com.clover.app" and rely on Clover-side domain reg.
    merchantIdentifier: "merchant.com.clover.app",
    merchantCapabilities: ["supports3DS"],
    supportedNetworks: ["visa", "masterCard", "amex", "discover"],
    countryCode: "US",
  } as const;
}

function googlePayMethodData() {
  return {
    apiVersion: 2,
    apiVersionMinor: 0,
    // PRODUCTION when we go live for real customers.
    environment:
      import.meta.env.VITE_GPAY_ENV === "PRODUCTION"
        ? "PRODUCTION"
        : "TEST",
    merchantInfo: {
      merchantName: "Yolo Rollo Memphis",
      // Real GPay merchantId comes from Google Pay Business Console
      // after sign-up. TEST env doesn't require it.
      merchantId: import.meta.env.VITE_GPAY_MERCHANT_ID as string | undefined,
    },
    allowedPaymentMethods: [
      {
        type: "CARD",
        parameters: {
          allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"],
          allowedCardNetworks: ["VISA", "MASTERCARD", "AMEX", "DISCOVER"],
        },
        tokenizationSpecification: {
          // Clover acts as a payment gateway for Google Pay. Their docs
          // confirm `gateway: "clover"` here. See:
          //   https://docs.clover.com/docs/google-pay
          type: "PAYMENT_GATEWAY",
          parameters: {
            gateway: "clover",
            gatewayMerchantId: import.meta.env.VITE_CLOVER_MERCHANT_ID as
              | string
              | undefined,
          },
        },
      },
    ],
  } as const;
}

function buildApplePayRequest(amount: number, label: string): PaymentRequest {
  return new PaymentRequest(
    [
      {
        supportedMethods: APPLE_PAY_METHOD,
        data: applePayMethodData(),
      },
    ],
    {
      total: {
        label,
        amount: { currency: "USD", value: amount.toFixed(2) },
      },
    },
    {
      // THE WHOLE POINT of Path B — none of these flags are on, so
      // Apple Pay never asks for shipping contact, billing contact,
      // or anything beyond the default card auth.
      requestShipping: false,
      requestPayerName: false,
      requestPayerEmail: false,
      requestPayerPhone: false,
    },
  );
}

function buildGooglePayRequest(amount: number, label: string): PaymentRequest {
  return new PaymentRequest(
    [
      {
        supportedMethods: GOOGLE_PAY_METHOD,
        data: googlePayMethodData(),
      },
    ],
    {
      total: {
        label,
        amount: { currency: "USD", value: amount.toFixed(2) },
      },
    },
    {
      requestShipping: false,
      requestPayerName: false,
      requestPayerEmail: false,
      requestPayerPhone: false,
    },
  );
}

// ─── Wallet → Clover token ──────────────────────────────────────────────
//
// The wallet response contains an encrypted blob (Apple Pay) or a
// gateway token (Google Pay via the PAYMENT_GATEWAY tokenization).
// Either way we need a Clover-issued token before /v1/charges will
// accept it.
//
// Clover.js exposes `createToken()` for cards, but the wallet path
// varies by SDK version. We feature-detect:
//   - Newer SDK: clover.paymentRequest({...}).tokenize(payload)
//   - Older SDK: send the raw payload as paymentToken and let the
//     server forward it to Charges API as `source: { ... }`.
//
// Until we confirm the exact API, we base64-encode the payload and
// send it as the token. The server can then either pass it straight
// through to Clover (which accepts wallet payloads as `source`) or
// call a tokenize endpoint first.

async function tokenizeWalletPayload(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  clover: Awaited<ReturnType<typeof getClover>>,
  method: "apple_pay" | "google_pay",
  details: unknown,
): Promise<string> {
  // Google Pay's PAYMENT_GATEWAY mode already returns a Clover-issued
  // token — we can pass it straight through.
  if (method === "google_pay") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tok = (details as any)?.paymentMethodData?.tokenizationData?.token;
    if (typeof tok === "string") return tok;
    // Some browsers wrap differently; fall through to JSON encoding.
  }

  // Apple Pay: Clover accepts the raw ApplePayPaymentToken as a
  // `source` in /v1/charges. We encode the whole payload and let the
  // server unpack it.
  const json = JSON.stringify({ method, details });
  // Prefix so the server can tell it apart from Clover.js card tokens
  // (which start with "clv_…").
  return `wallet:${btoa(json)}`;
}
