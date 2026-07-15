/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/renderer/index.html", "./src/renderer/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // light, Vercel/Geist surfaces
        bg: "#ffffff",
        panel: "#ffffff",
        surface: "#ffffff",
        subtle: "#fafafa",
        elevated: "#ffffff",
        hover: "#f2f2f2",
        border: "#eaeaea",
        "border-strong": "#d4d4d4",
        // text
        text: "#000000",
        muted: "#666666",
        faint: "#8f8f8f",
        // brand + semantic (Geist)
        accent: "#0070f3",
        success: "#16a34a",
        warn: "#f5a623",
        danger: "#e5484d",
        info: "#0070f3",
        violet: "#7c3aed",
      },
      fontFamily: {
        sans: [
          "Geist Variable",
          "-apple-system",
          "BlinkMacSystemFont",
          "Inter",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "Geist Mono Variable",
          "ui-monospace",
          "SF Mono",
          "Menlo",
          "monospace",
        ],
        spacemono: ['"Space Mono"', "ui-monospace", "monospace"],
      },
      fontSize: {
        "2xs": ["11px", { lineHeight: "15px" }],
      },
      borderRadius: {
        lg: "8px",
        xl: "12px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.04)",
        pop: "0 8px 30px rgba(0,0,0,0.12)",
        glow: "0 0 0 4px rgba(0,112,243,0.12)",
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
          "0%": { boxShadow: "0 0 0 0 rgba(22,163,74,0.45)" },
          "70%": { boxShadow: "0 0 0 5px rgba(22,163,74,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(22,163,74,0)" },
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
