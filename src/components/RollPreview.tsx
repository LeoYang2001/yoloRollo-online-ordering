import { AnimatePresence, motion } from "framer-motion";

/**
 * RollPreview — live SVG composition of a cup of rolled ice cream as
 * the customer configures it. Reflects rolled ice cream's actual
 * presentation: 5 short cylindrical rolls standing upright in a paper
 * cup, viewed from a slight 3/4 angle.
 *
 *   - Base   → swirl + cylinder fill colors morph
 *   - Mix-in → small colored chunks scattered across the roll bodies
 *              (clipped to the rolls so chunks never float outside).
 *              Each ingredient seeds a deterministic position set so
 *              the same selection always looks the same.
 *   - Topping → drizzles arc across the roll tops; scatter / multi
 *               drop pieces over them; boba lines up translucent
 *               spheres along the top edge.
 *
 * All shapes animate in via framer-motion spring/fade so configuring
 * feels alive without feeling jittery.
 */

interface Selections {
  /** Selected base flavor name. */
  base?: string;
  /** Selected mix-in names. */
  mixIns: string[];
  /** Selected topping names. */
  toppings: string[];
}

interface Props {
  selections: Selections;
  size?: number;
  className?: string;
}

// ─── Ingredient palette ──────────────────────────────────────────────
const BASE_GRADIENT: Record<string, [string, string]> = {
  Vanilla:    ["#FFF8E5", "#F2DFA7"],
  Strawberry: ["#FFE0E7", "#F8848F"],
  Chocolate:  ["#9B6D4E", "#4A2A18"],
  Mango:      ["#FFEFB0", "#FFB13C"],
  Coconut:    ["#FFF8EE", "#E8D2B5"],
};

const MIXIN_COLOR: Record<string, string> = {
  Banana:          "#FFE680",
  "Oreo Cookie":   "#1A1A1A",
  Brownie:         "#3A1F0F",
  Strawberry:      "#FF6B92",
  Pineapple:       "#FFD658",
  Mango:           "#FFA64D",
  Blueberry:       "#5A7BC4",
  Cheesecake:      "#FFE89C",
  "Peanut Butter": "#C8985A",
};

type ToppingKind = "drizzle" | "scatter" | "boba" | "multi";
const TOPPING: Record<string, { kind: ToppingKind; colors: string[] }> = {
  "Condensed Milk":  { kind: "drizzle", colors: ["#FFFCE5"] },
  "Chocolate Syrup": { kind: "drizzle", colors: ["#3A1F0F"] },
  "Caramel Syrup":   { kind: "drizzle", colors: ["#D49A4A"] },
  Mango:             { kind: "scatter", colors: ["#FFA64D"] },
  Strawberry:        { kind: "scatter", colors: ["#FF6B92"] },
  Pineapple:         { kind: "scatter", colors: ["#FFD658"] },
  "Mango Boba":      { kind: "boba",    colors: ["#FF9F40"] },
  "Strawberry Boba": { kind: "boba",    colors: ["#FF6B92"] },
  "Oreo Cookie":     { kind: "scatter", colors: ["#1A1A1A"] },
  "M&Ms":            { kind: "multi",   colors: ["#E63946", "#F4C430", "#06A77D", "#3D5A80"] },
  "Gummy Bears":     { kind: "multi",   colors: ["#F4C430", "#FF6B92", "#06A77D"] },
};

