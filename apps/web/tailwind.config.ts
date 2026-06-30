import type { Config } from "tailwindcss";

const { plugins, themeExtend } = require("../../tailwind.shared.cjs");

// Tokens approximate the current "Refero Apple" static style:
// calm light surfaces, near-black ink, a single confident blue accent,
// hairline borders, generous radii and soft product shadows.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: themeExtend,
  },
  plugins,
};

export default config;
