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
        action: "#0071e3",
        "action-blue": "#0071e3",
        "link-blue": "#0066cc",
        "signal-blue": "#2997ff",
        carbon: "#1d1d1f",
        ink: "#1d1d1f",
        frost: "#f5f5f7",
        surface: "#f5f5f7",
        ice: "#f4f8fb",
        smoke: "#333333",
        graphite: "#474747",
        ash: "#707070",
        muted: "#707070",
        mist: "#858585",
        onyx: "#000000",
        pebble: "#e2e2e5",
        white: "#ffffff",
        accent: "#0071e3",
        hairline: "#d2d2d7",
        success: "#237a3b",
        warning: "#946000",
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
        card: "8px",
        img: "8px",
        input: "8px",
        pill: "980px",
      },
      boxShadow: {
        product: "rgba(0, 0, 0, 0.18) 0 26px 90px",
        soft: "rgba(0, 0, 0, 0.08) 0 18px 55px",
        focus: "0 0 0 2px rgba(0,113,227,0.14)",
      },
      maxWidth: {
        content: "1120px",
      },
    },
  },
  plugins: [],
};

export default config;