// ─── Deterministic random (so chunks don't jitter between renders) ──
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
function seededRandom(seed: number): number {
  // Mulberry32 — small, fast, decent distribution for visual placement.
  let t = (seed + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ─── Roll geometry ───────────────────────────────────────────────────
// 5 rolls standing in the cup, viewed roughly head-on with a slight
// downward tilt so the customer sees both the cylinder body AND the
// top swirl. Roll bodies are clipped just below the cup rim so they
// look like they're sitting INSIDE the cup, not floating above it.
//
// All coordinates are inside the 200×220 SVG viewBox.
const ROLL_WIDTH = 26;
const ROLL_TOP_Y = 56;
const ROLL_BOTTOM_Y = 138; // a few px below the cup rim — gets clipped
const CUP_RIM_Y = 132;
const ROLL_CENTERS_X = [44, 72, 100, 128, 156];

// Per-roll randomness — each roll gets a tiny height, x-jiggle, and
// swirl-rotation offset so the five rolls look hand-scraped instead of
// factory-cloned. Deterministic on the index so the same render is
// stable across re-mounts.
interface RollGeom {
  cx: number;
  topY: number;
  rotation: number; // degrees, applied to the swirl spiral only
}
const ROLLS: RollGeom[] = ROLL_CENTERS_X.map((baseX, i) => {
  const r1 = seededRandom(hashString(`roll-pos-${i}`));
  const r2 = seededRandom(hashString(`roll-pos-${i}`) + 7);
  const r3 = seededRandom(hashString(`roll-pos-${i}`) + 13);
  return {
    cx: baseX + (r1 - 0.5) * 3, // ±1.5 px horizontal nudge
    topY: ROLL_TOP_Y + (r2 - 0.5) * 4, // ±2 px height variation
    rotation: r3 * 360, // swirl starts at any angle
  };
});

/**
 * Archimedean spiral inside an ellipse — used for the roll top "swirl"
 * to read as actual rolled-up ice cream, not just a smooth disc.
 * Returns an SVG path string sampled at 40 points over `turns` loops.
 */
function spiralPath(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  turns: number,
  startAngle = 0,
): string {
  const steps = 48;
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = startAngle + t * turns * Math.PI * 2;
    const r = t; // 0 (center) → 1 (rim)
    const x = cx + Math.cos(angle) * rx * r;
    const y = cy + Math.sin(angle) * ry * r;
    d += `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)} `;
  }
  return d.trim();
}

// ─── Component ───────────────────────────────────────────────────────
export function RollPreview({ selections, size = 200, className }: Props) {
  const baseName = selections.base ?? "Vanilla";
  const [c1, c2] = BASE_GRADIENT[baseName] ?? BASE_GRADIENT.Vanilla;
  // Gradient ids keyed by base so the defs swap when base changes.
  const gradBody = `roll-body-${baseName.replace(/\s+/g, "-")}`;
  const gradTop = `roll-top-${baseName.replace(/\s+/g, "-")}`;

  return (
    <svg
      viewBox="0 0 200 220"
      width={size}
      height={(size * 220) / 200}
      className={className}
      aria-label={`Rolled ice cream preview: ${baseName} base`}
    >
      <defs>
        {/* Vertical gradient on the roll body — lighter near the top
            (catching imagined light) and slightly darker near the
            bottom inside the cup. */}
        <linearGradient id={gradBody} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
        {/* The roll top is the prominent visible disc — a radial
            gradient suggests the swirl coming up from the center. */}
        <radialGradient id={gradTop} cx="40%" cy="40%">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </radialGradient>
        {/* Cup body fill — paper-card cream, slightly darker at the
            bottom to suggest a shadow inside. */}
        <linearGradient id="cup-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FBF7EF" />
          <stop offset="100%" stopColor="#E2D9C8" />
        </linearGradient>
        {/* Clip path = union of all 5 roll bodies. Mix-in chunks live
            inside this so they never escape the rolls. */}
        <clipPath id="rolls-clip">
          {ROLLS.map((roll, i) => (
            <rect
              key={i}
              x={roll.cx - ROLL_WIDTH / 2}
              y={roll.topY}
              width={ROLL_WIDTH}
              height={ROLL_BOTTOM_Y - roll.topY}
              rx={ROLL_WIDTH / 2}
            />
          ))}
        </clipPath>
      </defs>

      {/* ─── Surface shadow under the cup ────────────────────── */}
      <ellipse
        cx={100}
        cy={212}
        rx={80}
        ry={6}
        fill="rgba(184,21,96,0.15)"
      />

      {/* ─── Paper cup ────────────────────────────────────────── */}
      {/* Slight inward taper from rim (top) to base (bottom). */}
      <path
        d="M 28 130 L 38 206 Q 38 210 42 210 L 158 210 Q 162 210 162 206 L 172 130 Z"
        fill="url(#cup-body)"
        stroke="rgba(0,0,0,0.10)"
        strokeWidth={1.5}
      />
      {/* Cup rim — top oval gives 3D depth. */}
      <ellipse
        cx={100}
        cy={130}
        rx={72}
        ry={9}
        fill="#F4EFE3"
        stroke="rgba(0,0,0,0.10)"
        strokeWidth={1.5}
      />
      {/* Inner cup shadow — slim dark crescent below the rim. */}
      <ellipse
        cx={100}
        cy={134}
        rx={68}
        ry={5}
        fill="rgba(0,0,0,0.12)"
      />

      {/* ─── Roll bodies (cylinders, no top swirl yet) ────────── */}
      {ROLLS.map((roll, i) => {
        const x = roll.cx - ROLL_WIDTH / 2;
        const h = ROLL_BOTTOM_Y - roll.topY;
        // 4 horizontal "scrape lines" suggesting the rolled-up
        // spiral wrapping around the cylinder side. Each one is a
        // shallow concave arc with the deeper end-color stroke at
        // low opacity. Spaced down the cylinder height.
        const scrapeYs = [0.22, 0.42, 0.62, 0.82].map(
          (frac) => roll.topY + frac * h,
        );
        return (
          <g key={`body-${i}-${baseName}`}>
            <motion.rect
              x={x}
              y={roll.topY}
              width={ROLL_WIDTH}
              height={h}
              rx={ROLL_WIDTH / 2}
              fill={`url(#${gradBody})`}
              stroke="rgba(0,0,0,0.08)"
              strokeWidth={1}
              initial={{ scaleY: 0.94, opacity: 0.9 }}
              animate={{ scaleY: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 24 }}
              style={{
                transformOrigin: `${roll.cx}px ${ROLL_BOTTOM_Y}px`,
              }}
            />
            {/* Scrape lines — clipped to this roll's body. Use the
                roll-specific rect as the clip; we wrap each line in a
                <g> with a local clipPath inline so they bend with the
                rounded sides. */}
            <g
              style={{
                clipPath: `inset(0 ${(200 - x - ROLL_WIDTH).toFixed(2)}px 0 ${x.toFixed(2)}px round ${ROLL_WIDTH / 2}px)`,
              }}
            >
              {scrapeYs.map((y, j) => (
                <path
                  key={j}
                  d={`M ${x - 2} ${y} Q ${roll.cx} ${y + 2.2} ${x + ROLL_WIDTH + 2} ${y - 0.8}`}
                  stroke={c2}
                  strokeWidth={0.9}
                  strokeLinecap="round"
                  fill="none"
                  opacity={0.32}
                />
              ))}
            </g>
            {/* Soft side highlight — a faint vertical glow on the
                left of each cylinder to suggest a light source. */}
            <rect
              x={x + 2}
              y={roll.topY + 4}
              width={4}
              height={h - 8}
              rx={2}
              fill="rgba(255,255,255,0.28)"
              style={{ filter: "blur(1.5px)" }}
            />
          </g>
        );
      })}

      {/* ─── Mix-in chunks clipped to the rolls ───────────────── */}
      <g clipPath="url(#rolls-clip)">
        <AnimatePresence>
          {selections.mixIns.flatMap((mixName) =>
            renderMixinChunks(mixName),
          )}
        </AnimatePresence>
      </g>

      {/* ─── Roll tops (swirl discs) ──────────────────────────── */}
      {/* Drawn AFTER mix-ins so the swirl always sits on top of any
          chunks that happened to land near the top edge. */}
      {ROLLS.map((roll, i) => {
        const startAngle = (roll.rotation * Math.PI) / 180;
        return (
          <g key={`top-${i}-${baseName}`}>
            {/* Disc — the roll's flat top. */}
            <motion.ellipse
              cx={roll.cx}
              cy={roll.topY}
              rx={ROLL_WIDTH / 2}
              ry={5.5}
              fill={`url(#${gradTop})`}
              stroke="rgba(0,0,0,0.14)"
              strokeWidth={1}
              initial={{ scaleY: 0.5, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              transition={{
                type: "spring",
                stiffness: 380,
                damping: 22,
                delay: i * 0.04,
              }}
              style={{ transformOrigin: `${roll.cx}px ${roll.topY}px` }}
            />
            {/* Archimedean spiral — 2.5 turns from the disc center
                outward, using the base's deeper c2 stroke. Each roll
                starts at a different angle so the spirals look
                hand-scraped, not stamped. */}
            <motion.path
              d={spiralPath(
                roll.cx,
                roll.topY,
                ROLL_WIDTH / 2 - 1.5,
                5.5 - 0.8,
                2.5,
                startAngle,
              )}
              stroke={c2}
              strokeWidth={0.9}
              strokeLinecap="round"
              fill="none"
              opacity={0.7}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.7 }}
              transition={{
                duration: 0.6,
                ease: [0.22, 1, 0.36, 1],
                delay: 0.1 + i * 0.04,
              }}
            />
            {/* Tiny specular dot — catches the eye and reads as a
                3D high point at the swirl's outer edge. */}
            <ellipse
              cx={roll.cx - ROLL_WIDTH / 4}
              cy={roll.topY - 1.5}
              rx={2.4}
              ry={1.2}
              fill="rgba(255,255,255,0.55)"
              style={{ filter: "blur(0.6px)" }}
            />
          </g>
        );
      })}

      {/* ─── Toppings on top of the rolls ─────────────────────── */}
      <AnimatePresence>
        {selections.toppings.flatMap((toppingName, ti) =>
          renderTopping(toppingName, ti),
        )}
      </AnimatePresence>
    </svg>
  );
}

// ─── Mix-in renderer ─────────────────────────────────────────────────
// Distributes ~12 chunks across the 5 roll bodies. Coordinates are
// generated in the bounding box of all rolls (x: 30→170, y: 56→138)
// and the SVG clipPath above filters out anything outside roll shapes.
function renderMixinChunks(name: string): JSX.Element[] {
  const color = MIXIN_COLOR[name] ?? "#888";
  const seed = hashString(name);
  const CHUNKS = 14;
  const out: JSX.Element[] = [];

  for (let i = 0; i < CHUNKS; i++) {
    const r1 = seededRandom(seed + i * 7);
    const r2 = seededRandom(seed + i * 11 + 13);
    const r3 = seededRandom(seed + i * 13 + 41);

    // Scatter across the rolls' x range and y range. The clipPath
    // discards anything not on a roll.
    const cx = 30 + r1 * 140;
    const cy = ROLL_TOP_Y + 8 + r2 * (ROLL_BOTTOM_Y - ROLL_TOP_Y - 14);
    const rot = r3 * 360;

    out.push(
      <motion.rect
        key={`${name}-${i}`}
        x={cx - 3}
        y={cy - 1.5}
        width={6}
        height={3}
        rx={1}
        fill={color}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.95, rotate: rot }}
        exit={{ scale: 0, opacity: 0 }}
        transition={{
          type: "spring",
          stiffness: 380,
          damping: 18,
          delay: i * 0.02,
        }}
        style={{ transformOrigin: `${cx}px ${cy}px`, transformBox: "fill-box" }}
      />,
    );
  }
  return out;
}

