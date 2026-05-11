/**
 * Single source of truth for the Yolo Rollo brand.
 * Change anything in here and it will propagate through the whole app.
 */
export const brand = {
  name: "Yolo Rollo",
  fullName: "Yolo Rollo Ice Cream",
  tagline: "Fresh. Fun. Rolled.",
  subTagline: "You choose. We roll.",
  location: "Wolfchase, Memphis TN",

  // Colors taken from the Yolo Rollo poster.
  // Tailwind config consumes these via CSS variables (see index.css).
  colors: {
    pink: "#EC1E79",      // primary accent — buttons, headings highlight
    pinkSoft: "#FCE4EC",  // page backgrounds, cards
    green: "#A6CE39",     // secondary accent — "Rolled" green, success states
    orange: "#F58220",    // tertiary — used on "ICE CREAM" wordmark
    ink: "#1A1A1A",       // body text
    cream: "#FFF8F2",     // soft white for cards
  },

  // The base URL the QR code on the TV points at.
  // In production, this should be the deployed Vercel URL.
  // Override at build time with VITE_PUBLIC_URL.
  publicUrl: import.meta.env.VITE_PUBLIC_URL ?? "http://localhost:5173",

  // Optional: path to logo asset placed in /public.
  // Drop your logo at /public/logo.png and this will pick it up.
  logoSrc: "/logo.png",

  // Memphis local + state sales tax (2025): 9.75%. Used only for the
  // cart-side estimate. Clover applies the merchant's configured tax at
  // Hosted Checkout, so the final charge is authoritative regardless.
  taxRate: 0.0975,
} as const;

export type Brand = typeof brand;
