import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { MenuItem } from "../../types";
import { flavorCardBg } from "../../lib/flavors";
import { ProductVisual, photoLayoutId } from "./ProductVisual";
import { Sticker } from "./Typography";
import { Icon } from "./Icon";

/**
 * Card primitives for the menu page.
 *
 *   <ProductCard/>   — grid tile (white card, circular photo, +button)
 *   <FeaturedCard/>  — rose-colored hero card with photo left, copy right
 *   <MiniPromoCard/> — butter-yellow square promo card (stacked layout)
 */

// ────────────────────────────────────────────────────────────────────
// ProductCard — used in the 2-col grid below the carousel.
// ────────────────────────────────────────────────────────────────────
interface ProductCardProps {
  item: MenuItem;
  /**
   * Receives the click event so the caller can grab the card's
   * bounding rect (used as the source for the fly-to-cart animation
   * when items add directly without opening the customizer modal).
   */
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  /** How many of this item are already in the cart. When > 0, the
   *  card swaps the + button for an inline stepper. */
  inCartCount?: number;
  /**
   * Optional stepper callbacks. When both are provided and
   * inCartCount > 0, the card renders a −/qty/+ stepper instead of
   * the static count pill. − removes one of the item (decrements the
   * most recent cart line; removes it when quantity hits 0). +
   * increments the most recent line by one.
   */
  onIncrement?: () => void;
  onDecrement?: () => void;
}

