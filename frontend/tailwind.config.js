/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // ── Colors ──────────────────────────────────────────────────────────
      colors: {
        "palm-brown": {
          DEFAULT: "#4a3325",
          light:   "#6b4d38",
          dark:    "#2e1f15",
        },
        cream: {
          DEFAULT: "#f5e9d9",
          light:   "#fdf6ee",
          dark:    "#e8d4bb",
        },
        "amber-accent": {
          DEFAULT: "#c68b59",
          light:   "#f0b56e",
          dark:    "#a06a38",
        },
        // Input field backgrounds — chosen for clear contrast against each page's bg
        // Login (cream page):  fields use warm tan so they're distinguishable from the page
        // SignUp (brown page): fields use cream-light (existing token) for the same reason
        "input-tan": "#dfc4a0",  // warm tan: ~1.8:1 vs cream page, palm-brown text ~5:1 against it
      },

      // ── Typography ───────────────────────────────────────────────────────
      fontFamily: {
        serif:   ['"Playfair Display"', "Georgia", "serif"],
        sans:    ['"DM Sans"', "system-ui", "sans-serif"],
        display: ['"Fraunces"', '"Playfair Display"', "Georgia", "serif"],
        poppins: ['"Poppins"', '"Segoe UI"', "sans-serif"],
        menu:    ['"Cormorant Garamond"', '"Playfair Display"', "serif"],
        anton:   ['"Anton"', "Impact", "sans-serif"],   // ultra-condensed display, menu heading
        baloo:   ['"Baloo 2"', '"Poppins"', "sans-serif"],    // rounded display, feature cards
      },

      // ── Type scale (line-height + tracking overrides for headings) ────────
      fontSize: {
        "display-xl": ["clamp(4rem,10vw,9rem)", { lineHeight: "0.95", letterSpacing: "-0.04em" }],
        "display": ["3.5rem",  { lineHeight: "1.1",  letterSpacing: "-0.02em" }],
        "4xl":     ["2.25rem", { lineHeight: "1.15", letterSpacing: "-0.015em" }],
        "3xl":     ["1.875rem",{ lineHeight: "1.2",  letterSpacing: "-0.01em" }],
        "2xl":     ["1.5rem",  { lineHeight: "1.3",  letterSpacing: "-0.005em" }],
        "xl":      ["1.25rem", { lineHeight: "1.4" }],
        "lg":      ["1.125rem",{ lineHeight: "1.5" }],
        "base":    ["1rem",    { lineHeight: "1.6" }],
        "sm":      ["0.875rem",{ lineHeight: "1.6" }],
      },

      // ── Border radius ────────────────────────────────────────────────────
      borderRadius: {
        "btn":  "9999px", // pill for buttons
        "card": "1rem",
      },

      // ── Box shadows ──────────────────────────────────────────────────────
      boxShadow: {
        "card":  "0 4px 24px 0 rgba(74,51,37,0.10)",
        "card-hover": "0 8px 32px 0 rgba(74,51,37,0.18)",
        "glow":  "0 0 48px 12px rgba(198,139,89,0.18)",
      },

      // ── Background gradients ─────────────────────────────────────────────
      backgroundImage: {
        "hero-gradient":
          "radial-gradient(ellipse 80% 60% at 50% 30%, rgba(240,181,110,0.18) 0%, rgba(245,233,217,0) 70%)",
        "hero-dark":
          "radial-gradient(ellipse 70% 60% at 70% 50%, rgba(106,77,56,0.55) 0%, rgba(46,31,21,0) 65%)",
        "btn-gradient":
          "linear-gradient(135deg, #f0b56e 0%, #c68b59 60%, #a06a38 100%)",
        "wave-gradient":
          "linear-gradient(90deg, #f0b56e 0%, #c68b59 50%, #4a3325 100%)",
      },
    },
  },
  plugins: [],
}
