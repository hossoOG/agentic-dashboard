/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        /* ── Accent (single primary) ── */
        accent: "oklch(72% 0.14 190)",
        "accent-light": "oklch(85% 0.08 190)",
        "accent-dark": "oklch(50% 0.12 190)",
        "accent-subtle": "oklch(25% 0.04 190)",

        /* ── Semantic ── */
        success: "oklch(72% 0.16 155)",
        error: "oklch(62% 0.22 25)",
        warning: "oklch(75% 0.14 70)",
        info: "oklch(68% 0.12 250)",

        /* ── Tinted Neutrals (cool blue undertone) ── */
        neutral: {
          50:  "oklch(95% 0.008 250)",
          100: "oklch(90% 0.008 250)",
          200: "oklch(80% 0.008 250)",
          300: "oklch(70% 0.01 250)",
          400: "oklch(55% 0.01 250)",
          500: "oklch(45% 0.01 250)",
          600: "oklch(35% 0.01 250)",
          700: "oklch(26% 0.012 250)",
          800: "oklch(20% 0.012 250)",
          900: "oklch(15% 0.012 250)",
          950: "oklch(11% 0.012 250)",
        },

        /* ── Surfaces ── */
        "surface-base":    "oklch(11% 0.012 250)",
        "surface-raised":  "oklch(15% 0.012 250)",
        "surface-overlay": "oklch(20% 0.012 250)",

        /* ── Legacy aliases (for gradual migration) ── */
        "neon-green":  "oklch(72% 0.16 155)",
        "neon-blue":   "oklch(72% 0.14 190)",
        "neon-purple":  "oklch(60% 0.20 300)",
        "neon-orange":  "oklch(75% 0.14 70)",
        "dark-bg":     "oklch(11% 0.012 250)",
        "dark-card":   "oklch(15% 0.012 250)",
        "dark-border": "oklch(26% 0.012 250)",
      },
      fontFamily: {
        display: ["Space Grotesk", "Segoe UI", "system-ui", "sans-serif"],
        body:    ["Instrument Sans", "Segoe UI", "system-ui", "sans-serif"],
        mono:    ["JetBrains Mono", "Fira Code", "Consolas", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "flow": "flow 2s linear infinite",
        "status-pulse": "status-pulse 2s cubic-bezier(0.65, 0, 0.35, 1) infinite",
        "spin-slow": "spin 1.5s linear infinite",
      },
      keyframes: {
        flow: {
          "0%": { strokeDashoffset: "100" },
          "100%": { strokeDashoffset: "0" },
        },
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        "in-expo":  "cubic-bezier(0.7, 0, 0.84, 0)",
      },
    },
  },
  plugins: [],
};
