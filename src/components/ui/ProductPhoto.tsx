import type { CSSProperties } from "react";
import { motion } from "framer-motion";
import { flavorGradient } from "../../lib/flavors";
import type { FlavorKey } from "../../types";

/**
 * Circular product image. Two rendering paths:
 *
 *   - When `imageUrl` is provided, render an <img> (real photography
 *     for signature rolls — public/signatures/*.jpg, public/items/*.jpg, etc.).
 *   - Otherwise fall back to the flavor-gradient swatch (used for items
 *     without a photo yet, like bubble teas and BYO).
 *
 * In both cases the 50% border-radius + soft shadow are kept — that's
 * the visual signature shared across the menu, cart, and confirmation
 * screens. `layoutId` enables framer-motion's shared-element transition
 * so the photo morphs between card and modal positions seamlessly.
 *
 *   <ProductPhoto imageUrl="/signatures/yolo-1.jpg" size={92} />
 *   <ProductPhoto flavor="strawberry" size={92} />
 */
interface Props {
  /** Real product photograph. Wins over `flavor` when set. */
  imageUrl?: string;
  /** Fallback gradient flavor when no imageUrl is set. */
  flavor?: FlavorKey;
  size?: number;
  shape?: "circle" | "rect";
  className?: string;
  style?: CSSProperties;
  layoutId?: string;
  /** Alt text. Defaults to empty (treated as decorative). */
  alt?: string;
}

export function ProductPhoto({
  imageUrl,
  flavor,
  size = 88,
  shape = "circle",
  className,
  style,
  layoutId,
  alt = "",
}: Props) {
  // ─── Real photograph branch ──────────────────────────────────────
  // No circular container, no background, no shadow. The PNG cutout
  // lands directly on whatever surface the parent card provides. We
  // `object-contain` so the product's natural silhouette never gets
  // cropped, and slightly increase the bounding box so the unclipped
  // photo fills similar visual weight to the old circular swatch.
  if (imageUrl) {
    const imgSize = Math.round(size * 1.15);
    return (
      <motion.img
        layoutId={layoutId}
        src={imageUrl}
        alt={alt}
        loading="lazy"
        draggable={false}
        className={`relative shrink-0 ${className ?? ""}`}
        style={{
          width: imgSize,
          height: imgSize,
          objectFit: "contain",
          // Subtle drop shadow on the silhouette so the cutout still
          // reads as a 3D object on the card surface, not a sticker.
          filter: "drop-shadow(0 6px 14px rgba(20,8,14,0.18))",
          ...style,
        }}
      />
    );
  }

  // ─── Gradient swatch fallback (no photo yet) ─────────────────────
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
