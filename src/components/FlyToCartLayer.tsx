import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CART_BUTTON_ID, onFlyToCart, type FlyPayload } from "../lib/flyToCart";

/**
 * Renders the "ghost" item that flies from the source rect (passed in the
 * flyToCart event) to the floating cart button's current rect.
 *
 * Mounted once at app level; listens to a window event so any component can
 * trigger a flight without prop-drilling. Multiple concurrent flights are
 * supported — each flight is keyed by its id and animated independently,
 * then garbage-collected after a fixed duration.
 */
interface Flight extends FlyPayload {
  id: number;
  targetX: number;
  targetY: number;
}

const FLIGHT_MS = 650;

export function FlyToCartLayer() {
  const [flights, setFlights] = useState<Flight[]>([]);

  useEffect(() => {
    return onFlyToCart((payload) => {
      // Read the cart button's current rect at flight time — that way we
      // get the right target even if the cart has just animated in/out.
      const target = document
        .getElementById(CART_BUTTON_ID)
        ?.getBoundingClientRect();
      if (!target) return;

      const flight: Flight = {
        ...payload,
        id: Date.now() + Math.random(),
        // Center of the cart button.
        targetX: target.left + target.width / 2,
        targetY: target.top + target.height / 2,
      };
      setFlights((prev) => [...prev, flight]);

      // Auto-cleanup. AnimatePresence handles the exit anim, but we still
      // need to drop the flight from state once it's done.
      window.setTimeout(() => {
        setFlights((prev) => prev.filter((f) => f.id !== flight.id));
      }, FLIGHT_MS + 100);
    });
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      <AnimatePresence>
        {flights.map((flight) => {
          // The ghost is sized to roughly match the source — about the size
          // of a card image — and shrinks to ~36px as it flies, landing on
          // the cart button. Starting position uses the source's top-left
          // so transforms are intuitive.
          const sourceSize = Math.min(
            flight.from.width,
            flight.from.height,
            160,
          );
          const sourceX = flight.from.left + flight.from.width / 2;
          const sourceY = flight.from.top + flight.from.height / 2;

          return (
            <motion.div
              key={flight.id}
              initial={{
                x: sourceX,
                y: sourceY,
                scale: 1,
                opacity: 1,
              }}
              animate={{
                x: flight.targetX,
                y: flight.targetY,
                scale: 0.22,
                opacity: 0.85,
              }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{
                duration: FLIGHT_MS / 1000,
                // Custom bezier — quick out, slow in, with a slight arc feel
                // because we vary x/y curves separately. Tweak `y` curve to
                // give a gentle parabola if you want extra theatricality.
                ease: [0.45, 0.05, 0.55, 0.95],
              }}
              style={{
                position: "absolute",
                top: -sourceSize / 2,
                left: -sourceSize / 2,
                width: sourceSize,
                height: sourceSize,
              }}
              className="grid place-items-center rounded-full bg-rollo-pink-soft shadow-rollo ring-2 ring-rollo-pink/40 overflow-hidden"
            >
              {flight.imageSrc ? (
                <img
                  src={flight.imageSrc}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-5xl">🍦</span>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
