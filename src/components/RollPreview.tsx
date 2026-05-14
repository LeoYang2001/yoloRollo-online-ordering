import { AnimatePresence, motion } from "framer-motion";

/**
 * RollPreview — live SVG composition of the ice cream the customer is
 * configuring. Updates as the user picks Base / Mix-in / Topping:
 *
 *   - Base   → scoop's radial-gradient colors morph
 *   - Mix-in → small colored chunks appear scattered inside the scoop
 *              (each ingredient has its own color, deterministic
 *               positions seeded from the ingredient name so the same
 *               choice always looks the same)
 *   - Topping → distinct rendering per topping family:
 *       drizzle  — wavy stroke across the top (syrups, condensed milk)
 *       scatter  — small fruit/cookie/M&M pieces on the top
 *       boba     — translucent spheres
 *       multi    — multi-color scatter (M&Ms, Gummy Bears)
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

// ─── Component ───────────────────────────────────────────────────────
export function RollPreview({ selections, size = 180, className }: Props) {
  const baseName = selections.base ?? "Vanilla";
  const [c1, c2] = BASE_GRADIENT[baseName] ?? BASE_GRADIENT.Vanilla;
  // Gradient id keyed by base so the radial defs swap when base changes.
  const gradId = `roll-grad-${baseName.replace(/\s+/g, "-")}`;

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      aria-label={`Ice cream preview: ${baseName} base`}
    >
      <defs>
        <radialGradient id={gradId} cx="30%" cy="30%">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </radialGradient>
        {/* Clip so mix-in chunks never poke outside the scoop. */}
        <clipPath id="roll-clip">
          <circle cx={100} cy={100} r={80} />
        </clipPath>
      </defs>

      {/* Soft drop shadow under the scoop */}
      <ellipse
        cx={100}
        cy={186}
        rx={70}
        ry={6}
        fill="rgba(184,21,96,0.18)"
      />

      {/* Base scoop — animates fill via key on the motion.circle so the
          gradient swaps cleanly when the base changes. */}
      <motion.circle
        key={`base-${baseName}`}
        cx={100}
        cy={100}
        r={80}
        fill={`url(#${gradId})`}
        initial={{ scale: 0.98, opacity: 0.85 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 22 }}
      />

      {/* Inner shadow + whipped highlight for some dimension */}
      <circle
        cx={100}
        cy={100}
        r={80}
        fill="none"
        stroke="rgba(0,0,0,0.08)"
        strokeWidth={2}
      />
      <ellipse
        cx={72}
        cy={72}
        rx={28}
        ry={14}
        fill="rgba(255,255,255,0.55)"
        style={{ filter: "blur(2px)" }}
      />

      {/* Mix-in chunks — clipped to the scoop */}
      <g clipPath="url(#roll-clip)">
        <AnimatePresence>
          {selections.mixIns.flatMap((mixName) =>
            renderMixinChunks(mixName),
          )}
        </AnimatePresence>
      </g>

      {/* Toppings on top */}
      <AnimatePresence>
        {selections.toppings.flatMap((toppingName, ti) =>
          renderTopping(toppingName, ti),
        )}
      </AnimatePresence>
    </svg>
  );
}

// ─── Mix-in renderer ─────────────────────────────────────────────────
function renderMixinChunks(name: string): JSX.Element[] {
  const color = MIXIN_COLOR[name] ?? "#888";
  const seed = hashString(name);
  const CHUNKS = 9;
  const out: JSX.Element[] = [];

  for (let i = 0; i < CHUNKS; i++) {
    const r1 = seededRandom(seed + i * 7);
    const r2 = seededRandom(seed + i * 11 + 13);
    const r3 = seededRandom(seed + i * 13 + 41);

    // Polar coords inside the scoop — keep a margin from the edge.
    const angle = r1 * Math.PI * 2;
    const radius = r2 * 58 + 6; // 6 → 64 from center
    const cx = 100 + Math.cos(angle) * radius;
    const cy = 100 + Math.sin(angle) * radius;
    const rot = r3 * 360;

    // Chunk shape: rounded rectangle so it reads as a "piece" of something
    out.push(
      <motion.rect
        key={`${name}-${i}`}
        x={cx - 4.5}
        y={cy - 2.5}
        width={9}
        height={5}
        rx={1.5}
        fill={color}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.95, rotate: rot }}
        exit={{ scale: 0, opacity: 0 }}
        transition={{
          type: "spring",
          stiffness: 380,
          damping: 18,
          delay: i * 0.025,
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
    // Wavy stroke across the top. Multiple drizzles stack with a
    // vertical offset so they don't overlap.
    const c = spec.colors[0];
    const yOff = 50 + ti * 6;
    const path = `M 28 ${yOff} Q 56 ${yOff - 18}, 90 ${yOff + 4} T 172 ${yOff - 2}`;
    out.push(
      <motion.path
        key={`drizzle-${name}`}
        d={path}
        stroke={c}
        strokeWidth={6}
        strokeLinecap="round"
        fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 0.9 }}
        exit={{ pathLength: 0, opacity: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      />,
    );
    return out;
  }

  if (spec.kind === "boba") {
    // Translucent spheres lined up on top.
    const c = spec.colors[0];
    const seed = hashString(`boba-${name}`) + ti * 13;
    for (let i = 0; i < 6; i++) {
      const r1 = seededRandom(seed + i);
      const cx = 38 + i * 22 + (r1 - 0.5) * 5;
      const cy = 48 + r1 * 16;
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
          <circle cx={cx} cy={cy} r={6} fill={c} opacity={0.92} />
          <circle cx={cx - 2} cy={cy - 2} r={1.6} fill="rgba(255,255,255,0.6)" />
        </motion.g>,
      );
    }
    return out;
  }

  // scatter / multi — small pieces on the top hemisphere.
  const colors = spec.colors;
  const seed = hashString(`top-${name}`) + ti * 100;
  const count = 8;
  for (let i = 0; i < count; i++) {
    const r1 = seededRandom(seed + i * 3);
    const r2 = seededRandom(seed + i * 5 + 1);
    // Place on top half of the scoop. x: 36→164, y: 36→78.
    const cx = 36 + r1 * 128;
    const cy = 36 + r2 * 42;
    const color = colors[i % colors.length];
    out.push(
      <motion.circle
        key={`scatter-${name}-${i}`}
        cx={cx}
        cy={cy}
        r={spec.kind === "multi" ? 3.5 : 4.5}
        fill={color}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.95 }}
        exit={{ scale: 0, opacity: 0 }}
        transition={{
          type: "spring",
          stiffness: 380,
          damping: 18,
          delay: i * 0.025,
        }}
        style={{ transformOrigin: `${cx}px ${cy}px`, transformBox: "fill-box" }}
      />,
    );
  }
  return out;
}
