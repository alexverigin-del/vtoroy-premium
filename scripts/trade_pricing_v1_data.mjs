#!/usr/bin/env node

export const TRADE_PRICING_VERSION = "trade-mvp-2026-08-29-draft";
export const TRADE_PRICING_REFERENCE_URL = "https://re-store.ru/promo/trade-in/";
export const TRADE_PRICING_REFERENCE_DATE = "2026-08-29";

export const tradePricingConfigs = [
  {
    modelSlug: "iphone-13-pro",
    storage: "128 ГБ",
    baseMin: 18_000,
    baseMax: 20_000,
    referenceMax: 20_100,
    sort: 10,
  },
  {
    modelSlug: "iphone-13-pro",
    storage: "256 ГБ",
    baseMin: 19_500,
    baseMax: 22_000,
    referenceMax: 22_300,
    sort: 20,
  },
  {
    modelSlug: "iphone-13-pro",
    storage: "512 ГБ",
    baseMin: 22_000,
    baseMax: 24_500,
    referenceMax: 24_800,
    sort: 30,
  },
  {
    modelSlug: "iphone-13-pro",
    storage: "1 ТБ",
    baseMin: 23_500,
    baseMax: 26_500,
    referenceMax: 26_900,
    sort: 40,
  },
  {
    modelSlug: "iphone-14-pro",
    storage: "128 ГБ",
    baseMin: 23_000,
    baseMax: 26_000,
    referenceMax: 26_100,
    sort: 110,
  },
  {
    modelSlug: "iphone-14-pro",
    storage: "256 ГБ",
    baseMin: 26_500,
    baseMax: 29_500,
    referenceMax: 29_900,
    sort: 120,
  },
  {
    modelSlug: "iphone-14-pro",
    storage: "512 ГБ",
    baseMin: 29_500,
    baseMax: 33_000,
    referenceMax: 33_400,
    sort: 130,
  },
  {
    modelSlug: "iphone-14-pro",
    storage: "1 ТБ",
    baseMin: 33_500,
    baseMax: 37_500,
    referenceMax: 37_900,
    sort: 140,
  },
  {
    modelSlug: "iphone-14-pro-max",
    storage: "128 ГБ",
    baseMin: 27_000,
    baseMax: 30_000,
    referenceMax: 30_200,
    sort: 210,
  },
  {
    modelSlug: "iphone-14-pro-max",
    storage: "256 ГБ",
    baseMin: 30_500,
    baseMax: 34_000,
    referenceMax: 34_400,
    sort: 220,
  },
  {
    modelSlug: "iphone-14-pro-max",
    storage: "512 ГБ",
    baseMin: 34_000,
    baseMax: 38_000,
    referenceMax: 38_000,
    sort: 230,
  },
  {
    modelSlug: "iphone-14-pro-max",
    storage: "1 ТБ",
    baseMin: 37_000,
    baseMax: 41_500,
    referenceMax: 41_900,
    sort: 240,
  },
  {
    modelSlug: "iphone-16-pro",
    storage: "128 ГБ",
    baseMin: 40_000,
    baseMax: 44_500,
    referenceMax: 44_800,
    sort: 310,
  },
  {
    modelSlug: "iphone-16-pro",
    storage: "256 ГБ",
    baseMin: 42_500,
    baseMax: 47_500,
    referenceMax: 47_800,
    sort: 320,
  },
  {
    modelSlug: "iphone-16-pro",
    storage: "512 ГБ",
    baseMin: 45_500,
    baseMax: 51_000,
    referenceMax: 51_400,
    sort: 330,
  },
  {
    modelSlug: "iphone-16-pro",
    storage: "1 ТБ",
    baseMin: 53_500,
    baseMax: 59_500,
    referenceMax: 59_900,
    sort: 340,
  },
  {
    modelSlug: "iphone-16-pro-max",
    storage: "256 ГБ",
    baseMin: 48_000,
    baseMax: 53_500,
    referenceMax: 53_800,
    sort: 410,
  },
  {
    modelSlug: "iphone-16-pro-max",
    storage: "512 ГБ",
    baseMin: 53_500,
    baseMax: 59_500,
    referenceMax: 59_800,
    sort: 420,
  },
  {
    modelSlug: "iphone-16-pro-max",
    storage: "1 ТБ",
    baseMin: 67_000,
    baseMax: 74_500,
    referenceMax: 74_900,
    sort: 430,
  },
];