export function ProductCard({
  item,
  onClick,
  inCartCount = 0,
  onIncrement,
  onDecrement,
}: ProductCardProps) {
  // Build a short subtitle. If the item has structured base/mixin
  // metadata (signature rolls do), show "Vanilla · Oreo". Otherwise
  // fall back to the first phrase of the tagline.
  const subtitle =
    item.tagline?.split("·")[0]?.trim() ||
    item.description?.split("·")[0]?.trim() ||
    "";

  const inCart = inCartCount > 0;
  const showStepper = inCart && onIncrement && onDecrement;

  // Activate via mouse/touch click OR keyboard Enter/Space — required
  // since we use <div role="button"> (so we can legally nest <button>
  // elements for the inline stepper inside).
  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.key === "Enter" || e.key === " ") && onClick) {
      e.preventDefault();
      onClick(
        // Synthesize a click event from the keypress — onClick's caller
        // only needs e.currentTarget, which keyboard events also carry.
        e as unknown as React.MouseEvent<HTMLDivElement>,
      );
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKey}
      // When the item is in the cart, swap the hairline ink border for
      // a pink-tinted ring so it visually pops in the grid.
      // Per-flavor pastel tint replaces the flat white card so the
      // grid visually telegraphs each item's base color.
      style={{ background: flavorCardBg(item.flavor) }}
      className={`flex min-h-[210px] cursor-pointer flex-col gap-2 rounded-rollo-card p-3.5 text-left transition active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-rollo-pink ${
        inCart
          ? "border-2 border-rollo-pink shadow-rollo-pink"
          : "border border-rollo-ink-line shadow-rollo-card"
      }`}
    >
      {/* Photo + optional sticker badge */}
      <div className="relative flex justify-center pt-1.5">
        <ProductVisual
          item={item}
          size={92}
          layoutId={photoLayoutId(item.id)}
        />
        {item.tags && item.tags[0] && (
          <div className="absolute right-0 top-0">
            <Sticker size="sm">{item.tags[0]}</Sticker>
          </div>
        )}
      </div>

      {/* Title (2-line clamp) */}
      <div className="mt-0.5 line-clamp-2 min-h-[34px] text-sm font-bold leading-[1.2] text-rollo-ink">
        {item.name}
      </div>

      {/* Subtitle */}
      {subtitle && (
        <div className="-mt-1 truncate text-[11px] text-rollo-ink-muted">
          {subtitle}
        </div>
      )}

      {/* Price + add/stepper */}
      <div className="mt-auto flex items-center justify-between">
        <div className="text-[18px] font-extrabold tracking-[-0.02em] text-rollo-ink">
          ${item.price.toFixed(2)}
        </div>

        {showStepper ? (
          // Inline −/qty/+ stepper. stopPropagation on the buttons so
          // tapping a stepper control doesn't bubble up to the card
          // (which would open the customizer modal).
          <div
            className="flex items-center gap-0 rounded-full bg-rollo-pink text-white shadow-[0_4px_12px_-2px_rgba(236,30,121,0.5)]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label={`Remove one ${item.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onDecrement!();
              }}
              className="grid h-9 w-9 place-items-center rounded-full transition active:scale-[0.9]"
            >
              <Icon.minus />
            </button>
            <span className="min-w-[14px] text-center font-display text-sm font-extrabold tabular-nums">
              {inCartCount}
            </span>
            <button
              type="button"
              aria-label={`Add another ${item.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onIncrement!();
              }}
              className="grid h-9 w-9 place-items-center rounded-full transition active:scale-[0.9]"
            >
              <Icon.plus />
            </button>
          </div>
        ) : inCart ? (
          // Fallback static pill — only renders if a parent forgot to
          // wire up the stepper callbacks. Mostly here for safety;
          // production callers pass both.
          <div className="flex items-center gap-1 rounded-full bg-rollo-pink px-2.5 py-1.5 font-display text-xs font-extrabold text-white shadow-[0_4px_12px_-2px_rgba(236,30,121,0.5)]">
            <Icon.check className="h-3 w-3" />
            <span>×{inCartCount}</span>
          </div>
        ) : (
          <div className="grid h-9 w-9 place-items-center rounded-full bg-rollo-pink text-white shadow-[0_4px_12px_-2px_rgba(236,30,121,0.5)]">
            <Icon.plus />
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// FeaturedCard — wide rose card for the carousel.
//   variant="rose"  dusty rose default
//   variant="pink"  hot pink (every 3rd in the carousel)
//   variant="deep"  deepest rose
// ────────────────────────────────────────────────────────────────────
type FeaturedVariant = "rose" | "pink" | "deep";

interface FeaturedCardProps {
  item: MenuItem;
  onClick?: () => void;
  variant?: FeaturedVariant;
  /** How many of this item are already in the cart. When > 0, a small
   *  pill in the top-left corner shows the count. */
  inCartCount?: number;
}

const FEATURED_BG: Record<FeaturedVariant, string> = {
  rose: "bg-rollo-rose",
  pink: "bg-rollo-pink",
  deep: "bg-rollo-rose-deep",
};

export function FeaturedCard({
  item,
  onClick,
  variant = "rose",
  inCartCount = 0,
}: FeaturedCardProps) {
  // Take just the first part of the tagline for the hero (the rest
  // is for the customizer modal's longer description).
  const tagline = item.tagline?.split(",")[0]?.trim();
  // Cross-off price — 2 dollars higher, gives the "deal" feel.
  const oldPrice = (item.price + 2).toFixed(2);

  const inCart = inCartCount > 0;
  const hasPhoto = Boolean(item.imageUrl);

  // Almost-square hero card. When there's a real product photo we
  // render it as a floating cutout on a soft flavor-tinted backdrop
  // (same visual language as the grid cards); when there's no photo,
  // we fall back to the saturated variant color block + a centered
  // gradient swatch so the legacy look still works.
  const cardStyle = hasPhoto
    ? { background: flavorCardBg(item.flavor) }
    : undefined;
  const fallbackBg = hasPhoto ? "" : FEATURED_BG[variant];
  const textInkClass = hasPhoto ? "text-rollo-ink" : "text-white";
  const taglineClass = hasPhoto ? "text-rollo-ink-soft" : "text-white/80";
  const strikeClass = hasPhoto ? "text-rollo-ink-muted" : "text-white/55";

  return (
    <button
      type="button"
      onClick={onClick}
      style={cardStyle}
      className={`relative flex aspect-[1/1.05] w-full flex-col justify-between overflow-hidden rounded-rollo-hero p-5 text-left shadow-rollo-rose transition active:scale-[0.98] ${fallbackBg} ${
        inCart ? "ring-2 ring-rollo-pink" : ""
      }`}
    >
      {!hasPhoto && (
        <>
          {/* Decorative berries / sprinkles in the bottom-right corner —
              only on the no-photo fallback. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-4 -right-2.5 h-[160px] w-[160px] opacity-50"
            style={{
              background:
                "radial-gradient(circle at 30% 40%, #FF6B92 0 14px, transparent 15px), radial-gradient(circle at 60% 70%, #5B1F33 0 10px, transparent 11px), radial-gradient(circle at 80% 30%, #FFB6CB 0 8px, transparent 9px)",
            }}
          />
        </>
      )}

      {/* Top row — in-cart badge (left) and tag sticker (right). */}
      <div className="relative z-[2] flex items-start justify-between gap-2">
        {inCart ? (
          <div className="flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 font-display text-[11px] font-extrabold text-rollo-pink shadow-md">
            <Icon.check className="h-3 w-3" />
            <span>×{inCartCount}</span>
          </div>
        ) : (
          <div />
        )}
        {item.tags && item.tags[0] && (
          <Sticker
            size="sm"
            bg={hasPhoto ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.22)"}
            fg={hasPhoto ? "#B81560" : "#fff"}
            style={hasPhoto ? undefined : { backdropFilter: "blur(4px)" }}
          >
            {item.tags[0]}
          </Sticker>
        )}
      </div>

      {/* Floating product cutout — fills the middle of the card. The
          drop-shadow on ProductPhoto's <img> grounds it on the surface.
          Non-photo items get a ProductVisual that picks Roll/Cup/swatch. */}
      <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center">
        <ProductVisual
          item={item}
          size={hasPhoto ? 200 : 180}
          layoutId={photoLayoutId(item.id)}
          style={
            hasPhoto
              ? undefined
              : {
                  boxShadow:
                    "0 12px 28px -8px rgba(0,0,0,0.30), inset 0 -4px 14px rgba(0,0,0,0.14)",
                }
          }
        />
      </div>

      {/* Copy block — name, tagline, price stacked at the bottom. */}
      <div className="relative z-[2] flex flex-col gap-1">
        <div
          className={`font-display text-[22px] font-extrabold leading-[1.05] tracking-[-0.02em] ${textInkClass}`}
        >
          {item.name}
        </div>
        {tagline && (
          <div className={`text-[12px] leading-[1.3] ${taglineClass}`}>
            {tagline}
          </div>
        )}
        <div className="mt-1 flex items-baseline gap-2">
          <span
            className={`text-[22px] font-extrabold tracking-[-0.02em] ${textInkClass}`}
          >
            ${item.price.toFixed(2)}
          </span>
          {/* <span className={`text-[13px] line-through ${strikeClass}`}>
            ${oldPrice}
          </span> */}
        </div>
      </div>
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────
// MiniPromoCard — square butter-yellow promo (used in stacked mode).
// ────────────────────────────────────────────────────────────────────
interface MiniPromoCardProps {
  item: MenuItem;
  onClick?: () => void;
}

export function MiniPromoCard({ item, onClick }: MiniPromoCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[140px] w-full flex-col gap-2 rounded-rollo-card bg-rollo-butter p-3.5 text-left text-rollo-ink shadow-[0_8px_18px_-8px_rgba(0,0,0,0.18)] transition active:scale-[0.98]"
    >
      <ProductVisual item={item} size={56} className="self-start" />
      <div className="mt-auto font-display text-sm font-extrabold leading-[1.1]">
        {item.name}
      </div>
      <div className="font-display text-[15px] font-extrabold tracking-[-0.02em] text-rollo-pink-deep">
        ${item.price.toFixed(2)}
      </div>
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────
// Card — generic white card wrapper, 22px radius + pink-soft shadow.
// ────────────────────────────────────────────────────────────────────
interface CardProps extends ButtonHTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ children, className, ...rest }: CardProps) {
  return (
    <div
      className={`rounded-rollo-card bg-rollo-card p-4 shadow-rollo-card ${className ?? ""}`}
      {...rest}
    >
      {children}
    </div>
  );
}
