import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useCart } from "../lib/cartStore";
import { CART_BUTTON_ID } from "../lib/flyToCart";
import { Icon } from "./ui/Icon";

/**
 * Two-mode floating button at the bottom of the viewport.
 *
 *   - On /menu and elsewhere: wide pink pill cart FAB
 *       [white-circle count] [View cart] [total $X.XX] [→]
 *     Hidden when cart is empty (opacity transition).
 *     This element is the target of the fly-to-cart animation —
 *     FlyToCartLayer reads its DOMRect via CART_BUTTON_ID.
 *
 *   - On /cart and /checkout: small 56px circular home button
 *     for quick navigation back to /menu.
 *
 *   - Hidden entirely on / (welcome) and /confirmation/:id.
 */
export function FloatingCart() {
  const location = useLocation();
  const lines = useCart((s) => s.lines);
  const subtotal = useCart((s) => s.subtotal());
  const totalQty = useCart((s) => s.totalQuantity());

  const hidden =
    location.pathname === "/" ||
    location.pathname.startsWith("/confirmation");
  if (hidden) return null;

  // On cart + checkout the FAB flips into "back to menu" mode.
  const isPostMenu =
    location.pathname === "/cart" || location.pathname === "/checkout";

  // ─── Back-to-menu mode (small circle) ───────────────────────────
  if (isPostMenu) {
    return (
      <div
        className="pointer-events-none fixed bottom-0 right-0 z-30 p-5"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <motion.div
          key="home"
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.7, opacity: 0 }}
          transition={{ type: "spring", stiffness: 280, damping: 22 }}
          className="pointer-events-auto"
        >
          <Link
            to="/menu"
            aria-label="Back to menu"
            className="relative grid h-14 w-14 place-items-center rounded-full bg-rollo-pink text-white shadow-rollo-fab ring-4 ring-white/70 transition active:scale-95"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <path d="m3 11 9-8 9 8" />
              <path d="M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10" />
              <path d="M10 21v-6h4v6" />
            </svg>
          </Link>
        </motion.div>
      </div>
    );
  }

  // ─── Cart FAB mode (wide pill) ──────────────────────────────────
  // Visible only when cart has items. We keep the element mounted so
  // the fly-to-cart animation always has a valid target rect, but
  // fade out + disable pointer events when count===0.
  const empty = lines.length === 0;
  return (
    <div
      className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 px-4 pb-6"
      style={{
        paddingBottom: "max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))",
      }}
    >
      <AnimatePresence>
        {!empty && (
          <motion.div
            key="cart-pill"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 22 }}
            className="pointer-events-auto"
          >
            <Link
              id={CART_BUTTON_ID}
              to="/cart"
              aria-label={`View cart, ${totalQty} item${totalQty === 1 ? "" : "s"}, total $${subtotal.toFixed(2)}`}
              className="flex w-full items-center justify-between gap-4 rounded-full bg-rollo-pink px-5 py-3 font-display font-bold text-white shadow-rollo-fab transition active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <div className="grid h-7 min-w-7 place-items-center rounded-full bg-white px-1 text-[13px] font-extrabold text-rollo-pink">
                  {totalQty}
                </div>
                <span className="text-[15px]">View cart</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="text-[15px] font-extrabold">
                  ${subtotal.toFixed(2)}
                </span>
                <Icon.arrow />
              </div>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
