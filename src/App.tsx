import { AnimatePresence, motion } from "framer-motion";
import { Outlet, useLocation } from "react-router-dom";
import { Header } from "./components/Header";
import { FloatingCart } from "./components/FloatingCart";
import { FlyToCartLayer } from "./components/FlyToCartLayer";

/**
 * Top-level layout for the customer ordering flow. The /tv route bypasses
 * this entirely (see main.tsx) so the TV display has zero chrome.
 */
export default function App() {
  const location = useLocation();
  const isWelcomePage = location.pathname === "/";
  // /menu wants the full viewport so its inner panels can split the screen
  // and the carousel can collapse as the bottom panel scrolls. Drop the
  // outer bottom padding for that route so nothing pushes us past 100dvh.
  const isMenuPage = location.pathname === "/menu";

  return (
    <div className="relative min-h-full overflow-hidden bg-[#ffd8e5]/45">
      {/* Decorative background blobs */}
      <div className="pointer-events-none fixed -left-8 -top-8 h-24 w-24 rounded-full bg-white/30" />
      <div className="pointer-events-none fixed -right-10 top-36 h-28 w-28 rounded-full bg-rollo-pink/20" />

      {!isWelcomePage && <Header />}
      <main
        className={
          isWelcomePage
            ? "min-h-screen"
            : isMenuPage
              ? "mx-auto max-w-2xl px-4 pt-2"
              : "mx-auto max-w-2xl px-4 pb-32 pt-4"
        }
      >
        <AnimatePresence mode="popLayout">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Floating cart button + the layer that animates items into it. */}
      <FloatingCart />
      <FlyToCartLayer />
    </div>
  );
}
