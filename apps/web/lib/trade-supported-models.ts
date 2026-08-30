export const TRADE_SUPPORTED_MODEL_SLUGS = [
  "iphone-13-pro",
  "iphone-14-pro",
  "iphone-14-pro-max",
  "iphone-15-pro",
  "iphone-16-pro",
  "iphone-16-pro-max",
  "samsung-galaxy-s22-ultra",
  "samsung-galaxy-s23-ultra",
  "samsung-galaxy-s24-ultra",
] as const;

export const TRADE_SUPPORTED_MODELS = new Set<string>(TRADE_SUPPORTED_MODEL_SLUGS);
