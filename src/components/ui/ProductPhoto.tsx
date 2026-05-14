import type { CSSProperties } from "react";
import { motion } from "framer-motion";
import { flavorGradient } from "../../lib/flavors";
import type { FlavorKey } from "../../types";

/**
 * Circular flavor-gradient swatch used as a stand-in for a product
 * photo. When real product photography exists, swap to <img> — the
 * 50% border-radius and soft shadow are the visual signature, so
 * keep those.
 *
 *   <ProductPhoto flavor="strawberry" size={92} />
 *
 * When `layoutId` is provided, the inner div becomes a motion.div so
 * framer-motion can morph the photo across mount boundaries (e.g.
 * carousel card → full-page detail, grid card → bottom-sheet hero).
 * The layoutId should be unique per item (e.g. `photo-{item.id}`).
 */
interface Props {
  flavor?: FlavorKey;
  size?: number;
  shape?: "circle" | "rect";
  className?: string;
  style?: CSSProperties;
  layoutId?: string;
}

export function ProductPhoto({
  flavor,
  size = 88,
  shape = "circle",
  className,
  style,
  layoutId,
}: Props) {
  const radius = shape === "rect" ? 18 : "50%";
  const baseStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius,
    background: flavorGradient(flavor),
    boxShadow:
      "inset 0 -3px 8px rgba(0,0,0,0.08), 0 3px 10px rgba(184,21,96,0.10)",
    ...style,
  };

  return (
    <motion.div
      // layoutId enables the shared-element transition. When the same
      // layoutId appears in two trees (e.g. card + modal hero), framer
      // animates the photo's position+size between the two automatically.
      layoutId={layoutId}
      aria-hidden
      className={`relative shrink-0 overflow-hidden ${className ?? ""}`}
      style={baseStyle}
    >
      {/* whipped-cream highlight */}
      <div
        className="absolute"
        style={{
          top: "12%",
          left: "18%",
          width: "40%",
          height: "24%",
          borderRadius: "50%",
          background: "rgba(255,255,255,0.55)",
          filter: "blur(4px)",
        }}
      />
      {/* speckles for visual texture */}
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          background:
            "radial-gradient(circle at 20% 80%, rgba(255,255,255,0.4) 1.5px, transparent 2px), radial-gradient(circle at 80% 30%, rgba(255,255,255,0.4) 1.5px, transparent 2px), radial-gradient(circle at 60% 70%, rgba(255,255,255,0.4) 1.5px, transparent 2px)",
        }}
      />
    </motion.div>
  );
}

/** Stable layoutId helper — keeps source + destination in sync. */
export function photoLayoutId(itemId: string): string {
  return `photo-${itemId}`;
}
