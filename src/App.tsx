import { AnimatePresence, motion } from "framer-motion";
import { Outlet, useLocation } from "react-router-dom";
import { FloatingCart } from "./components/FloatingCart";
import { FlyToCartLayer } from "./components/FlyToCartLayer";

/**
 * Top-level layout for the customer ordering flow.
 *
 * The redesign moves the page header _into_ each page (Welcome/Menu have
 * their own custom headers; Cart/Checkout/Confirmation use the shared
 * <Header/> from src/components/ui/Layout). So this wrapper is mostly
 * the page-transition shell + the floating action button.
 *
 * The /tv route bypasses this entirely (see main.tsx) so the TV display
 * has zero chrome.
 */
export default function App() {
  const location = useLocation();

  return (
    <div className="relative min-h-screen bg-rollo-paper text-rollo-ink">
      <AnimatePresence mode="popLayout">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          <Outlet />
        </motion.div>
      </AnimatePresence>

      {/* Floating action button — cart pill on /menu, home button on
          /cart and /checkout, hidden on / and /confirmation. */}
      <FloatingCart />

      {/* Animated layer that flies items into the cart FAB on add. */}
      <FlyToCartLayer />
    </div>
  );
}
