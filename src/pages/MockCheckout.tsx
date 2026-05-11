import { FormEvent, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";

/**
 * Mock payment page — used ONLY in local dev where we can't run Clover
 * Hosted Checkout (it requires https).
 *
 * In production (https), api/orders/create returns the real Clover Hosted
 * Checkout URL and the browser never visits this route. In local http
 * dev, it returns /mock-pay/:orderId so customers/staff still have to
 * "pay" before seeing the confirmation — preventing kitchen tickets from
 * being processed on unpaid orders.
 *
 * The card form here is FAKE. Any digits accepted. Submit → /confirmation.
 */
export function MockCheckout() {
  const { orderId = "" } = useParams();
  const navigate = useNavigate();
  const [card, setCard] = useState("");
  const [exp, setExp] = useState("");
  const [cvc, setCvc] = useState("");
  const [zip, setZip] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    // Fake a payment processor round-trip so the UX feels real.
    window.setTimeout(() => {
      navigate(`/confirmation/${orderId}`, { replace: true });
    }, 900);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="mt-4 space-y-3"
    >
      {/* DEV banner — clearly indicates this is fake. Production never sees this. */}
      <div className="rounded-2xl border-2 border-dashed border-rollo-pink/40 bg-rollo-pink-soft px-4 py-3 text-xs text-rollo-pink">
        <strong>Dev-only mock checkout.</strong> Local builds can't run Clover
        Hosted Checkout (it requires https). Any digits work. Deploy to
        Vercel for real card payments.
      </div>

      <div className="rounded-3xl bg-white p-5 shadow-sm">
        <h1 className="font-display text-2xl">Payment</h1>
        <p className="mt-1 text-sm text-rollo-ink/65">
          Order <span className="font-mono">{orderId}</span>
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <label className="block">
            <span className="text-sm font-semibold">Card number</span>
            <input
              required
              inputMode="numeric"
              value={card}
              onChange={(e) =>
                setCard(e.target.value.replace(/[^\d ]/g, "").slice(0, 19))
              }
              placeholder="4242 4242 4242 4242"
              className="mt-1 w-full rounded-2xl border-2 border-rollo-ink/10 bg-white p-3 font-mono focus:border-rollo-pink focus:outline-none"
            />
          </label>

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="text-sm font-semibold">Expiry</span>
              <input
                required
                inputMode="numeric"
                value={exp}
                onChange={(e) =>
                  setExp(e.target.value.replace(/[^\d/]/g, "").slice(0, 5))
                }
                placeholder="MM/YY"
                className="mt-1 w-full rounded-2xl border-2 border-rollo-ink/10 bg-white p-3 font-mono focus:border-rollo-pink focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">CVC</span>
              <input
                required
                inputMode="numeric"
                value={cvc}
                onChange={(e) =>
                  setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                placeholder="123"
                className="mt-1 w-full rounded-2xl border-2 border-rollo-ink/10 bg-white p-3 font-mono focus:border-rollo-pink focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">ZIP</span>
              <input
                required
                inputMode="numeric"
                value={zip}
                onChange={(e) =>
                  setZip(e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                placeholder="38133"
                className="mt-1 w-full rounded-2xl border-2 border-rollo-ink/10 bg-white p-3 font-mono focus:border-rollo-pink focus:outline-none"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary mt-2 w-full"
          >
            {submitting ? "Processing payment…" : "Pay & place order"}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn-secondary w-full"
          >
            Cancel
          </button>
        </form>
      </div>
    </motion.div>
  );
}
