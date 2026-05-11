import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { brand } from "../config/brand";

/**
 * Sticky header. The cart pill that used to live here moved to the
 * <FloatingCart /> button (fixed bottom-right) so we keep the header light.
 *
 * The Yolo Rollo wordmark renders text-only as a fallback if
 * /public/logo.png isn't there yet — saves you from a broken image
 * during the first deploy.
 */
export function Header() {
  const location = useLocation();
  const showWelcomeButton = location.pathname === "/menu";

  return (
    <header className="sticky top-0 z-20 bg-rollo-pink-soft/90 backdrop-blur">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3"
      >
        <Link to="/menu" className="flex items-center gap-2">
          <img
            src={brand.logoSrc}
            alt=""
            className="h-9 w-9 rounded-full bg-white object-contain p-0.5"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
          <span className="font-display text-2xl leading-none">
            <span className="text-rollo-green">yolo</span>{" "}
            <span className="text-rollo-pink">rollo</span>
          </span>
        </Link>

        {showWelcomeButton && (
          <motion.div whileTap={{ scale: 0.96 }}>
            <Link
              to="/"
              className="rounded-full bg-white px-3 py-2 text-sm font-semibold shadow-sm ring-1 ring-rollo-ink/10"
            >
              Welcome
            </Link>
          </motion.div>
        )}
      </motion.div>
    </header>
  );
}
