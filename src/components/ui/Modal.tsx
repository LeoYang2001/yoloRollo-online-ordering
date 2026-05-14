import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Bottom-sheet modal.
 *
 *   - Dark ink-tinted backdrop fades in
 *   - Sheet slides up from the bottom with a 280ms spring
 *   - Max height 90% of viewport, scrolls internally
 *   - Tap backdrop to dismiss
 *
 * Used by the item customizer modal on the menu.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ open, onClose, children }: Props) {
  // Lock body scroll while open so the page underneath doesn't drift
  // when the modal is touch-scrolled at its edges.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          onClick={onClose}
          className="fixed inset-0 z-[100] flex items-end"
          style={{ background: "rgba(42,23,34,0.42)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90%] w-full overflow-auto rounded-t-rollo-ticket bg-rollo-card shadow-rollo-modal"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
