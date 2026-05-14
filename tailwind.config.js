/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ─── Yolo Rollo "Sweet Sundae" palette ──────────────────────
        // Soft pink surfaces, photo-forward white cards, hot magenta
        // primary, dusty rose accents. Taken from the Yolo Rollo poster.
        rollo: {
          // Surfaces
          paper: "#FBE4ED",
          "paper-soft": "#FFF1F5",
          "paper-warm": "#FFF5E8",
          card: "#FFFFFF",

          // Inks
          ink: "#2A1722",
          "ink-soft": "rgba(42,23,34,0.62)",
          "ink-muted": "rgba(42,23,34,0.40)",
          "ink-line": "rgba(42,23,34,0.10)",

          // Pink family (primary)
          pink: "#EC1E79",
          "pink-deep": "#B81560",
          "pink-soft": "#FCD3E1",
          "pink-rose": "#F5A6BD",

          // Rose family (hero card accents)
          rose: "#B85F76",
          "rose-deep": "#7E3F52",

          // Secondary accents
          green: "#A6CE39",
          "green-deep": "#6A8B19",
          orange: "#F58220",
          butter: "#FCD86F",
          "butter-deep": "#F5C84C",
        },
      },
      fontFamily: {
        // Body + display: Plus Jakarta Sans (400-800)
        display: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
        body: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
        // Brand wordmark only
        brand: ['"Bagel Fat One"', "system-ui", "sans-serif"],
        // Meta labels, receipt numbers
        mono: ['"Geist Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        // Soft pink card shadow — used on product tiles, totals, etc.
        "rollo-card": "0 6px 18px -10px rgba(184,21,96,0.18)",
        // Pink primary button glow
        "rollo-pink": "0 6px 18px -4px rgba(236,30,121,0.45)",
        // Floating cart FAB — slightly bigger glow
        "rollo-fab": "0 14px 30px -6px rgba(236,30,121,0.55)",
        // Rose pickup card
        "rollo-rose": "0 12px 24px -10px rgba(126,63,82,0.45)",
        // Modal sheet top-edge
        "rollo-modal": "0 -10px 40px rgba(0,0,0,0.18)",
        // Small inset for inputs/cards
        "rollo-soft": "0 2px 6px rgba(42,23,34,0.06)",
      },
      borderRadius: {
        // Specific design tokens for the card / hero / ticket radii.
        "rollo-card": "22px",
        "rollo-hero": "26px",
        "rollo-ticket": "28px",
      },
    },
  },
  plugins: [],
};
