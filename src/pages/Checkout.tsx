import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useCart } from "../lib/cartStore";
import { brand } from "../config/brand";
import { useQueueEstimate } from "../lib/useQueueEstimate";
import { Header } from "../components/ui/Layout";
import { Display, Mono, Sticker } from "../components/ui/Typography";
import { Card } from "../components/ui/Cards";
import { ReceiptRow } from "../components/ui/CartItem";
import { CardForm } from "../components/payment/CardForm";

/**
 * Checkout — collect contact info, then take payment inline via
 * Clover.js. Decision A: inline-charge is the ONLY payment path. No
 * Hosted Checkout redirect anymore.
 *
 *   Header  ← back  ·  Checkout
 *   Pickup card    (white, ~8 MIN sticker)
 *   YOUR INFO      Name / Phone / Email
 *   Order summary  qty × name … price + Subtotal/Tax/Total
 *   [ Card number ]
 *   [ Exp ] [ CVV ]
 *   [ ZIP ]
 *   [ Pay $X.XX → ]     ← lives inside CardForm
 *
 * Submit flow:
 *   1. Customer fills name (required) + optional phone/email + card.
 *   2. CardForm calls clover.createToken() and hands us a token.
 *   3. We POST to /api/orders/create with that token.
 *   4. Server pre-creates order, charges the card, marks it PAID, and
 *      returns the real orderId.
 *   5. We navigate to /confirmation/<orderId>.
 *
 * No sessionStorage handoff needed — the orderId is in the URL the
 * moment the response comes back, so the Confirmation page polls
 * status without any lookup dance.
 */
