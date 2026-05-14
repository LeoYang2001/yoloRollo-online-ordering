import type { SVGProps } from "react";

/**
 * Icon set — rounded, friendly line icons that match the
 * "Sweet Sundae" tone. Inline SVG, currentColor for stroke / fill so
 * Tailwind text-color classes work directly.
 *
 * Usage:
 *   <Icon.bag className="h-5 w-5 text-rollo-pink" />
 *   <Icon.grid className="text-rollo-pink" />
 */

type Props = SVGProps<SVGSVGElement>;

const base = (props: Props): Props => ({
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  viewBox: "0 0 24 24",
  width: 20,
  height: 20,
  ...props,
});

export const Icon = {
  bag: (p: Props = {}) => (
    <svg {...base(p)}>
      <path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  ),
  arrow: (p: Props = {}) => (
    <svg {...base({ strokeWidth: 2.4, width: 18, height: 18, ...p })}>
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  ),
  back: (p: Props = {}) => (
    <svg {...base({ strokeWidth: 2.4, ...p })}>
      <path d="M19 12H5M11 19l-7-7 7-7" />
    </svg>
  ),
  close: (p: Props = {}) => (
    <svg {...base({ strokeWidth: 2.4, width: 16, height: 16, ...p })}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  search: (p: Props = {}) => (
    <svg {...base({ strokeWidth: 2.2, width: 16, height: 16, ...p })}>
      <circle cx={11} cy={11} r={7} />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  ),
  filter: (p: Props = {}) => (
    <svg {...base({ strokeWidth: 2.2, width: 16, height: 16, ...p })}>
      <path d="M4 7h16M7 12h10M10 17h4" />
    </svg>
  ),
  plus: (p: Props = {}) => (
    <svg {...base({ strokeWidth: 3, width: 14, height: 14, ...p })}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  minus: (p: Props = {}) => (
    <svg {...base({ strokeWidth: 3, width: 14, height: 14, ...p })}>
      <path d="M5 12h14" />
    </svg>
  ),
  check: (p: Props = {}) => (
    <svg {...base({ strokeWidth: 3, width: 14, height: 14, ...p })}>
      <path d="M4 12.5 10 18 20 6" />
    </svg>
  ),
  bell: (p: Props = {}) => (
    <svg {...base({ width: 18, height: 18, ...p })}>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  ),
  grid: (p: Props = {}) => (
    <svg {...base({ width: 18, height: 18, ...p })}>
      <rect x={3} y={3} width={7} height={7} rx={1.5} />
      <rect x={14} y={3} width={7} height={7} rx={1.5} />
      <rect x={3} y={14} width={7} height={7} rx={1.5} />
      <rect x={14} y={14} width={7} height={7} rx={1.5} />
    </svg>
  ),
  pin: (p: Props = {}) => (
    <svg {...base({ strokeWidth: 2.2, width: 14, height: 14, ...p })}>
      <path d="M12 22s7-7.5 7-13a7 7 0 1 0-14 0c0 5.5 7 13 7 13z" />
      <circle cx={12} cy={9} r={2.5} />
    </svg>
  ),
  qr: (p: Props = {}) => (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="currentColor"
      {...p}
    >
      <path d="M3 3h7v7H3V3zm2 2v3h3V5H5zm9-2h7v7h-7V3zm2 2v3h3V5h-3zM3 14h7v7H3v-7zm2 2v3h3v-3H5zm9-2h2v2h-2v-2zm2 2h2v2h-2v-2zm2-2h2v2h-2v-2zm-4 4h2v2h-2v-2zm2 2h2v2h-2v-2zm2-2h2v2h-2v-2z" />
    </svg>
  ),
  heart: (p: Props = {}) => (
    <svg
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="currentColor"
      {...p}
    >
      <path d="M12 21s-7-4.5-9.5-9.5C0 6 4 2 8 4.5 10 6 11.5 7.5 12 8c0.5-0.5 2-2 4-3.5 4-2.5 8 1.5 5.5 7C19 16.5 12 21 12 21z" />
    </svg>
  ),
  // ─── Category icons ────────────────────────────────────────────
  cup: (p: Props = {}) => (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="currentColor"
      {...p}
    >
      <path d="M5 6h14l-1.5 13a2 2 0 0 1-2 1.8H8.5a2 2 0 0 1-2-1.8L5 6Z" />
      <path d="M9 3h6a1 1 0 0 1 1 1v2H8V4a1 1 0 0 1 1-1z" />
    </svg>
  ),
  boba: (p: Props = {}) => (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="currentColor"
      {...p}
    >
      <path d="M5 8h14l-1.5 12a2 2 0 0 1-2 1.8H8.5a2 2 0 0 1-2-1.8L5 8Z" />
      <ellipse cx={12} cy={8} rx={7} ry={1.5} />
      <circle cx={9} cy={17} r={1.4} opacity={0.55} />
      <circle cx={12.5} cy={18} r={1.4} opacity={0.55} />
      <circle cx={15} cy={16.5} r={1.4} opacity={0.55} />
    </svg>
  ),
  spoon: (p: Props = {}) => (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="currentColor"
      {...p}
    >
      <ellipse cx={9} cy={7} rx={5} ry={4} />
      <rect
        x={11.5}
        y={9}
        width={2.5}
        height={13}
        rx={1.25}
        transform="rotate(20 12.75 15.5)"
      />
    </svg>
  ),
};

/** Helper: get an icon component by name. Useful for data-driven menus. */
export function getIcon(name: keyof typeof Icon): (p?: Props) => JSX.Element {
  return Icon[name] ?? Icon.cup;
}