// ─── Topping renderer ────────────────────────────────────────────────
function renderTopping(name: string, ti: number): JSX.Element[] {
  const spec = TOPPING[name];
  if (!spec) return [];

  const out: JSX.Element[] = [];

  if (spec.kind === "drizzle") {
    // Wavy stroke that bounces across the roll tops. Multiple drizzles
    // stack with a small vertical offset so they don't overlap. The
    // path now visits each roll's actual topY so the drizzle dips
    // into the natural valleys created by per-roll height variation.
    const c = spec.colors[0];
    const off = ti * 5 - 6;
    const yAt = (i: number) => ROLLS[i].topY + off;
    const path = `M ${ROLLS[0].cx - 14} ${yAt(0) - 2}
                  Q ${ROLLS[0].cx} ${yAt(0) - 8} ${ROLLS[1].cx} ${yAt(1) + 2}
                  T ${ROLLS[2].cx} ${yAt(2)}
                  T ${ROLLS[3].cx} ${yAt(3) + 2}
                  T ${ROLLS[4].cx + 14} ${yAt(4) - 4}`;
    out.push(
      <motion.path
        key={`drizzle-${name}`}
        d={path}
        stroke={c}
        strokeWidth={5}
        strokeLinecap="round"
        fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 0.92 }}
        exit={{ pathLength: 0, opacity: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      />,
    );
    return out;
  }

  if (spec.kind === "boba") {
    // Translucent spheres scattered across the roll tops.
    const c = spec.colors[0];
    const seed = hashString(`boba-${name}`) + ti * 13;
    for (let i = 0; i < 6; i++) {
      const r1 = seededRandom(seed + i);
      const r2 = seededRandom(seed + i * 3 + 7);
      // Pin each boba to a roll center with small jitter so they
      // visibly sit on the rolls. Each roll has its own topY so the
      // bobas sit at the right height per roll.
      const roll = ROLLS[i % ROLLS.length];
      const cx = roll.cx + (r1 - 0.5) * 12;
      const cy = roll.topY - 4 - r2 * 6;
      out.push(
        <motion.g
          key={`boba-${name}-${i}`}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{
            type: "spring",
            stiffness: 420,
            damping: 18,
            delay: i * 0.04,
          }}
          style={{ transformOrigin: `${cx}px ${cy}px`, transformBox: "fill-box" }}
        >
          <circle cx={cx} cy={cy} r={5} fill={c} opacity={0.92} />
          <circle
            cx={cx - 1.6}
            cy={cy - 1.6}
            r={1.4}
            fill="rgba(255,255,255,0.65)"
          />
        </motion.g>,
      );
    }
    return out;
  }

  // scatter / multi — small pieces draped across the roll tops.
  const colors = spec.colors;
  const seed = hashString(`top-${name}`) + ti * 100;
  const count = 12;
  for (let i = 0; i < count; i++) {
    const r1 = seededRandom(seed + i * 3);
    const r2 = seededRandom(seed + i * 5 + 1);
    // Pin to one of the rolls so pieces sit on the swirls. Uses each
    // roll's actual topY so pieces hug the per-roll heights.
    const roll = ROLLS[i % ROLLS.length];
    const cx = roll.cx + (r1 - 0.5) * (ROLL_WIDTH - 4);
    const cy = roll.topY - 1 - r2 * 8;
    const color = colors[i % colors.length];
    out.push(
      <motion.circle
        key={`scatter-${name}-${i}`}
        cx={cx}
        cy={cy}
        r={spec.kind === "multi" ? 2.8 : 3.6}
        fill={color}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.95 }}
        exit={{ scale: 0, opacity: 0 }}
        transition={{
          type: "spring",
          stiffness: 380,
          damping: 18,
          delay: i * 0.02,
        }}
        style={{ transformOrigin: `${cx}px ${cy}px`, transformBox: "fill-box" }}
      />,
    );
  }
  return out;
}
