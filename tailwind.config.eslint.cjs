/** @type {import('tailwindcss').Config} */
const { plugins, themeExtend } = require("./tailwind.shared.cjs");

module.exports = {
  content: [
    "./apps/web/app/**/*.{ts,tsx}",
    "./apps/web/components/**/*.{ts,tsx}",
    "./apps/web/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: themeExtend,
  },
  plugins,
};