const questions = {
  powers_on: [
    "Включается и загружается?",
    "Устройство должно включаться и доходить до рабочего экрана.",
  ],
  display_works: [
    "Экран и сенсор работают?",
    "Проверьте изображение и сенсор по всей площади экрана.",
  ],
  hardware_works: [
    "Камеры, кнопки и разъёмы работают?",
    "Проверьте камеры, динамики, микрофоны, кнопки и разъём зарядки.",
  ],
  has_damage: [
    "Есть трещины, сколы или сильные царапины?",
    "Обычные следы использования допустимы; существенные повреждения снижают диапазон.",
  ],
  was_repaired: [
    "Был ремонт или замена деталей?",
    "Неоригинальные или неизвестные детали требуют диагностики менеджером.",
  ],
  battery_risk: [
    "Аккумулятор вздут, греется или повреждён?",
    "Не заряжайте и не используйте устройство с признаками повреждения аккумулятора.",
  ],
  account_removed: [
    "Устройство отвязано от аккаунта?",
    "Перед передачей нужно выйти из Apple ID и отключить «Локатор».",
  ],
};

function rule(questionKey, optionValue, optionLabel, overrides = {}) {
  const [questionLabel, questionHelp] = questions[questionKey];
  return {
    questionKey,
    questionLabel,
    questionHelp,
    optionValue,
    optionLabel,
    deltaMin: 0,
    deltaMax: 0,
    factorLabel: null,
    factorType: "neutral",
    manualEvaluation: false,
    safetyStop: false,
    ...overrides,
  };
}

export const tradeConditionRules = [
  rule("powers_on", "yes", "Да", { factorLabel: "Устройство включается", factorType: "positive" }),
  rule("powers_on", "no", "Нет", {
    factorLabel: "Устройство не включается",
    factorType: "risk",
    manualEvaluation: true,
  }),
  rule("powers_on", "unknown", "Не знаю", {
    factorLabel: "Работоспособность не подтверждена",
    factorType: "risk",
    manualEvaluation: true,
  }),
  rule("display_works", "yes", "Да", {
    factorLabel: "Экран и сенсор работают",
    factorType: "positive",
  }),
  rule("display_works", "no", "Нет", {
    factorLabel: "Есть проблема с экраном или сенсором",
    factorType: "risk",
    manualEvaluation: true,
  }),
  rule("display_works", "unknown", "Не знаю", {
    factorLabel: "Экран и сенсор требуют проверки",
    factorType: "risk",
    manualEvaluation: true,
  }),
  rule("hardware_works", "yes", "Да", {
    factorLabel: "Основные функции работают",
    factorType: "positive",
  }),
  rule("hardware_works", "no", "Нет", {
    factorLabel: "Есть неисправная функция",
    factorType: "risk",
    manualEvaluation: true,
  }),
  rule("hardware_works", "unknown", "Не знаю", {
    factorLabel: "Функции требуют диагностики",
    factorType: "risk",
    manualEvaluation: true,
  }),
  rule("has_damage", "yes", "Да", {
    deltaMin: -7_000,
    deltaMax: -4_000,
    factorLabel: "Есть заметные повреждения корпуса",
    factorType: "risk",
  }),
  rule("has_damage", "no", "Нет", {
    factorLabel: "Нет существенных повреждений",
    factorType: "positive",
  }),
  rule("has_damage", "unknown", "Не знаю", {
    deltaMin: -4_000,
    deltaMax: -2_000,
    factorLabel: "Состояние корпуса требует проверки",
    factorType: "risk",
  }),
  rule("was_repaired", "yes", "Да", {
    factorLabel: "Был ремонт или замена деталей",
    factorType: "risk",
    manualEvaluation: true,
  }),
  rule("was_repaired", "no", "Нет", { factorLabel: "Ремонт не заявлен", factorType: "positive" }),
  rule("was_repaired", "unknown", "Не знаю", {
    factorLabel: "История ремонта неизвестна",
    factorType: "risk",
    manualEvaluation: true,
  }),
  rule("battery_risk", "yes", "Да", {
    factorLabel: "Есть признаки повреждения аккумулятора",
    factorType: "risk",
    safetyStop: true,
  }),
  rule("battery_risk", "no", "Нет", {
    factorLabel: "Нет признаков опасного состояния аккумулятора",
    factorType: "positive",
  }),
  rule("battery_risk", "unknown", "Не знаю", {
    factorLabel: "Аккумулятор требует безопасной проверки",
    factorType: "risk",
    manualEvaluation: true,
  }),
  rule("account_removed", "yes", "Да", {
    factorLabel: "Устройство отвязано от аккаунта",
    factorType: "positive",
  }),
  rule("account_removed", "no", "Нет", {
    factorLabel: "Перед передачей нужно выйти из аккаунта",
    factorType: "risk",
  }),
  rule("account_removed", "unknown", "Не знаю", {
    factorLabel: "Нужно проверить отвязку от аккаунта",
    factorType: "risk",
  }),
].map((item, index) => ({
  ...item,
  questionSort: (Math.floor(index / 3) + 1) * 10,
  optionSort: ((index % 3) + 1) * 10,
}));
