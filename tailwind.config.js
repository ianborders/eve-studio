/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/renderer/index.html", "./src/renderer/src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // base surfaces (dark, warm-neutral, layered by elevation)
        bg: "#0a0a0c",
        panel: "#141518",
        surface: "#141518",
        elevated: "#1c1e23",
        hover: "#212329",
        border: "#26282e",
        "border-strong": "#34373f",
        // text
        text: "#ececee",
        muted: "#9a9aa5",
        faint: "#6b6b76",
        // brand + semantic
        accent: "#3ecf8e",
        "accent-dim": "#1f6f4d",
        warn: "#f5a623",
        danger: "#f2555a",
        info: "#5b9dff",
        violet: "#a78bfa",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Inter",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SF Mono",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "monospace",
        ],
      },
      fontSize: {
        "2xs": ["10px", { lineHeight: "14px" }],
      },
      borderRadius: {
        lg: "10px",
        xl: "14px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.02)",
        pop: "0 8px 30px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)",
        glow: "0 0 0 1px rgba(62,207,142,0.25), 0 0 20px rgba(62,207,142,0.12)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(62,207,142,0.5)" },
          "70%": { boxShadow: "0 0 0 5px rgba(62,207,142,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(62,207,142,0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "slide-up": "slide-up 0.22s cubic-bezier(0.2,0.8,0.2,1)",
        "pulse-ring": "pulse-ring 1.8s ease-out infinite",
      },
    },
  },
  plugins: [],
};
