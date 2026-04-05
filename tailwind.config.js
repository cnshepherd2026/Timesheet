/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Syne'", "sans-serif"],
        body: ["'DM Sans'", "sans-serif"],
        mono: ["'DM Mono'", "monospace"],
      },
      colors: {
        ink: "var(--color-ink)",
        paper: "var(--color-paper)",
        accent: "#E8572A",
        muted: "var(--color-muted)",
        border: "var(--color-border)",
        card: "var(--color-card)",
      },
    },
  },
  plugins: [],
};
