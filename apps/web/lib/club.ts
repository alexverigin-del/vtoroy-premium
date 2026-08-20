import { cache } from "react";
import type {
  ClubOffer,
  ClubLegalDocument,
  ClubPageSettings,
  ClubPlan,
  ClubProcessItem,
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
  "support_level",
  "service_response_text",
  "diagnostics_text",
  "replacement_text",
  "early_exit_text",
  "damage_text",
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
  "pricing_mode",
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
  "publication_mode",
  "hero_eyebrow",
  "hero_title",
  "hero_body",
  "hero_primary_label",
  "hero_primary_url",
  "hero_secondary_label",
  "hero_secondary_url",
  "hero_disclaimer",
  "hero_panel_eyebrow",
  "hero_panel_title",
  "hero_panel_body",
  "offers_eyebrow",
  "offers_title",
  "offers_empty_title",
  "offers_empty_body",
  "monthly_fallback",
  "offer_cta_label",
  "cycle_eyebrow",
  "cycle_title",
  "cycle_body",
  "passport_eyebrow",
  "passport_title",
  "passport_body",
  "plans_eyebrow",
  "plans_title",
  "rules_eyebrow",
  "rules_title",
  "participation_eyebrow",
  "participation_title",
  "participation_body",
  "legal_eyebrow",
  "legal_title",
  "legal_body",
  "final_eyebrow",
  "final_title",
  "final_body",
  "form_title",
  "form_scenario",
  "form_device_label",
  "form_device_placeholder",
  "form_device_error",
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
  "form_consent_label",
  "consent_version",
  "privacy_url",
].join(",");

const PROCESS_FIELDS = "id,status,group_key,slug,label,title,body,sort";
const LEGAL_FIELDS = [
  "id",
  "status",
  "document_type",
  "slug",
  "title",
  "summary",
  "body",
  "version",
  "effective_date",
  "file.id",
  "file.filename_download",
  "legal_reviewed",
  "sort",
].join(",");

export function isClubIndexingEnabled(settings: ClubPageSettings): boolean {
  return process.env.CLUB_INDEXING_ENABLED === "1" && settings.publicationMode === "public_index";
}

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
    offers: [],
    availabilityScope: "network",
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
      "Стандартный сервисный маршрут",
      "Продление, смена, выкуп или возврат",
    ],
    supportLevel: "Стандартное сопровождение",
    serviceResponseText: "Ответ в рабочее время",
    diagnosticsText: "Диагностика при передаче и возврате",
    replacementText: "Не включено",
    earlyExitText: "По индивидуальному расчёту",
    damageText: "После диагностики по правилам пилота",
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
    features: ["Всё из Base", "Приоритетная диагностика", "Приоритетный сервисный маршрут"],
    supportLevel: "Приоритетное сопровождение",
    serviceResponseText: "Приоритетный ответ в рабочее время",
    diagnosticsText: "Расширенная фиксация состояния",
    replacementText: "По наличию и условиям расчёта",
    earlyExitText: "По индивидуальному расчёту",
    damageText: "Приоритетный разбор после диагностики",
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
    supportLevel: "Будущий формат",
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
  publicationMode: "pilot_noindex",
  heroEyebrow: "I СВОИ Club · пилот в Белгороде",
  heroTitle: "Своя, пока нужна.",
  heroBody:
    "Пользуйтесь проверенным устройством Apple за фиксированную плату в месяц. В конце срока продолжите, смените модель, выкупите или вернёте.",
  heroPrimaryLabel: "Получить расчёт Club",
  heroPrimaryUrl: "#club-request",
  heroSecondaryLabel: "Посмотреть устройства",
  heroSecondaryUrl: "#devices",
  heroDisclaimer:
    "Club — это аренда устройства с ежемесячной оплатой. Устройство остаётся собственностью I СВОИ до выкупа.",
  heroPanelEyebrow: "Passport цикла",
  heroPanelTitle: "Состояние фиксируется дважды",
  heroPanelBody:
    "Club стартует как пилот с ручным расчётом: без публичной оплаты, скоринга и личного кабинета.",
  offersEyebrow: "I СВОИ Club · устройства",
  offersTitle: "Доступные устройства Club",
  offersEmptyTitle: "Нужна другая модель?",
  offersEmptyBody:
    "Оставьте параметры подбора: модель или категорию, желаемый срок и комфортный платёж. Менеджер предложит конкретное проверенное устройство.",
  monthlyFallback: "Расчёт по заявке",
  offerCtaLabel: "Рассчитать это устройство",
  cycleEyebrow: "I СВОИ Club · как работает",
  cycleTitle: "В конце срока есть четыре понятных сценария.",
  cycleBody:
    "Сначала вы пользуетесь устройством в рамках согласованной модели, затем выбираете следующий шаг.",
  passportEyebrow: "I СВОИ Passport · цикл владения",
  passportTitle: "Передача и возврат фиксируются двумя проверками.",
  passportBody:
    "Passport отделяет нормальный износ от спорных повреждений: состояние фиксируется в начале Club-цикла и при его завершении.",
  plansEyebrow: "Тарифы пилота",
  plansTitle: "Base и Care отличаются уровнем сопровождения",
  rulesEyebrow: "Правила",
  rulesTitle: "Сначала условия, потом решение",
  participationEyebrow: "I СВОИ Club · участие",
  participationTitle: "От заявки до передачи устройства",
  participationBody: "До оформления вы увидите устройство, расчёт, правила и проект документов.",
  legalEyebrow: "I СВОИ Club · документы",
  legalTitle: "Юридический пакет пилота",
  legalBody:
    "Документы публикуются после проверки. До этого Club доступен как закрытый от поиска пилот.",
  finalEyebrow: "I СВОИ Club · заявка",
  finalTitle: "Получите ручной расчёт под устройство и срок.",
  finalBody:
    "Мы проверим модель, срок, тариф, комфортный ежемесячный платёж и сценарий в конце срока.",
  formTitle: "Получить расчёт Club",
  formScenario: "Расчёт Club",
  formDeviceLabel: "Категория или модель",
  formDevicePlaceholder: "Например, iPhone 15 Pro 256 GB",
  formDeviceError: "Укажите модель или выберите готовое предложение.",
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
    "Согласие относится только к обработке заявки Club и не означает заключение договора.",
  formConsentLabel: "Я согласен на обработку персональных данных для ответа по заявке.",
  consentVersion: "club-pilot-v1",
  privacyUrl: "https://isvoi.ru/privacy",
};

