import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Pill button — the universal CTA shape across the app.
 *
 *   variant="primary"   hot pink, white text, soft glow.
 *   variant="dark"      ink-black, paper text — used on TV display.
 *   variant="rose"      dusty rose — pickup card actions.
 *   variant="secondary" white, ink text, hairline border.
 *   variant="soft"      pink-soft chip, deep pink text.
 *   variant="ghost"     transparent — quiet alternatives.
 *
 *   size="sm" 38px / "md" 48px / "lg" 56px tall.
 *
 *   full → expands to 100% width.
 */

type Variant = "primary" | "dark" | "rose" | "secondary" | "soft" | "ghost";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  full?: boolean;
  children: ReactNode;
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "bg-rollo-pink text-white shadow-rollo-pink",
  dark: "bg-rollo-ink text-rollo-card",
  rose: "bg-rollo-rose text-white shadow-rollo-rose",
  secondary: "bg-rollo-card text-rollo-ink border border-rollo-ink-line",
  soft: "bg-rollo-pink-soft text-rollo-pink-deep",
  ghost: "bg-transparent text-rollo-ink",
};

const SIZE_CLASS: Record<Size, string> = {
  sm: "h-[38px] px-3.5 text-[13px]",
  md: "h-12 px-5 text-sm",
  lg: "h-14 px-6 text-[15px]",
};

export function Button({
  variant = "primary",
  size = "md",
  full,
  className,
  children,
  type = "button",
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`font-display inline-flex items-center justify-center gap-2 rounded-full font-bold tracking-[-0.005em] whitespace-nowrap transition active:scale-[0.97] disabled:opacity-45 disabled:cursor-not-allowed ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${full ? "w-full" : ""} ${className ?? ""}`}
      {...rest}
    >
      {children}
    </button>
  );
}
