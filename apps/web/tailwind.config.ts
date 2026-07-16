import type { Config } from "tailwindcss";

/**
 * Tokens de design ARGOS — extraits 1:1 de l'export du design system
 * « Amin Design / Kanban RDIA » (design_handoff_argos/_ds).
 *
 * Les couleurs sont déclarées au format canal `rgb(r g b / <alpha-value>)` pour
 * que les modificateurs d'opacité Tailwind (ex. `bg-or-500/15`, `text-rdia-300`) fonctionnent.
 */
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Vert militaire — surfaces, texte, fonds
        rdia: {
          50: "rgb(245 240 232 / <alpha-value>)",
          100: "rgb(232 224 208 / <alpha-value>)",
          200: "rgb(184 201 184 / <alpha-value>)",
          300: "rgb(74 103 65 / <alpha-value>)",
          400: "rgb(45 122 74 / <alpha-value>)",
          500: "rgb(45 90 63 / <alpha-value>)",
          600: "rgb(27 77 46 / <alpha-value>)",
          700: "rgb(22 61 36 / <alpha-value>)",
          800: "rgb(15 45 26 / <alpha-value>)",
          900: "rgb(15 31 20 / <alpha-value>)",
        },
        // Or — actions, état actif, jauges
        or: {
          50: "rgb(250 245 226 / <alpha-value>)",
          100: "rgb(245 235 196 / <alpha-value>)",
          200: "rgb(234 215 154 / <alpha-value>)",
          300: "rgb(232 201 106 / <alpha-value>)",
          400: "rgb(212 180 78 / <alpha-value>)",
          500: "rgb(201 168 76 / <alpha-value>)",
          600: "rgb(168 139 61 / <alpha-value>)",
          700: "rgb(126 106 50 / <alpha-value>)",
          800: "rgb(92 78 40 / <alpha-value>)",
          900: "rgb(61 52 32 / <alpha-value>)",
        },
        // Danger — rouge
        danger: {
          50: "rgb(254 242 242 / <alpha-value>)",
          100: "rgb(254 226 226 / <alpha-value>)",
          400: "rgb(248 113 113 / <alpha-value>)",
          500: "rgb(239 68 68 / <alpha-value>)",
          600: "rgb(220 38 38 / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        arabe: ["Amiri", "Inter", "serif"],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "cgc-ping": {
          "0%": { transform: "scale(1)", opacity: "0.7" },
          "100%": { transform: "scale(3.2)", opacity: "0" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.3s ease-out both",
        "fade-in-up": "fade-in-up 0.3s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
