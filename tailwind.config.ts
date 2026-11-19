import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        surface2: v("surface2"),
        ink: v("text"),
        muted: v("muted"),
        line: v("line"),
        primary: v("primary"),
        accent: v("accent"),
        gold: v("gold"),
        softblue: v("softblue"),
        success: v("success"),
        danger: v("danger"),
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ['"Plus Jakarta Sans"', "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: { xl2: "1.25rem" },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / 0.08), 0 8px 24px -12px rgb(0 0 0 / 0.35)",
        glow: "0 0 0 1px rgb(var(--primary) / 0.35), 0 8px 32px -8px rgb(var(--primary) / 0.45)",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        grow: { "0%": { width: "0%" } },
      },
      animation: {
        "fade-up": "fadeUp 0.45s ease-out both",
        grow: "grow 0.9s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
