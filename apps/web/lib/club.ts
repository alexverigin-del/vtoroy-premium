import { cache } from "react";
import type {
  ClubOffer,
  ClubPageSettings,
  ClubPlan,
  ClubRuleItem,
  ProductBrand,
  ProductCardData,
  ProductCategory,
} from "@vtoroy/shared";

import { CLUB_CACHE_TAG } from "@/lib/cache-tags";
import { directusAssetUrl, directusGet } from "@/lib/directus";

type Row = Record<string, unknown>;

const PLAN_FIELDS = [
  "id",
  "slug",
  "status",
  "name",
  "badge",
  "summary",
  "min_term_months",
  "monthly_note",
  "features",
  "is_featured",
  "is_future",
  "sort",
].join(",");

const OFFER_FIELDS = [
  "id",
  "status",
  "offer_status",
  "term_months",
  "monthly_from",
  "monthly_text",
  "terms_text",
  "badge",
  "cta_label",
  "sort",
  "plan." + PLAN_FIELDS.replaceAll(",", ",plan."),
  "product.id",
  "product.sku",
  "product.product_type",
  "product.condition",
  "product.status",
  "product.stock_status",
  "product.stock_quantity",
  "product.sort",
  "product.title",
  "product.model",
  "product.color",
  "product.price",
  "product.price_text",
  "product.warranty_text",
  "product.listing_alt",
  "product.updated_at",
  "product.listing_file.id",
  "product.brand.id",
  "product.brand.slug",
  "product.brand.name",
  "product.category.id",
  "product.category.slug",
  "product.category.name",
  "product.category.catalog_section",
  "product.device_model.slug",
  "product.device_details.grade",
  "product.device_details.battery_text",
  "product.device_details.diagnostic_date",
].join(",");

const SETTINGS_FIELDS = [
  "id",
  "hero_disclaimer",
  "offers_eyebrow",
  "offers_title",
  "offers_empty_title",
  "offers_empty_body",
  "monthly_fallback",
  "offer_cta_label",
  "plans_eyebrow",
  "plans_title",
  "rules_eyebrow",
  "rules_title",
  "form_title",
  "form_scenario",
  "form_contact_label",
  "form_contact_placeholder",
  "form_budget_label",
  "form_budget_placeholder",
  "form_term_label",
  "form_message_label",
  "form_message_placeholder",
  "form_submit_label",
  "form_submitting_label",
  "form_idle_note",
  "form_success_note",
  "form_error_note",
  "form_consent_note",
].join(",");

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["1", "true", "yes"].includes(value.toLowerCase());
  return fallback;
}

function record(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Row;
}

function relation(value: unknown): Row {
  if (Array.isArray(value)) return record(value[0]);
  return record(value);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const itemText = text(item);
    return itemText ? [itemText] : [];
  });
}

