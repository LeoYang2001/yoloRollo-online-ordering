import { FormEvent, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useCart } from "../lib/cartStore";
import { brand } from "../config/brand";
import { useQueueEstimate } from "../lib/useQueueEstimate";
import { Header } from "../components/ui/Layout";
import { Display, Mono, Sticker } from "../components/ui/Typography";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { Card } from "../components/ui/Cards";
import { ReceiptRow } from "../components/ui/CartItem";

/**
 * Checkout — collect contact info, redirect to Clover Hosted Checkout.
 *
 *   Header  ← back  ·  Checkout
 *   Pickup card    (white, ~8 MIN sticker)
 *   YOUR INFO      Name / Phone / Email
 *   PAYMENT METHOD  PAY badge · Apple Pay / Card · SECURE · CLOVER HOSTED
 *   Order summary  qty × name … price + Subtotal/Tax/Total
 *   [ Pay $X.XX → ]
 *   tiny terms line
 *
 * Submit POSTs to /api/orders/create WITHOUT a paymentToken — the
 * server falls through to Clover Hosted Checkout and returns the
 * redirect URL. On failure (Clover redirects back with ?error=…),
 * the error banner is surfaced above the form.
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

  // Surface ?error=… on return-from-Clover.
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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!valid) {
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
      });
      // Stash the customer name so the Confirmation page (after the
      // Clover redirect) can update the order title to "Online: <name>"
      // — Clover assigns its own order ID on Hosted Checkout payment
      // and we need to rename it post-creation.
      sessionStorage.setItem("yolo-rollo-pending-order", order.orderId);
      sessionStorage.setItem("yolo-rollo-customer-name", name.trim());
      window.location.href = order.checkoutUrl;
    } catch (err) {
      setError((err as Error).message ?? "Could not start payment.");
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

      <form onSubmit={submit} className="px-5">
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
              the kitchen — it's not the cardholder. The Clover Hosted
              Checkout page will prompt for the actual cardholder name
              separately. We intentionally use autoComplete="off" + a
              non-standard input name so iOS Safari doesn't try to
              autofill this with the saved billing name.
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

        {/*
          Temporary notice: Apple Pay auto-voids charges on this merchant
          account even after domain verification + reCAPTCHA disable.
          Investigation is open with Clover Support (ref charge
          MJB5ESMAH8WKG). Cards work fine. Remove this banner once Clover
          enables wallet payments at the risk-underwriting level.
        */}
        {/* <div className="mt-4 flex items-start gap-2 rounded-rollo-card border border-rollo-pink-soft bg-rollo-paper-soft px-3 py-2.5">
          <span
            aria-hidden
            className="mt-[1px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-rollo-pink text-[10px] font-bold leading-none text-white"
          >
            !
          </span>
          <div className="text-[12px] leading-snug text-rollo-ink-soft">
            <span className="font-bold text-rollo-pink">
              Apple Pay temporarily unavailable.
            </span>{" "}
            Please pay with a card — we’re working on it.
          </div>
        </div> */}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          full
          disabled={!valid || submitting}
          className="mt-4"
        >
          {submitting ? "Sending you to pay…" : `Pay $${total.toFixed(2)}`}
          {!submitting && <Icon.arrow />}
        </Button>

        <div className="mt-2.5 text-center">
          <Mono size={9} color="rgba(42,23,34,0.40)">
            BY PAYING YOU AGREE TO YOLO ROLLO’S TERMS
          </Mono>
        </div>
      </form>
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
