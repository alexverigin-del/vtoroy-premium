import type { Config } from "tailwindcss";

// Tokens approximate the current "Refero Apple" static style:
// calm light surfaces, near-black ink, a single confident blue accent,
// hairline borders, generous radii and soft product shadows.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#1d1d1f",
        muted: "#6e6e73",
        surface: "#f5f5f7",
        white: "#ffffff",
        accent: "#0071e3",
        hairline: "rgba(210,210,215,0.78)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
      borderRadius: {
        card: "20px",
        img: "24px",
        pill: "980px",
      },
      boxShadow: {
        product: "0 30px 60px -30px rgba(0,0,0,0.28)",
        soft: "0 8px 24px -12px rgba(0,0,0,0.18)",
      },
      maxWidth: {
        content: "1120px",
      },
    },
  },
  plugins: [],
};

export default config;