function formatRub(value: number): string {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function assetUrl(value: unknown, width = 720, height = 540): string {
  const file = relation(value);
  const id = text(file.id) || text(value);
  return id
    ? directusAssetUrl(id, {
        width,
        height,
        fit: "cover",
        format: "auto",
        quality: 84,
        withoutEnlargement: true,
      })
    : "";
}

function mapBrand(value: unknown): ProductBrand {
  const row = relation(value);
  const name = text(row.name, "Apple");
  const slug = text(row.slug, name.toLowerCase().replace(/\s+/g, "-"));
  return {
    id: text(row.id, slug),
    slug,
    name,
  };
}

function mapCategory(value: unknown): ProductCategory {
  const row = relation(value);
  const name = text(row.name, "Техника");
  const slug = text(row.slug, "tech");
  return {
    id: text(row.id, slug),
    slug,
    name,
    catalogSection: text(row.catalog_section) === "accessory" ? "accessory" : "device",
  };
}

function stockStatusLabel(status: string): string {
  if (status === "reserved") return "Бронь";
  if (status === "sold") return "Нет в наличии";
  return "В наличии";
}

function mapProductCard(value: unknown): ProductCardData | null {
  const row = relation(value);
  const id = text(row.id);
  const title = text(row.title);
  if (!id || !title) return null;
  const productType = text(row.product_type) === "accessory" ? "accessory" : "device";
  const condition = text(row.condition) === "new" ? "new" : "used";
  const stockStatus = text(row.stock_status, "available");
  const price = number(row.price);
  const deviceDetails = relation(row.device_details);
  const listingImage = assetUrl(row.listing_file);
  const detailHref = `/product/${id}`;
  const trustFacts = [
    condition === "used" ? text(deviceDetails.grade) : "",
    text(deviceDetails.battery_text),
    text(row.warranty_text),
  ].filter(Boolean);

  return {
    id,
    sku: text(row.sku, id),
    productType,
    condition,
    brand: mapBrand(row.brand),
    category: mapCategory(row.category),
    title,
    model: text(row.model, title),
    deviceModelSlug: text(relation(row.device_model).slug) || undefined,
    color: text(row.color),
    price,
    priceText: text(row.price_text, price ? formatRub(price) : ""),
    stockQuantity: number(row.stock_quantity),
    stockStatus,
    stockStatusLabel: stockStatusLabel(stockStatus),
    warrantyText: text(row.warranty_text),
    listingImage,
    listingAlt: text(row.listing_alt, title),
    updatedAt: text(row.updated_at) || undefined,
    sort: number(row.sort) || undefined,
    ctaLabel: "Смотреть устройство",
    detailHref,
    trustFacts,
  };
}

export const fallbackClubPlans: ClubPlan[] = [
  {
    id: "base",
    slug: "base",
    status: "published",
    name: "Club Base",
    badge: "Base",
    summary: "Проверенное устройство, фиксированный платёж и четыре варианта в конце срока.",
    minTermMonths: 12,
    monthlyNote: "Расчёт по конкретному устройству",
    features: [
      "Passport при передаче",
      "Гарантия на весь срок",
      "Возврат, продление, обновление или выкуп",
    ],
    isFeatured: false,
    isFuture: false,
    sort: 10,
  },
  {
    id: "care",
    slug: "care",
    status: "published",
    name: "Club Care",
    badge: "Рекомендуемый",
    summary: "Владение без тревоги: приоритетная диагностика и понятный сервисный маршрут.",
    minTermMonths: 12,
    monthlyNote: "Расчёт по конкретному устройству",
    features: [
      "Всё из Base",
      "Приоритетная диагностика",
      "Подменное устройство по правилам тарифа",
    ],
    isFeatured: true,
    isFuture: false,
    sort: 20,
  },
  {
    id: "flex",
    slug: "flex",
    status: "published",
    name: "Club Flex",
    badge: "Будущий формат",
    summary: "Больше свободы: ранняя смена модели и досрочный выход по известным правилам.",
    minTermMonths: 6,
    monthlyNote: "Лист ожидания",
    features: ["Всё из Care", "Ранняя смена модели", "Досрочный выход по правилам пилота"],
    isFeatured: false,
    isFuture: true,
    sort: 30,
  },
];

export const fallbackClubRules: ClubRuleItem[] = [
  {
    id: "passport-cycle",
    status: "published",
    category: "return",
    title: "Passport цикла",
    body: "Состояние фиксируется при передаче и повторно при возврате или обновлении.",
    sort: 10,
  },
  {
    id: "normal-wear",
    status: "published",
    category: "wear",
    title: "Нормальный износ",
    body: "Нормальный износ отделяется от повреждений по опубликованным правилам пилота.",
    sort: 20,
  },
  {
    id: "data-lock",
    status: "published",
    category: "data",
    title: "Данные и Apple ID",
    body: "Перед возвратом проверяются резервная копия, удаление данных и отключение Find My.",
    sort: 30,
  },
];

export const fallbackClubPageSettings: ClubPageSettings = {
  heroDisclaimer:
    "Club — это аренда устройства с ежемесячной оплатой. Устройство остаётся собственностью I СВОИ до выкупа.",
  offersEyebrow: "Устройства",
  offersTitle: "Доступно по Club",
  offersEmptyTitle: "Club-витрина готовится",
  offersEmptyBody: "Оставьте заявку — подберём устройство, срок и понятный ежемесячный платёж.",
  monthlyFallback: "Расчёт по заявке",
  offerCtaLabel: "Получить расчёт",
  plansEyebrow: "Тарифы пилота",
  plansTitle: "Base и Care запускаются первыми",
  rulesEyebrow: "Правила",
  rulesTitle: "Сначала условия, потом решение",
  formTitle: "Получить расчёт Club",
  formScenario: "Расчёт Club",
  formContactLabel: "Контакт для ответа",
  formContactPlaceholder: "Телефон или Telegram",
  formBudgetLabel: "Комфортный платёж",
  formBudgetPlaceholder: "Например, до 6 000 ₽/мес",
  formTermLabel: "Желаемый срок",
  formMessageLabel: "Комментарий",
  formMessagePlaceholder: "Модель, память, цвет или сценарий обновления",
  formSubmitLabel: "Получить расчёт Club",
  formSubmittingLabel: "Отправляем...",
  formIdleNote: "Покажем устройство, срок, платёж и правила до оформления.",
  formSuccessNote: "Заявка принята. Подготовим расчёт Club и свяжемся с вами.",
  formErrorNote: "Оставьте контакт, пройдите проверку или попробуйте отправить ещё раз.",
  formConsentNote:
    "Нажимая кнопку, вы соглашаетесь на обработку контакта для ответа по заявке Club.",
};

function mapPlan(value: unknown): ClubPlan | null {
  const row = relation(value);
  const id = text(row.id);
  const name = text(row.name);
  if (!id || !name) return null;
  return {
    id,
    slug: text(row.slug, id),
    status: text(row.status, "published"),
    name,
    badge: text(row.badge) || undefined,
    summary: text(row.summary),
    minTermMonths: number(row.min_term_months) || undefined,
    monthlyNote: text(row.monthly_note) || undefined,
    features: stringList(row.features),
    isFeatured: bool(row.is_featured),
    isFuture: bool(row.is_future),
    sort: number(row.sort),
  };
}

function mapOffer(row: Row, settings: ClubPageSettings): ClubOffer | null {
  const product = mapProductCard(row.product);
  const plan = mapPlan(row.plan);
  if (!product || !plan) return null;
  const monthlyFrom = number(row.monthly_from);
  const monthlyText = text(
    row.monthly_text,
    monthlyFrom ? `от ${formatRub(monthlyFrom)}/мес` : settings.monthlyFallback,
  );
  return {
    id: text(row.id),
    status: text(row.status, "published"),
    offerStatus: text(row.offer_status, "approved"),
    product,
    plan,
    termMonths: number(row.term_months) || plan.minTermMonths,
    monthlyFrom: monthlyFrom || undefined,
    monthlyText,
    termsText: text(row.terms_text) || undefined,
    badge: text(row.badge) || undefined,
    ctaLabel: text(row.cta_label, settings.offerCtaLabel),
    sort: number(row.sort),
  };
}

function mapRule(row: Row): ClubRuleItem | null {
  const id = text(row.id);
  const title = text(row.title);
  if (!id || !title) return null;
  return {
    id,
    status: text(row.status, "published"),
    category: text(row.category, "service"),
    title,
    body: text(row.body),
    sort: number(row.sort),
  };
}

function mapSettings(row?: Row): ClubPageSettings {
  if (!row) return fallbackClubPageSettings;
  return {
    heroDisclaimer: text(row.hero_disclaimer, fallbackClubPageSettings.heroDisclaimer),
    offersEyebrow: text(row.offers_eyebrow, fallbackClubPageSettings.offersEyebrow),
    offersTitle: text(row.offers_title, fallbackClubPageSettings.offersTitle),
    offersEmptyTitle: text(row.offers_empty_title, fallbackClubPageSettings.offersEmptyTitle),
    offersEmptyBody: text(row.offers_empty_body, fallbackClubPageSettings.offersEmptyBody),
    monthlyFallback: text(row.monthly_fallback, fallbackClubPageSettings.monthlyFallback),
    offerCtaLabel: text(row.offer_cta_label, fallbackClubPageSettings.offerCtaLabel),
    plansEyebrow: text(row.plans_eyebrow, fallbackClubPageSettings.plansEyebrow),
    plansTitle: text(row.plans_title, fallbackClubPageSettings.plansTitle),
    rulesEyebrow: text(row.rules_eyebrow, fallbackClubPageSettings.rulesEyebrow),
    rulesTitle: text(row.rules_title, fallbackClubPageSettings.rulesTitle),
    formTitle: text(row.form_title, fallbackClubPageSettings.formTitle),
    formScenario: text(row.form_scenario, fallbackClubPageSettings.formScenario),
    formContactLabel: text(row.form_contact_label, fallbackClubPageSettings.formContactLabel),
    formContactPlaceholder: text(
      row.form_contact_placeholder,
      fallbackClubPageSettings.formContactPlaceholder,
    ),
    formBudgetLabel: text(row.form_budget_label, fallbackClubPageSettings.formBudgetLabel),
    formBudgetPlaceholder: text(
      row.form_budget_placeholder,
      fallbackClubPageSettings.formBudgetPlaceholder,
    ),
    formTermLabel: text(row.form_term_label, fallbackClubPageSettings.formTermLabel),
    formMessageLabel: text(row.form_message_label, fallbackClubPageSettings.formMessageLabel),
    formMessagePlaceholder: text(
      row.form_message_placeholder,
      fallbackClubPageSettings.formMessagePlaceholder,
    ),
    formSubmitLabel: text(row.form_submit_label, fallbackClubPageSettings.formSubmitLabel),
    formSubmittingLabel: text(
      row.form_submitting_label,
      fallbackClubPageSettings.formSubmittingLabel,
    ),
    formIdleNote: text(row.form_idle_note, fallbackClubPageSettings.formIdleNote),
    formSuccessNote: text(row.form_success_note, fallbackClubPageSettings.formSuccessNote),
    formErrorNote: text(row.form_error_note, fallbackClubPageSettings.formErrorNote),
    formConsentNote: text(row.form_consent_note, fallbackClubPageSettings.formConsentNote),
  };
}

export const getClubPageData = cache(async function getClubPageData(): Promise<{
  settings: ClubPageSettings;
  plans: ClubPlan[];
  offers: ClubOffer[];
  rules: ClubRuleItem[];
}> {
  const [settingsRows, planRows, ruleRows] = await Promise.all([
    directusGet<Row[]>(`/items/club_page_settings?fields=${SETTINGS_FIELDS}&limit=1`, {
      tags: [CLUB_CACHE_TAG],
    }),
    directusGet<Row[]>(
      `/items/club_plans?filter[status][_eq]=published&fields=${PLAN_FIELDS}&sort=sort&limit=20`,
      { tags: [CLUB_CACHE_TAG] },
    ),
    directusGet<Row[]>(
      "/items/club_rule_items?filter[status][_eq]=published&fields=id,status,category,title,body,sort&sort=sort&limit=100",
      { tags: [CLUB_CACHE_TAG] },
    ),
  ]);

  const settings = mapSettings(settingsRows?.[0]);
  const plans =
    planRows?.map(mapPlan).filter((plan): plan is ClubPlan => Boolean(plan)) ?? fallbackClubPlans;
  const rules =
    ruleRows?.map(mapRule).filter((rule): rule is ClubRuleItem => Boolean(rule)) ??
    fallbackClubRules;
  const offerRows = await directusGet<Row[]>(
    `/items/club_offers?filter[status][_eq]=published&filter[offer_status][_in]=approved,waitlist&fields=${OFFER_FIELDS}&sort=sort&limit=24`,
    { tags: [CLUB_CACHE_TAG] },
  );
  const offers =
    offerRows
      ?.map((row) => mapOffer(row, settings))
      .filter((offer): offer is ClubOffer => Boolean(offer)) ?? [];

  return { settings, plans, offers, rules };
});
