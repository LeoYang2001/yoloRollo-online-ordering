import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useCart } from "../lib/cartStore";

export function Cart() {
  const lines = useCart((s) => s.lines);
  const subtotal = useCart((s) => s.subtotal());
  const setQuantity = useCart((s) => s.setQuantity);
  const removeLine = useCart((s) => s.removeLine);
  const navigate = useNavigate();

  if (lines.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="mt-6 rounded-3xl bg-white p-5 text-center shadow-sm"
      >
        <p className="font-display text-2xl">Your cart is empty</p>
        <p className="mt-1 text-sm text-rollo-ink/60">
          Pick a flavor and let’s roll.
        </p>
        <Link to="/menu" className="btn-primary mt-4">
          Back to menu
        </Link>
      </motion.div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-3xl">My Cart</h1>

      <ul className="mt-4 space-y-3">
        <AnimatePresence initial={false}>
          {lines.map((line) => (
            <motion.li
              layout
              key={line.lineId}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="rounded-2xl bg-white p-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 font-semibold">{line.itemName}</p>
                  {line.modifiers.length > 0 && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-rollo-ink/60">
                      {line.modifiers.map((m) => m.name).join(" · ")}
                    </p>
                  )}
                  {line.notes && (
                    <p className="mt-0.5 text-xs italic text-rollo-ink/60">
                      “{line.notes}”
                    </p>
                  )}
                </div>
                <span className="font-semibold">
                  ${(line.unitPrice * line.quantity).toFixed(2)}
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <div className="inline-flex items-center gap-2 rounded-full bg-rollo-pink-soft p-1">
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    aria-label="Decrease quantity"
                    onClick={() => setQuantity(line.lineId, line.quantity - 1)}
                    className="grid h-8 w-8 place-items-center rounded-full bg-white font-bold text-rollo-pink"
                  >
                    −
                  </motion.button>
                  <span className="min-w-6 text-center font-semibold">
                    {line.quantity}
                  </span>
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    aria-label="Increase quantity"
                    onClick={() => setQuantity(line.lineId, line.quantity + 1)}
                    className="grid h-8 w-8 place-items-center rounded-full bg-white font-bold text-rollo-pink"
                  >
                    +
                  </motion.button>
                </div>
                <button
                  onClick={() => removeLine(line.lineId)}
                  className="text-sm text-rollo-ink/50 underline-offset-2 hover:underline"
                >
                  Remove
                </button>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.04, duration: 0.2, ease: "easeOut" }}
        className="mt-6 rounded-3xl bg-white p-4 shadow-sm"
      >
        <div className="flex items-baseline justify-between border-b border-rollo-ink/10 pb-2">
          <span className="text-rollo-ink/70">Subtotal</span>
          <span className="font-semibold">${subtotal.toFixed(2)}</span>
        </div>
        <div className="mt-2 flex items-baseline justify-between text-sm">
          <span className="text-rollo-ink/55">Delivery Charge</span>
          <span className="font-semibold text-rollo-green">Free</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between text-sm">
          <span className="text-rollo-ink/55">Discount</span>
          <span className="font-semibold text-rollo-pink">$0.00</span>
        </div>
        <div className="mt-2 flex items-baseline justify-between border-t border-rollo-ink/10 pt-2">
          <span className="font-semibold">Total</span>
          <span className="text-lg font-bold text-rollo-pink">
            ${subtotal.toFixed(2)}
          </span>
        </div>
        <p className="mt-1 text-xs text-rollo-ink/50">
          Tax calculated at checkout. In-store pickup at {"Wolfchase"}.
        </p>
        <button
          className="btn-primary mt-4 w-full"
          onClick={() => navigate("/checkout")}
        >
          Continue to checkout
        </button>
        <Link to="/menu" className="btn-secondary mt-2 w-full">
          Add more items
        </Link>
      </motion.div>
    </div>
  );
}
