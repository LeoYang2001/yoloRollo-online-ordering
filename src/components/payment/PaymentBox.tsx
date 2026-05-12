import { useCallback } from "react";
import { CardForm } from "./CardForm";
import { WalletButtons } from "./WalletButtons";

/**
 * The full inline payment UI. Sits on the /checkout page.
 *
 *   ┌────────────────────────────────────┐
 *   │   [ Pay with Apple Pay ]           │
 *   │   [ Pay with Google Pay ]          │
 *   │   ── or pay with card ──           │
 *   │   [card number]                    │
 *   │   [exp] [cvv]                      │
 *   │   [zip]                            │
 *   │   [ Pay $X.XX ]   ← inside CardForm
 *   └────────────────────────────────────┘
 *
 * The wallet buttons short-circuit the card form: if the user taps
 * Apple Pay and authorizes, we have a Clover token in hand and call
 * onPay() immediately.
 *
 * The card form is now self-contained — it owns its own Pay button and
 * calls clover.createToken() on click. No more change-event tracking
 * (Clover.js's change events were unreliable across SDK versions).
 *
 * onPay(token, method) is what Checkout.tsx wires to api.createOrder().
 */

interface Props {
  amount: number;
  label: string;
  onPay: (token: string, method: "apple_pay" | "google_pay" | "card") => void | Promise<void>;
  submitting?: boolean;
  error?: string | null;
}

export function PaymentBox({
  amount,
  label,
  onPay,
  submitting,
  error,
}: Props) {
  const onWalletToken = useCallback(
    (token: string, method: "apple_pay" | "google_pay") => {
      void onPay(token, method);
    },
    [onPay],
  );

  const onCardToken = useCallback(
    (token: string) => {
      void onPay(token, "card");
    },
    [onPay],
  );

  return (
    <div className="space-y-4">
      <WalletButtons
        amount={amount}
        label={label}
        onWalletToken={onWalletToken}
        disabled={submitting}
      />

      <div className="flex items-center gap-2 text-xs text-rollo-ink/50">
        <div className="h-px flex-1 bg-rollo-ink/10" />
        <span>or pay with card</span>
        <div className="h-px flex-1 bg-rollo-ink/10" />
      </div>

      <CardForm
        amount={amount}
        onPay={onCardToken}
        submitting={submitting}
      />

      {error && (
        <p
          role="alert"
          className="rounded-2xl bg-rollo-pink-soft p-3 text-sm text-rollo-pink"
        >
          {error}
        </p>
      )}
    </div>
  );
}
