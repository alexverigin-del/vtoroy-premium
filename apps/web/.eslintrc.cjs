const path = require("node:path");

const tailwindConfig = path.resolve(__dirname, "../../tailwind.config.eslint.cjs");
const tailwindOptions = {
  callees: ["cn"],
  config: tailwindConfig,
};

module.exports = {
  extends: ["next/core-web-vitals", "next/typescript"],
  plugins: ["tailwindcss"],
  settings: {
    tailwindcss: tailwindOptions,
  },
  rules: {
    "tailwindcss/classnames-order": ["warn", tailwindOptions],
    "tailwindcss/no-contradicting-classname": ["warn", tailwindOptions],
    "tailwindcss/no-custom-classname": [
      "warn",
      {
        ...tailwindOptions,
        whitelist: [
          "btn-pill",
          "card",
          "focus-ring",
          "aspect-blog-cover",
          "leading-display",
          "leading-brand-caption",
        ],
      },
    ],
  },
};
