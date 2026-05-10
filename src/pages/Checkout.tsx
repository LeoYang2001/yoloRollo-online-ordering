import { FormEvent, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useCart } from "../lib/cartStore";

export function Checkout() {
  const lines = useCart((s) => s.lines);
  const subtotal = useCart((s) => s.subtotal());
  const navigate = useNavigate();

  // Bounce back to the menu if someone hits /checkout with an empty cart.
  // Done in an effect (not during render) so React doesn't warn.
  useEffect(() => {
    if (lines.length === 0) navigate("/menu", { replace: true });
  }, [lines.length, navigate]);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (lines.length === 0) {
      navigate("/menu");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const order = await api.createOrder({
        customerName: name.trim(),
        customerPhone: phone.trim(),
        notes: notes.trim() || undefined,
        lines,
      });
      // Stash the orderId in sessionStorage so the confirmation page can
      // resume polling status if Clover redirects back to us with just the ID.
      sessionStorage.setItem("yolo-rollo-pending-order", order.orderId);
      // Hosted Checkout — Clover handles card entry and redirects back to us
      // at /confirmation/:orderId on success.
      window.location.href = order.checkoutUrl;
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  };

  if (lines.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      <h1 className="font-display text-3xl">Checkout</h1>
      <p className="mt-1 text-sm text-rollo-ink/70">
        In-store pickup. We’ll text you when it’s ready.
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
          <span className="text-sm font-semibold">Notes (optional)</span>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full rounded-2xl border-2 border-rollo-ink/10 bg-white p-3 focus:border-rollo-pink focus:outline-none"
          />
        </label>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06, duration: 0.2, ease: "easeOut" }}
          className="card"
        >
          <div className="flex items-baseline justify-between">
            <span className="text-rollo-ink/70">Subtotal</span>
            <span className="font-semibold">${subtotal.toFixed(2)}</span>
          </div>
          <p className="mt-1 text-xs text-rollo-ink/50">
            Final tax + total shown on the next screen (Clover hosted checkout).
          </p>
        </motion.div>

        {error && (
          <div className="rounded-2xl bg-rollo-pink-soft p-3 text-sm text-rollo-pink">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary w-full"
        >
          {submitting ? "Routing to payment…" : "Continue to payment"}
        </button>
      </form>
    </motion.div>
  );
}
