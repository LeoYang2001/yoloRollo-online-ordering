import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { MenuItem } from "../../types";
import { ProductPhoto, photoLayoutId } from "./ProductPhoto";
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
  onClick?: () => void;
  /** How many of this item are already in the cart. When > 0, the
   *  card swaps the + button for a count badge and adds a pink ring. */
  inCartCount?: number;
}

export function ProductCard({ item, onClick, inCartCount = 0 }: ProductCardProps) {
  // Build a short subtitle. If the item has structured base/mixin
  // metadata (signature rolls do), show "Vanilla · Oreo". Otherwise
  // fall back to the first phrase of the tagline.
  const subtitle =
    item.tagline?.split("·")[0]?.trim() ||
    item.description?.split("·")[0]?.trim() ||
    "";

  const inCart = inCartCount > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      // When the item is in the cart, swap the hairline ink border for
      // a pink-tinted ring so it visually pops in the grid.
      className={`flex min-h-[210px] flex-col gap-2 rounded-rollo-card bg-rollo-card p-3.5 text-left transition active:scale-[0.98] ${
        inCart
          ? "border-2 border-rollo-pink shadow-rollo-pink"
          : "border border-rollo-ink-line shadow-rollo-card"
      }`}
    >
      {/* Photo + optional sticker badge */}
      <div className="relative flex justify-center pt-1.5">
        <ProductPhoto
          flavor={item.flavor}
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

      {/* Price + add/count button */}
      <div className="mt-auto flex items-center justify-between">
        <div className="text-[18px] font-extrabold tracking-[-0.02em] text-rollo-ink">
          ${item.price.toFixed(2)}
        </div>
        {inCart ? (
          // In-cart indicator — pink pill with check + count. Replaces
          // the bare + button so customers know the item is already in
          // their bag at a glance.
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
    </button>
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

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex w-full min-h-[140px] items-center gap-3.5 overflow-hidden rounded-rollo-hero py-4 pl-3.5 pr-4 text-left text-white shadow-rollo-rose transition active:scale-[0.98] ${FEATURED_BG[variant]} ${inCart ? "ring-2 ring-white/60" : ""}`}
    >
      {/* Decorative berries / sprinkles in the bottom-right corner */}
      <div
        aria-hidden
        className="absolute -right-2.5 -bottom-4 h-[120px] w-[120px] opacity-50"
        style={{
          background:
            "radial-gradient(circle at 30% 40%, #FF6B92 0 14px, transparent 15px), radial-gradient(circle at 60% 70%, #5B1F33 0 10px, transparent 11px), radial-gradient(circle at 80% 30%, #FFB6CB 0 8px, transparent 9px)",
        }}
      />

      {/* In-cart count badge — top-left, only when in cart */}
      {inCart && (
        <div className="absolute left-3 top-3 z-[1] flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 font-display text-[11px] font-extrabold text-rollo-pink shadow-md">
          <Icon.check className="h-3 w-3" />
          <span>×{inCartCount}</span>
        </div>
      )}

      <div className="relative shrink-0">
        <ProductPhoto
          flavor={item.flavor}
          size={104}
          layoutId={photoLayoutId(item.id)}
          style={{
            boxShadow:
              "0 8px 20px -6px rgba(0,0,0,0.25), inset 0 -4px 12px rgba(0,0,0,0.12)",
          }}
        />
      </div>

      <div className="relative z-[1] min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="font-display text-[19px] font-extrabold leading-[1.05] tracking-[-0.02em] text-white">
            {item.name}
          </div>
          {item.tags && item.tags[0] && (
            <Sticker
              size="sm"
              bg="rgba(255,255,255,0.22)"
              fg="#fff"
              style={{ backdropFilter: "blur(4px)" }}
            >
              {item.tags[0]}
            </Sticker>
          )}
        </div>
        {tagline && (
          <div className="mt-1 text-[12px] leading-[1.3] text-white/80">
            {tagline}
          </div>
        )}
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-[20px] font-extrabold tracking-[-0.02em] text-white">
            ${item.price.toFixed(2)}
          </span>
          <span className="text-[13px] text-white/55 line-through">
            ${oldPrice}
          </span>
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
      <ProductPhoto
        flavor={item.flavor}
        size={56}
        className="self-start"
      />
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
