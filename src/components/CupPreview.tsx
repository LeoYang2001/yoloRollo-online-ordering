import { FLAVOR_PALETTE } from "../lib/flavors";
import type { FlavorKey } from "../types";

/**
 * CupPreview — stylized SVG of a 20oz takeaway cup with a dome lid,
 * used as the menu / modal visual for bubble teas and smoothies that
 * don't have product photography. Two modes:
 *
 *   kind="bubble-tea"  → milky drink with a dark boba layer at the
 *                        bottom + a few ice cubes near the top.
 *
 *   kind="smoothie"    → thick blended fill with small frozen-fruit
 *                        flecks throughout + a foamy crown at the top.
 *
 * `flavor` keys into FLAVOR_PALETTE for the drink color. Strawberry →
 * soft pink, mango → orange, coconut → cream, etc. Falls back to the
 * vanilla palette for anything unknown.
 */

interface Props {
  kind: "bubble-tea" | "smoothie";
  flavor?: FlavorKey;
  size?: number;
  className?: string;
}

// Deterministic random — same flavor always lays out the same dots /
// boba positions, so the visual is stable across re-renders.
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
function seededRandom(seed: number): number {
  let t = (seed + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ─── Cup geometry — shared by both kinds ────────────────────────────
// 200×220 viewBox. The cup tapers slightly inward toward the bottom
// and is topped by a clear dome lid that sticks up another ~40px.
const CUP_TOP_Y = 70; // cup rim / dome attachment
const CUP_BOT_Y = 208; // cup base
const RIM_LEFT_X = 38;
const RIM_RIGHT_X = 162;
const BASE_LEFT_X = 50;
const BASE_RIGHT_X = 150;
const DOME_TOP_Y = 22;

// SVG path for the cup body — used both as the outline and as the
// clipPath that traps the drink fill inside it. Rounded corners at the
// base soften the cup so it doesn't look like a paper bag.
const CUP_PATH = `
  M ${RIM_LEFT_X} ${CUP_TOP_Y}
  L ${BASE_LEFT_X} ${CUP_BOT_Y - 4}
  Q ${BASE_LEFT_X} ${CUP_BOT_Y} ${BASE_LEFT_X + 4} ${CUP_BOT_Y}
  L ${BASE_RIGHT_X - 4} ${CUP_BOT_Y}
  Q ${BASE_RIGHT_X} ${CUP_BOT_Y} ${BASE_RIGHT_X} ${CUP_BOT_Y - 4}
  L ${RIM_RIGHT_X} ${CUP_TOP_Y}
  Z
`;

// Dome lid — half-ellipse on top of the cup. We render it twice:
// once as a clear filled half-dome (for boba pieces inside the lid
// area), once as the glossy outline.
const DOME_PATH = `
  M ${RIM_LEFT_X} ${CUP_TOP_Y}
  Q ${RIM_LEFT_X - 4} ${DOME_TOP_Y + 10} 100 ${DOME_TOP_Y}
  Q ${RIM_RIGHT_X + 4} ${DOME_TOP_Y + 10} ${RIM_RIGHT_X} ${CUP_TOP_Y}
  Z
`;

export function CupPreview({ kind, flavor, size = 200, className }: Props) {
  const palette = (flavor && FLAVOR_PALETTE[flavor]) || FLAVOR_PALETTE.vanilla;
  const { c1, c2 } = palette;
  const liquidId = `cup-liquid-${kind}-${flavor ?? "default"}`;
  const cupClipId = `cup-clip-${kind}-${flavor ?? "default"}`;

  return (
    <svg
      viewBox="0 0 200 220"
      width={size}
      height={(size * 220) / 200}
      className={className}
      aria-label={`${kind === "bubble-tea" ? "Bubble tea" : "Smoothie"} preview`}
    >
      <defs>
        {/* Liquid fill — a vertical gradient. Slightly lighter at the
            top (catching the cup highlight) than the bottom. */}
        <linearGradient id={liquidId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
        {/* Cup clipPath — everything we want to keep inside the cup
            (drink fill, boba, ice, dots) lives under this. */}
        <clipPath id={cupClipId}>
          <path d={CUP_PATH} />
        </clipPath>
      </defs>

      {/* ─── Surface shadow ───────────────────────────────────── */}
      <ellipse
        cx={100}
        cy={214}
        rx={68}
        ry={5}
        fill="rgba(184,21,96,0.15)"
      />

      {/* ─── Drink fill (clipped to cup) ──────────────────────── */}
      <g clipPath={`url(#${cupClipId})`}>
        {kind === "bubble-tea"
          ? renderBubbleTea(liquidId, flavor)
          : renderSmoothie(liquidId, c1, c2, flavor)}
      </g>

      {/* ─── Cup outline ──────────────────────────────────────── */}
      <path
        d={CUP_PATH}
        fill="none"
        stroke="rgba(0,0,0,0.20)"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      {/* Vertical highlight on the left side of the cup — gives the
          plastic that 3D translucent feel. */}
      <path
        d={`M ${RIM_LEFT_X + 4} ${CUP_TOP_Y + 8}
             L ${BASE_LEFT_X + 6} ${CUP_BOT_Y - 12}`}
        stroke="rgba(255,255,255,0.55)"
        strokeWidth={3}
        strokeLinecap="round"
        opacity={0.7}
        style={{ filter: "blur(1px)" }}
      />

      {/* ─── Dome lid ─────────────────────────────────────────── */}
      {/* Faint fill under the dome for translucence. */}
      <path
        d={DOME_PATH}
        fill="rgba(220,225,232,0.20)"
      />
      {/* Dome outline. */}
      <path
        d={DOME_PATH}
        fill="none"
        stroke="rgba(0,0,0,0.20)"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      {/* Rim flange — small horizontal line where the dome snaps onto
          the cup. */}
      <line
        x1={RIM_LEFT_X - 4}
        y1={CUP_TOP_Y}
        x2={RIM_RIGHT_X + 4}
        y2={CUP_TOP_Y}
        stroke="rgba(0,0,0,0.30)"
        strokeWidth={2}
        strokeLinecap="round"
      />
      {/* Dome top highlight. */}
      <ellipse
        cx={84}
        cy={DOME_TOP_Y + 8}
        rx={18}
        ry={5}
        fill="rgba(255,255,255,0.55)"
        opacity={0.7}
        style={{ filter: "blur(0.6px)" }}
      />
    </svg>
  );
}

// ─── Bubble tea internals ────────────────────────────────────────────
// Liquid fills the cup from the rim down to the base, but the boba
// layer at the bottom is drawn on top and obscures the liquid below it
// — same way real bubble tea sits.
function renderBubbleTea(liquidId: string, flavor: FlavorKey | undefined) {
  const seed = hashString(`boba-layer-${flavor ?? "default"}`);
  // Boba layer occupies the bottom ~45px of the cup.
  const BOBA_TOP_Y = 165;
  const out: JSX.Element[] = [];

  // Liquid (milk tea) fill — full cup background.
  out.push(
    <rect
      key="liquid"
      x={0}
      y={CUP_TOP_Y}
      width={200}
      height={CUP_BOT_Y - CUP_TOP_Y}
      fill={`url(#${liquidId})`}
    />,
  );

  // Liquid surface line — slightly darker stroke to suggest the tea
  // top under the dome lid.
  out.push(
    <line
      key="surface"
      x1={RIM_LEFT_X + 6}
      y1={CUP_TOP_Y + 2}
      x2={RIM_RIGHT_X - 6}
      y2={CUP_TOP_Y + 2}
      stroke="rgba(0,0,0,0.08)"
      strokeWidth={1}
    />,
  );

  // Ice cubes — 4 translucent rectangles floating near the top.
  for (let i = 0; i < 4; i++) {
    const r1 = seededRandom(seed + i * 7 + 1);
    const r2 = seededRandom(seed + i * 11 + 3);
    const x = 50 + r1 * 90;
    const y = CUP_TOP_Y + 8 + r2 * 24;
    const rot = (r1 - 0.5) * 30;
    out.push(
      <rect
        key={`ice-${i}`}
        x={x - 8}
        y={y - 6}
        width={16}
        height={12}
        rx={2}
        fill="rgba(255,255,255,0.55)"
        stroke="rgba(255,255,255,0.75)"
        strokeWidth={0.7}
        transform={`rotate(${rot} ${x} ${y})`}
      />,
    );
  }

  // Boba layer — dark pearls clustered at the bottom 35% of the cup.
  // 24 pearls in 3 rows, with x-jitter so they don't grid-align.
  for (let i = 0; i < 26; i++) {
    const r1 = seededRandom(seed + i * 13);
    const r2 = seededRandom(seed + i * 17 + 5);
    const row = i % 3;
    const cx = 52 + (i % 9) * 12 + (r1 - 0.5) * 6;
    const cy = BOBA_TOP_Y + 8 + row * 12 + (r2 - 0.5) * 3;
    out.push(
      <g key={`boba-${i}`}>
        <circle cx={cx} cy={cy} r={5} fill="#1A1A1A" />
        <circle
          cx={cx - 1.5}
          cy={cy - 1.5}
          r={1.2}
          fill="rgba(255,255,255,0.45)"
        />
      </g>,
    );
  }

  return out;
}

// ─── Smoothie internals ──────────────────────────────────────────────
// Thick blended fill from the rim down, with small frozen-fruit flecks
// throughout and a foamy "swirl" near the top.
function renderSmoothie(
  liquidId: string,
  c1: string,
  c2: string,
  flavor: FlavorKey | undefined,
) {
  const seed = hashString(`smoothie-${flavor ?? "default"}`);
  const out: JSX.Element[] = [];

  // Smoothie body fill — slightly opaque so the cup outline reads as
  // a thick blend.
  out.push(
    <rect
      key="fill"
      x={0}
      y={CUP_TOP_Y - 2}
      width={200}
      height={CUP_BOT_Y - CUP_TOP_Y + 2}
      fill={`url(#${liquidId})`}
    />,
  );

  // Frozen-fruit flecks — small lighter dots scattered through the
  // smoothie body.
  for (let i = 0; i < 22; i++) {
    const r1 = seededRandom(seed + i * 7);
    const r2 = seededRandom(seed + i * 11 + 3);
    const r3 = seededRandom(seed + i * 13 + 7);
    const cx = 50 + r1 * 100;
    const cy = CUP_TOP_Y + 10 + r2 * (CUP_BOT_Y - CUP_TOP_Y - 20);
    const radius = 1 + r3 * 1.6;
    out.push(
      <circle
        key={`fleck-${i}`}
        cx={cx}
        cy={cy}
        r={radius}
        fill="rgba(255,255,255,0.55)"
      />,
    );
  }

  // Slightly darker flecks for variety (suggests darker fruit pieces).
  for (let i = 0; i < 10; i++) {
    const r1 = seededRandom(seed + i * 19 + 31);
    const r2 = seededRandom(seed + i * 23 + 41);
    const cx = 52 + r1 * 96;
    const cy = CUP_TOP_Y + 14 + r2 * (CUP_BOT_Y - CUP_TOP_Y - 28);
    out.push(
      <circle
        key={`fleck-dark-${i}`}
        cx={cx}
        cy={cy}
        r={1.4}
        fill={c2}
        opacity={0.45}
      />,
    );
  }

  // Foamy crown near the top — a few overlapping ellipses in c1 (the
  // highlight color) to suggest the blended foam sitting on top of
  // the drink, peeking under the dome.
  for (let i = 0; i < 5; i++) {
    const r1 = seededRandom(seed + i * 29 + 11);
    const cx = 50 + i * 22 + (r1 - 0.5) * 6;
    const cy = CUP_TOP_Y + 2 + (r1 - 0.5) * 4;
    out.push(
      <ellipse
        key={`foam-${i}`}
        cx={cx}
        cy={cy}
        rx={14}
        ry={6}
        fill={c1}
        opacity={0.85}
      />,
    );
  }

  return out;
}
