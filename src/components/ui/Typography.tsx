import type { CSSProperties, ReactNode } from "react";

/**
 * Typography primitives for the "Sweet Sundae" design system.
 *
 *   <Wordmark/>  — brand mark, "yolo rollo" in Bagel Fat One.
 *   <Display/>   — chunky headline, Plus Jakarta 800.
 *   <Mono/>      — tiny uppercase tag text, Geist Mono.
 *   <Sticker/>   — small pill badge ("BEST SELLER", "ROLL #1", etc.).
 */

// ────────────────────────────────────────────────────────────────────
// Wordmark — the "yolo rollo" logo, green + pink with optional orange
// "ICE CREAM" subtitle. Uses Bagel Fat One.
// ────────────────────────────────────────────────────────────────────
interface WordmarkProps {
  size?: number;
  withSub?: boolean;
  /** Override per-word colors (used on the dark TV display). */
  colors?: { yolo?: string; rollo?: string; sub?: string };
  className?: string;
}

export function Wordmark({
  size = 28,
  withSub = false,
  colors = {},
  className,
}: WordmarkProps) {
  const c = {
    yolo: colors.yolo ?? "#A6CE39",   // rollo-green
    rollo: colors.rollo ?? "#EC1E79", // rollo-pink
    sub: colors.sub ?? "#F58220",     // rollo-orange
  };
  return (
    <span
      className={`font-brand inline-flex flex-col leading-[0.88] tracking-[-0.02em] ${className ?? ""}`}
    >
      <span
        className="inline-flex items-baseline"
        style={{ fontSize: size, gap: size * 0.12 }}
      >
        <span style={{ color: c.yolo }}>yolo</span>
        <span style={{ color: c.rollo }}>rollo</span>
      </span>
      {withSub && (
        <span
          className="mt-0.5 tracking-[0.18em]"
          style={{ color: c.sub, fontSize: size * 0.32 }}
        >
          ICE CREAM
        </span>
      )}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────
// Display — chunky headline (Plus Jakarta 800).
// `size` and `weight` are inline so we don't have to enumerate every
// possible Tailwind size class — the design uses a wide range (16-88).
// ────────────────────────────────────────────────────────────────────
interface DisplayProps {
  children: ReactNode;
  size?: number;
  weight?: 700 | 800;
  className?: string;
  style?: CSSProperties;
  nowrap?: boolean;
  as?: "h1" | "h2" | "h3" | "div";
}

export function Display({
  children,
  size = 28,
  weight = 800,
  className,
  style,
  nowrap,
  as: Tag = "h2",
}: DisplayProps) {
  return (
    <Tag
      className={`font-display m-0 leading-[1.05] tracking-[-0.025em] ${nowrap ? "whitespace-nowrap" : ""} ${className ?? ""}`}
      style={{ fontSize: size, fontWeight: weight, ...style }}
    >
      {children}
    </Tag>
  );
}

// ────────────────────────────────────────────────────────────────────
// Mono — small uppercase label (Geist Mono).
// Used for "YOUR INFO", "ORDER CONFIRMED · TUE, MAY 12", "CHANGE", etc.
// ────────────────────────────────────────────────────────────────────
interface MonoProps {
  children: ReactNode;
  size?: number;
  weight?: 400 | 500 | 600 | 700;
  /** Hex / rgba — overrides the default ink-soft. */
  color?: string;
  /** CSS letter-spacing override. */
  letterSpacing?: string;
  /** Lowercase mode (rarely used). */
  upper?: boolean;
  className?: string;
}

export function Mono({
  children,
  size = 10,
  weight = 500,
  color,
  letterSpacing = "0.1em",
  upper = true,
  className,
}: MonoProps) {
  return (
    <span
      className={`font-mono whitespace-nowrap ${className ?? ""}`}
      style={{
        fontSize: size,
        fontWeight: weight,
        color: color ?? "rgba(42,23,34,0.62)",
        letterSpacing,
        textTransform: upper ? "uppercase" : "none",
      }}
    >
      {children}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────
// Sticker — small pill badge with all-caps wide-tracking text.
// Used for "BEST SELLER", "ROLL #1", "FAST LANE", "~8 MIN", etc.
// ────────────────────────────────────────────────────────────────────
interface StickerProps {
  children: ReactNode;
  /** Background color (hex or rgba). Defaults to hot pink. */
  bg?: string;
  /** Foreground color. Defaults to white. */
  fg?: string;
  /** Tilt the sticker for that "stuck on" feel. */
  rotate?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
  style?: CSSProperties;
}

const STICKER_PADS = { sm: "px-2 py-1", md: "px-3 py-1.5", lg: "px-3.5 py-2" };
const STICKER_FONT_SIZE = { sm: 9, md: 11, lg: 12 };

export function Sticker({
  children,
  bg = "#EC1E79",
  fg = "#fff",
  rotate = 0,
  size = "sm",
  className,
  style,
}: StickerProps) {
  return (
    <span
      className={`font-display inline-flex items-center gap-1 rounded-full font-bold uppercase tracking-[0.04em] whitespace-nowrap ${STICKER_PADS[size]} ${className ?? ""}`}
      style={{
        background: bg,
        color: fg,
        fontSize: STICKER_FONT_SIZE[size],
        transform: rotate ? `rotate(${rotate}deg)` : undefined,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