export const fallbackClubProcesses: ClubProcessItem[] = [
  {
    id: "extend",
    status: "published",
    group: "scenario",
    slug: "extend",
    label: "01",
    title: "Продлить",
    body: "Оставить устройство ещё на срок после согласования условий.",
    sort: 10,
  },
  {
    id: "switch",
    status: "published",
    group: "scenario",
    slug: "switch",
    label: "02",
    title: "Сменить",
    body: "Перейти на другую модель после проверки и нового расчёта.",
    sort: 20,
  },
  {
    id: "buyout",
    status: "published",
    group: "scenario",
    slug: "buyout",
    label: "03",
    title: "Выкупить",
    body: "Оставить устройство себе по согласованной после проверки стоимости.",
    sort: 30,
  },
  {
    id: "return",
    status: "published",
    group: "scenario",
    slug: "return",
    label: "04",
    title: "Вернуть",
    body: "Закрыть цикл после удаления данных и повторной диагностики.",
    sort: 40,
  },
  {
    id: "passport-start",
    status: "published",
    group: "passport",
    slug: "passport-start",
    label: "Старт",
    title: "Паспорт передачи",
    body: "Модель, комплект, корпус, экран, батарея и важные серийные признаки.",
    sort: 10,
  },
  {
    id: "passport-finish",
    status: "published",
    group: "passport",
    slug: "passport-finish",
    label: "Финиш",
    title: "Паспорт возврата",
    body: "Повторная проверка перед продлением, сменой, выкупом или возвратом.",
    sort: 20,
  },
  {
    id: "participation-request",
    status: "published",
    group: "participation",
    slug: "participation-request",
    label: "01",
    title: "Заявка",
    body: "Укажите модель, срок и комфортный платёж.",
    sort: 10,
  },
  {
    id: "participation-calculation",
    status: "published",
    group: "participation",
    slug: "participation-calculation",
    label: "02",
    title: "Расчёт",
    body: "Покажем устройство, тариф, платёж и сценарии завершения.",
    sort: 20,
  },
  {
    id: "participation-handover",
    status: "published",
    group: "participation",
    slug: "participation-handover",
    label: "03",
    title: "Проверка и передача",
    body: "Фиксируем состояние в Passport и подписываем проверенные документы.",
    sort: 30,
  },
];

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
    supportLevel: text(row.support_level) || undefined,
    serviceResponseText: text(row.service_response_text) || undefined,
    diagnosticsText: text(row.diagnostics_text) || undefined,
    replacementText: text(row.replacement_text) || undefined,
    earlyExitText: text(row.early_exit_text) || undefined,
    damageText: text(row.damage_text) || undefined,
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
    pricingMode: text(row.pricing_mode, monthlyFrom ? "monthly_from" : "manual"),
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

