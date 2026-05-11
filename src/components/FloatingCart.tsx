import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useCart } from "../lib/cartStore";
import { CART_BUTTON_ID } from "../lib/flyToCart";

/**
 * Floating cart button — fixed to the bottom-right of the viewport on every
 * page except checkout/confirmation. Acts as the target for the fly-to-cart
 * animation (FlyToCartLayer reads its DOMRect from the well-known id).
 *
 * Uses `safe-area-inset-bottom` so it doesn't fight an iOS home indicator.
 */
export function FloatingCart() {
  const location = useLocation();
  const totalQty = useCart((s) => s.totalQuantity());

  const visible =
    location.pathname !== "/checkout" &&
    !location.pathname.startsWith("/confirmation") &&
    location.pathname !== "/"; // hide on welcome screen

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-0 right-0 z-30 p-5"
      style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
    >
      <motion.div
        // Subtle entrance so the button isn't suddenly there on route change.
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.7, opacity: 0 }}
        transition={{ type: "spring", stiffness: 280, damping: 22 }}
        className="pointer-events-auto"
      >
        <Link
          id={CART_BUTTON_ID}
          to="/cart"
          aria-label={`View cart, ${totalQty} item${totalQty === 1 ? "" : "s"}`}
          className="relative grid h-14 w-14 place-items-center rounded-full bg-rollo-pink text-white shadow-rollo ring-4 ring-white/70 transition active:scale-95"
        >
          {/* Shopping bag icon (matches the small one on the carousel card) */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
          >
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>

          {/* Count badge — pops with a spring when it changes */}
          <AnimatePresence>
            {totalQty > 0 && (
              <motion.span
                key={totalQty}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 18 }}
                className="absolute -right-1 -top-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1 text-xs font-bold text-rollo-pink shadow-md ring-2 ring-rollo-pink"
              >
                {totalQty}
              </motion.span>
            )}
          </AnimatePresence>
        </Link>
      </motion.div>
    </div>
  );
}
