import { FormEvent, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useCart } from "../lib/cartStore";
import { brand } from "../config/brand";

/**
 * Checkout page — simple form that hands off to Clover Hosted Checkout.
 *
 * Flow:
 *   1. Customer fills name + phone + (optional) notes.
 *   2. We POST to /api/orders/create which:
 *      - Creates a Clover order with the cart lines
 *      - Creates a Hosted Checkout session against that order
 *      - Returns a checkoutUrl to Clover's hosted payment page
 *   3. We redirect the browser to checkoutUrl. Clover collects card +
 *      Apple Pay / Google Pay, handles 3DS, fraud, retries, etc.
 *   4. On payment success, Clover redirects to /confirmation/:orderId.
 *      On failure, it redirects back to /checkout with ?error=...
 *
 * Clover Hosted Checkout requires HTTPS for the redirect URLs (even in
 * sandbox), so this flow won't work on http://localhost. Deploy to a
 * Vercel preview (`npx vercel deploy`) and test from the HTTPS preview
 * URL.
 */
export function Checkout() {
  const lines = useCart((s) => s.lines);
  const subtotal = useCart((s) => s.subtotal());
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If Clover redirected us back here with ?error=… on payment failure,
  // surface the message above the form.
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

  // Bounce back to the menu if someone hits /checkout with an empty cart.
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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !phone.trim()) {
      setError("Please enter your name and phone.");
      return;
    }

    setSubmitting(true);
    try {
      const order = await api.createOrder({
        customerName: name.trim(),
        customerPhone: phone.trim(),
        customerEmail: email.trim() || undefined,
        notes: notes.trim() || undefined,
        lines,
        // No paymentToken — server creates a Hosted Checkout session.
      });
      // Keep the orderId around so /confirmation can resume polling
      // even if Clover's redirect strips query params.
      sessionStorage.setItem("yolo-rollo-pending-order", order.orderId);
      // Off to Clover.
      window.location.href = order.checkoutUrl;
    } catch (err) {
      setError((err as Error).message ?? "Could not start payment.");
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      <h1 className="font-display text-3xl">Checkout</h1>
      <p className="mt-1 text-sm text-rollo-ink/70">
        In-store pickup at {brand.location}. We’ll text you when it’s ready.
      </p>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <label className="block">
          <span className="text-sm font-semibold">Name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-2xl border-2 border-rollo-ink/10 bg-white p-3 focus:border-rollo-pink focus:outline-none"
            autoComplete="name"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold">Phone</span>
          <input
            required
            type="tel"
            inputMode="tel"
            placeholder="(901) 555-0123"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-2xl border-2 border-rollo-ink/10 bg-white p-3 focus:border-rollo-pink focus:outline-none"
            autoComplete="tel"
          />
          <span className="mt-1 block text-xs text-rollo-ink/50">
            Used for SMS pickup alert. Standard rates apply.
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-semibold">
            Email{" "}
            <span className="text-rollo-ink/50">
              (recommended for Apple Pay)
            </span>
          </span>
          <input
            type="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-2xl border-2 border-rollo-ink/10 bg-white p-3 focus:border-rollo-pink focus:outline-none"
            autoComplete="email"
          />
          <span className="mt-1 block text-xs text-rollo-ink/50">
            Optional. Skips the “add contact info” prompt on the payment page.
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-semibold">Notes (optional)</span>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full rounded-2xl border-2 border-rollo-ink/10 bg-white p-3 focus:border-rollo-pink focus:outline-none"
          />
        </label>

        <div className="card">
          <div className="flex items-baseline justify-between">
            <span className="text-rollo-ink/70">Subtotal</span>
            <span className="font-semibold">${subtotal.toFixed(2)}</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between text-sm">
            <span className="text-rollo-ink/55">
              Tax{" "}
              <span className="text-rollo-ink/40">
                (est. {(brand.taxRate * 100).toFixed(2)}%)
              </span>
            </span>
            <span className="font-semibold">${taxEstimate.toFixed(2)}</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between border-t border-rollo-ink/10 pt-2">
            <span className="font-semibold">Total</span>
            <span className="text-lg font-bold text-rollo-pink">
              ${total.toFixed(2)}
            </span>
          </div>
          <p className="mt-2 text-xs text-rollo-ink/50">
            You’ll pay on Clover’s secure page. Card, Apple Pay, and Google Pay
            all supported. Final tax confirmed there.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-2xl bg-rollo-pink-soft p-3 text-sm text-rollo-pink"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary w-full"
        >
          {submitting ? "Sending you to payment…" : `Continue to payment · $${total.toFixed(2)}`}
        </button>
      </form>
    </motion.div>
  );
}
