import type { CSSProperties } from "react";
import type { MenuItem } from "../../types";
import { CupPreview } from "../CupPreview";
import { RollPreview } from "../RollPreview";
import { ProductPhoto, photoLayoutId } from "./ProductPhoto";

/**
 * ProductVisual — the single decision point for "what should we show
 * as this item's picture?" Drops in anywhere a ProductPhoto used to
 * live and picks the right renderer per item:
 *
 *   1. imageUrl set            → real photograph (signature rolls,
 *                                 Yolo Signatures)
 *   2. Build Your Own Roll     → live <RollPreview/> with empty
 *                                 selections (a cup of vanilla rolls
 *                                 so the customer sees what they'll
 *                                 be building)
 *   3. category === "Bubble Tea" → <CupPreview kind="bubble-tea"/>
 *   4. category === "Smoothie"    → <CupPreview kind="smoothie"/>
 *   5. anything else             → flavor-gradient swatch (the original
 *                                   ProductPhoto fallback)
 *
 * Centralizing this means cards, carousels, and the modal hero all
 * stay in sync without each having to know how to draw a roll vs a
 * cup vs a swatch.
 */

interface Props {
  item: MenuItem;
  size?: number;
  layoutId?: string;
  className?: string;
  /** Forwarded to the underlying ProductPhoto fallback. Ignored by
   *  the RollPreview / CupPreview branches (they manage their own
   *  styling). */
  style?: CSSProperties;
  /** Forwarded as `alt` to the photo branch. */
  alt?: string;
}

const EMPTY_ROLL_SELECTIONS = { base: undefined, mixIns: [], toppings: [] };

function isBYO(item: MenuItem): boolean {
  return /(customize|build)\s+your\s+own/i.test(item.name);
}

export function ProductVisual({
  item,
  size = 92,
  layoutId,
  className,
  style,
  alt,
}: Props) {
  if (item.imageUrl) {
    return (
      <ProductPhoto
        imageUrl={item.imageUrl}
        flavor={item.flavor}
        alt={alt ?? item.name}
        size={size}
        layoutId={layoutId}
        className={className}
        style={style}
      />
    );
  }

  if (isBYO(item)) {
    return (
      <RollPreview
        selections={EMPTY_ROLL_SELECTIONS}
        size={size}
        className={className}
      />
    );
  }

  if (item.category === "Bubble Tea") {
    return (
      <CupPreview
        kind="bubble-tea"
        flavor={item.flavor}
        size={size}
        className={className}
      />
    );
  }

  if (item.category === "Smoothie" || item.category === "Smoothies") {
    return (
      <CupPreview
        kind="smoothie"
        flavor={item.flavor}
        size={size}
        className={className}
      />
    );
  }

  return (
    <ProductPhoto
      flavor={item.flavor}
      alt={alt ?? item.name}
      size={size}
      layoutId={layoutId}
      className={className}
      style={style}
    />
  );
}

export { photoLayoutId };