function mapProcess(row: Row): ClubProcessItem | null {
  const id = text(row.id);
  const title = text(row.title);
  if (!id || !title) return null;
  return {
    id,
    status: text(row.status, "published"),
    group: text(row.group_key, "participation"),
    slug: text(row.slug, id),
    label: text(row.label) || undefined,
    title,
    body: text(row.body),
    sort: number(row.sort),
  };
}

function mapLegalDocument(row: Row): ClubLegalDocument | null {
  const id = text(row.id);
  const title = text(row.title);
  if (!id || !title) return null;
  const file = relation(row.file);
  const fileId = text(file.id);
  return {
    id,
    status: text(row.status, "draft"),
    documentType: text(row.document_type),
    slug: text(row.slug, id),
    title,
    summary: text(row.summary),
    body: text(row.body),
    version: text(row.version),
    effectiveDate: text(row.effective_date) || undefined,
    fileUrl: fileId ? directusAssetUrl(fileId) : undefined,
    fileName: text(file.filename_download) || undefined,
    legalReviewed: bool(row.legal_reviewed),
    sort: number(row.sort),
  };
}

function mapSettings(row?: Row): ClubPageSettings {
  if (!row) return fallbackClubPageSettings;
  return {
    publicationMode: text(
      row.publication_mode,
      fallbackClubPageSettings.publicationMode,
    ) as ClubPageSettings["publicationMode"],
    heroEyebrow: text(row.hero_eyebrow, fallbackClubPageSettings.heroEyebrow),
    heroTitle: text(row.hero_title, fallbackClubPageSettings.heroTitle),
    heroBody: text(row.hero_body, fallbackClubPageSettings.heroBody),
    heroPrimaryLabel: text(row.hero_primary_label, fallbackClubPageSettings.heroPrimaryLabel),
    heroPrimaryUrl: text(row.hero_primary_url, fallbackClubPageSettings.heroPrimaryUrl),
    heroSecondaryLabel: text(row.hero_secondary_label, fallbackClubPageSettings.heroSecondaryLabel),
    heroSecondaryUrl: text(row.hero_secondary_url, fallbackClubPageSettings.heroSecondaryUrl),
    heroDisclaimer: text(row.hero_disclaimer, fallbackClubPageSettings.heroDisclaimer),
    heroPanelEyebrow: text(row.hero_panel_eyebrow, fallbackClubPageSettings.heroPanelEyebrow),
    heroPanelTitle: text(row.hero_panel_title, fallbackClubPageSettings.heroPanelTitle),
    heroPanelBody: text(row.hero_panel_body, fallbackClubPageSettings.heroPanelBody),
    offersEyebrow: text(row.offers_eyebrow, fallbackClubPageSettings.offersEyebrow),
    offersTitle: text(row.offers_title, fallbackClubPageSettings.offersTitle),
    offersEmptyTitle: text(row.offers_empty_title, fallbackClubPageSettings.offersEmptyTitle),
    offersEmptyBody: text(row.offers_empty_body, fallbackClubPageSettings.offersEmptyBody),
    monthlyFallback: text(row.monthly_fallback, fallbackClubPageSettings.monthlyFallback),
    offerCtaLabel: text(row.offer_cta_label, fallbackClubPageSettings.offerCtaLabel),
    cycleEyebrow: text(row.cycle_eyebrow, fallbackClubPageSettings.cycleEyebrow),
    cycleTitle: text(row.cycle_title, fallbackClubPageSettings.cycleTitle),
    cycleBody: text(row.cycle_body, fallbackClubPageSettings.cycleBody),
    passportEyebrow: text(row.passport_eyebrow, fallbackClubPageSettings.passportEyebrow),
    passportTitle: text(row.passport_title, fallbackClubPageSettings.passportTitle),
    passportBody: text(row.passport_body, fallbackClubPageSettings.passportBody),
    plansEyebrow: text(row.plans_eyebrow, fallbackClubPageSettings.plansEyebrow),
    plansTitle: text(row.plans_title, fallbackClubPageSettings.plansTitle),
    rulesEyebrow: text(row.rules_eyebrow, fallbackClubPageSettings.rulesEyebrow),
    rulesTitle: text(row.rules_title, fallbackClubPageSettings.rulesTitle),
    participationEyebrow: text(
      row.participation_eyebrow,
      fallbackClubPageSettings.participationEyebrow,
    ),
    participationTitle: text(row.participation_title, fallbackClubPageSettings.participationTitle),
    participationBody: text(row.participation_body, fallbackClubPageSettings.participationBody),
    legalEyebrow: text(row.legal_eyebrow, fallbackClubPageSettings.legalEyebrow),
    legalTitle: text(row.legal_title, fallbackClubPageSettings.legalTitle),
    legalBody: text(row.legal_body, fallbackClubPageSettings.legalBody),
    finalEyebrow: text(row.final_eyebrow, fallbackClubPageSettings.finalEyebrow),
    finalTitle: text(row.final_title, fallbackClubPageSettings.finalTitle),
    finalBody: text(row.final_body, fallbackClubPageSettings.finalBody),
    formTitle: text(row.form_title, fallbackClubPageSettings.formTitle),
    formScenario: text(row.form_scenario, fallbackClubPageSettings.formScenario),
    formDeviceLabel: text(row.form_device_label, fallbackClubPageSettings.formDeviceLabel),
    formDevicePlaceholder: text(
      row.form_device_placeholder,
      fallbackClubPageSettings.formDevicePlaceholder,
    ),
    formDeviceError: text(row.form_device_error, fallbackClubPageSettings.formDeviceError),
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
    formConsentLabel: text(row.form_consent_label, fallbackClubPageSettings.formConsentLabel),
    consentVersion: text(row.consent_version, fallbackClubPageSettings.consentVersion),
    privacyUrl: text(row.privacy_url, fallbackClubPageSettings.privacyUrl),
  };
}

