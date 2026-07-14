/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/renderer/index.html", "./src/renderer/src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "#0b0d10",
        panel: "#12151a",
        border: "#232a33",
        muted: "#8b95a1",
        accent: "#00c46a",
      },
    },
  },
  plugins: [],
};
