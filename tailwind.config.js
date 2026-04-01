/** @type {import('tailwindcss').Config} */
module.exports = {
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
        ink: "#0D0D0D",
        paper: "#F5F2EB",
        accent: "#E8572A",
        muted: "#8C8680",
        border: "#D9D4CC",
        card: "#FDFAF5",
      },
    },
  },
  plugins: [],
};
