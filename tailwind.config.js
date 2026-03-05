/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "neon-green": "#00ff88",
        "neon-blue": "#00d4ff",
        "neon-purple": "#b300ff",
        "neon-orange": "#ff6b00",
        "dark-bg": "#0a0e1a",
        "dark-card": "#111827",
        "dark-border": "#1f2937",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "flow": "flow 2s linear infinite",
      },
      keyframes: {
        flow: {
          "0%": { strokeDashoffset: "100" },
          "100%": { strokeDashoffset: "0" },
        },
      },
    },
  },
  plugins: [],
};