export function Checkout() {
  const lines = useCart((s) => s.lines);
  const subtotal = useCart((s) => s.subtotal());
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live wait estimate from /api/queue (computed off paid Clover orders).
  // placed=false since the customer hasn't paid yet — server adds one
  // ticket's prep time to the queue depth.
  const { estimate } = useQueueEstimate({ placed: false });
  const etaMinutes = estimate?.minutes;

  // Surface ?error=… on return-from-anywhere (e.g. a stale link with
  // ?error=payment_failed from the old Hosted Checkout flow).
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const failure = qs.get("error");
    if (failure) {
      setError(
        failure === "payment_failed"
          ? "Payment didn’t go through. Try again or use a different card."
          : failure,
      );
    }
  }, []);

  // Bounce back to the menu if the user hits /checkout with an empty cart.
  useEffect(() => {
    if (lines.length === 0) navigate("/menu", { replace: true });
  }, [lines.length, navigate]);

  const taxEstimate = useMemo(
    () => +(subtotal * brand.taxRate).toFixed(2),
    [subtotal],
  );
  const total = useMemo(
    () => +(subtotal + taxEstimate).toFixed(2),
    [subtotal, taxEstimate],
  );

  if (lines.length === 0) return null;

  // Only the name is required (it's the pickup-ticket label). Phone +
  // email are optional — we don't have SMS pickup alerts; email is
  // forwarded to Clover so they can send the receipt.
  const valid = Boolean(name.trim());

  /**
   * Called by CardForm once Clover.js hands us a card token. We turn
   * around and POST to /api/orders/create with the token — the server
   * pre-creates the order, charges the card, and returns a real
   * orderId we can navigate to.
   */
  const handlePay = async (token: string) => {
    setError(null);
    if (!valid) {
      // Defensive — CardForm should already be disabled, but if its
      // `disabled` prop got bypassed we still need to refuse.
      setError("Please enter your name for the pickup ticket.");
      return;
    }
    setSubmitting(true);
    try {
      const order = await api.createOrder({
        customerName: name.trim(),
        customerPhone: phone.trim() || undefined,
        customerEmail: email.trim() || undefined,
        lines,
        paymentToken: token,
      });
      // Stash the customer name so the Confirmation page can rename
      // the order title to "Online: <name>" via /api/orders/:id/title
      // — Clover assigns its own ticket label by default and we want
      // the friendly name on the kitchen printout.
      sessionStorage.setItem("yolo-rollo-customer-name", name.trim());
      // checkoutUrl on the inline path is `/confirmation/<orderId>`
      // (same-origin), so client-side navigation is enough.
      navigate(order.checkoutUrl);
    } catch (err) {
      setError((err as Error).message ?? "Could not complete payment.");
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-screen bg-rollo-paper pb-32"
    >
      <Header title="Checkout" onBack={() => navigate("/cart")} />

      <div className="px-5">
        {/* ─── Pickup card ─── */}
        <Card>
          <div className="flex items-start justify-between gap-2.5">
            <div className="min-w-0">
              <Mono size={10}>PICKUP · NO DELIVERY</Mono>
              <Display size={20} className="mt-2">
                Wolfchase Galleria
              </Display>
              <div className="mt-1 text-[13px] text-rollo-ink-soft">
                2760 N Germantown Pkwy
              </div>
            </div>
            <Sticker size="md">
              {etaMinutes != null ? `~${etaMinutes} MIN` : "~8 MIN"}
            </Sticker>
          </div>
        </Card>

        {/* ─── YOUR INFO ─── */}
        <div className="mt-5">
          <Mono size={10}>YOUR INFO</Mono>
        </div>

        <div className="mt-2">
          <FieldRow label="Name" hint="for pickup ticket">
            {/*
              This name is ONLY the pickup-ticket label that prints in
              the kitchen — it's not the cardholder. The Clover.js card
              form below collects the cardholder details separately
              inside its own iframe. We use autoComplete="off" so iOS
              Safari doesn't try to autofill this with the saved
              billing name.
            */}
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What should we call you?"
              autoComplete="off"
              name="pickup-name"
              className="h-[50px] w-full rounded-2xl border-[1.5px] border-rollo-ink-line bg-rollo-card px-4 font-body text-[15px] text-rollo-ink outline-none transition focus:border-rollo-pink"
            />
          </FieldRow>

          <FieldRow label="Phone" hint="optional">
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(901) 555-0123"
              autoComplete="tel"
              className="h-[50px] w-full rounded-2xl border-[1.5px] border-rollo-ink-line bg-rollo-card px-4 font-body text-[15px] text-rollo-ink outline-none transition focus:border-rollo-pink"
            />
          </FieldRow>

          <FieldRow label="Email" hint="for receipt">
            <input
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="h-[50px] w-full rounded-2xl border-[1.5px] border-rollo-ink-line bg-rollo-card px-4 font-body text-[15px] text-rollo-ink outline-none transition focus:border-rollo-pink"
            />
          </FieldRow>
        </div>

        {/* ─── Order summary ─── */}
        <div className="card-rollo mt-5 px-4 py-3.5">
          <Mono size={10}>ORDER SUMMARY</Mono>
          <div className="mt-2">
            {lines.map((l) => (
              <div
                key={l.lineId}
                className="flex items-baseline justify-between gap-3 py-1"
              >
                <span className="min-w-0 flex-1 truncate font-body text-[13px]">
                  <span className="mr-1.5 font-bold text-rollo-ink-muted">
                    {l.quantity}×
                  </span>
                  {l.itemName}
                </span>
                <span className="font-body text-[13px] font-bold text-rollo-ink">
                  ${(l.unitPrice * l.quantity).toFixed(2)}
                </span>
              </div>
            ))}
            <div className="my-2 border-t border-dashed border-rollo-ink-line" />
            <ReceiptRow label="Subtotal" value={`$${subtotal.toFixed(2)}`} />
            <ReceiptRow
              label="Tax"
              hint={`(${(brand.taxRate * 100).toFixed(2)}%)`}
              value={`$${taxEstimate.toFixed(2)}`}
            />
            <div className="my-2 border-t border-dashed border-rollo-ink-line" />
            <ReceiptRow label="Total" value={`$${total.toFixed(2)}`} bold />
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-rollo-card bg-rollo-pink-soft p-3 text-sm text-rollo-pink"
          >
            {error}
          </div>
        )}

        {/* ─── Inline payment ─── */}
        <div className="mt-5">
          <Mono size={10}>PAYMENT</Mono>
        </div>

        {!valid && (
          <p className="mt-2 text-xs text-rollo-ink-soft">
            Enter your name above to enable payment.
          </p>
        )}

        <div className="mt-2">
          <CardForm
            amount={total}
            onPay={handlePay}
            disabled={!valid}
            submitting={submitting}
          />
        </div>

        <div className="mt-2.5 text-center">
          <Mono size={9} color="rgba(42,23,34,0.40)">
            BY PAYING YOU AGREE TO YOLO ROLLO’S TERMS
          </Mono>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Form field row — Mono label + optional hint + child input ────
function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <Mono size={10}>{label}</Mono>
        {hint && (
          <Mono size={9} color="rgba(42,23,34,0.40)">
            {hint}
          </Mono>
        )}
      </div>
      {children}
    </div>
  );
}