export const getClubPageData = cache(async function getClubPageData(): Promise<{
  settings: ClubPageSettings;
  plans: ClubPlan[];
  offers: ClubOffer[];
  rules: ClubRuleItem[];
  processes: ClubProcessItem[];
  legalDocuments: ClubLegalDocument[];
}> {
  const [settingsRows, planRows, ruleRows, processRows, legalRows] = await Promise.all([
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
    directusGet<Row[]>(
      `/items/club_process_items?filter[status][_eq]=published&fields=${PROCESS_FIELDS}&sort=group_key,sort&limit=100`,
      { tags: [CLUB_CACHE_TAG] },
    ),
    directusGet<Row[]>(
      `/items/club_legal_documents?filter[status][_eq]=published&fields=${LEGAL_FIELDS}&sort=sort&limit=20`,
      { tags: [CLUB_CACHE_TAG] },
    ),
  ]);

  const settings = mapSettings(settingsRows?.[0]);
  const plans =
    planRows?.map(mapPlan).filter((plan): plan is ClubPlan => Boolean(plan)) ?? fallbackClubPlans;
  const rules =
    ruleRows?.map(mapRule).filter((rule): rule is ClubRuleItem => Boolean(rule)) ??
    fallbackClubRules;
  const processes =
    processRows?.map(mapProcess).filter((item): item is ClubProcessItem => Boolean(item)) ??
    fallbackClubProcesses;
  const legalDocuments =
    legalRows?.map(mapLegalDocument).filter((item): item is ClubLegalDocument => Boolean(item)) ??
    [];
  const offerRows = await directusGet<Row[]>(
    `/items/club_offers?filter[status][_eq]=published&filter[offer_status][_in]=approved,waitlist&filter[product][status][_eq]=published&filter[product][stock_status][_eq]=available&filter[product][stock_quantity][_gt]=0&fields=${OFFER_FIELDS}&sort=sort&limit=24`,
    { tags: [CLUB_CACHE_TAG] },
  );
  const offers =
    offerRows
      ?.map((row) => mapOffer(row, settings))
      .filter((offer): offer is ClubOffer => Boolean(offer)) ?? [];

  return { settings, plans, offers, rules, processes, legalDocuments };
});

export const getClubLegalDocument = cache(async function getClubLegalDocument(
  slug: string,
): Promise<ClubLegalDocument | null> {
  const rows = await directusGet<Row[]>(
    `/items/club_legal_documents?filter[status][_eq]=published&filter[slug][_eq]=${encodeURIComponent(slug)}&fields=${LEGAL_FIELDS}&limit=1`,
    { tags: [CLUB_CACHE_TAG] },
  );
  return rows?.[0] ? mapLegalDocument(rows[0]) : null;
});
