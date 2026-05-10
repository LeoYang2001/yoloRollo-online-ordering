/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Yolo Rollo brand palette. Consumed everywhere via Tailwind classes.
        rollo: {
          pink: "#EC1E79",
          "pink-soft": "#FCE4EC",
          green: "#A6CE39",
          orange: "#F58220",
          ink: "#1A1A1A",
          cream: "#FFF8F2",
        },
      },
      fontFamily: {
        // Hand-drawn / friendly display font, system fallback for body
        display: ["'Fredoka'", "'Baloo 2'", "system-ui", "sans-serif"],
        body: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      boxShadow: {
        rollo: "0 8px 24px -8px rgba(236, 30, 121, 0.35)",
      },
    },
  },
  plugins: [],
};
