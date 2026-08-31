import "server-only";

import { createHash } from "node:crypto";

import type {
  TradeAnswerOption,
  TradeAnswerValue,
  TradeAnswers,
  TradeDeviceConfiguration,
  TradeEventName,
  TradeExchangeOffer,
  TradePublicConfig,
  TradeQuestion,
  TradeQuestionKey,
  TradeQuote,
  TradeQuoteRequest,
  TradeStoreOption,
} from "@vtoroy/shared";
import { getAllPublishedV3ProductCards, getPublishedV3ProductForTrade } from "./product-catalog";
import { tradeExchangeOffer, tradeExchangePage } from "./trade-exchange";
import {
  calculateTradeRange,
  isTradeQuoteExpired,
  tradeQuoteValidUntil,
  type TradePricingRule,
} from "./trade-calculation";
import { tradeQaEnabled } from "./trade-qa";
import { TRADE_SUPPORTED_MODELS } from "./trade-supported-models";

type Row = Record<string, unknown>;
type DirectusResponse<T> = { data: T };

const DIRECTUS_URL = (
  process.env.DIRECTUS_URL ??
  process.env.NEXT_PUBLIC_DIRECTUS_URL ??
  ""
).replace(/\/+$/, "");
const DIRECTUS_TRADE_TOKEN = process.env.DIRECTUS_TRADE_TOKEN ?? process.env.DIRECTUS_TOKEN ?? "";

const QUESTION_KEYS = new Set<TradeQuestionKey>([
  "powers_on",
  "display_works",
  "hardware_works",
  "has_damage",
  "was_repaired",
  "battery_risk",
  "account_removed",
]);
const ANSWER_VALUES = new Set<TradeAnswerValue>(["yes", "no", "unknown"]);
const DRAFT_LEGAL_COPY = {
  quoteDisclaimerShort:
    "Предварительная оценка не является офертой. Итоговая сумма зависит от диагностики и подтверждается до сделки.",
  quoteDisclaimerFull:
    "Предварительная оценка, не оферта. Диапазон действует до {date}. Итоговую сумму подтвердим после очной диагностики, проверки комплектации, серийного номера, блокировок и права распоряжаться устройством. Если состояние отличается от ответов, предложим новую сумму — вы сможете принять её или отказаться.",
  consentLabel:
    "Я даю согласие на обработку телефона или Telegram для ответа по заявке Trade-in и ознакомлен с Политикой обработки персональных данных.",
  consentVersion: "trade-consent-v1-draft",
  consentUrl: "/privacy#trade-in-consent",
  safetyNotice:
    "Не заряжайте и не пересылайте устройство. Выключите его, если это можно сделать без давления на корпус, не вскрывайте и свяжитесь с магазином.",
  counterofferNotice:
    "После диагностики сумма изменилась: {reason}. Новое предложение — {amount}. Вы можете принять его или забрать устройство без сделки.",
} as const;

export type TradeConsentRecord = {
  label: string;
  text: string;
  version: string;
  consentUrl: string;
  privacyUrl: string;
  textHash: string;
};

function record(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
}

function relation(value: unknown): Row {
  const row = record(value);
  return Object.keys(row).length > 0 ? row : { id: value };
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function number(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolean(value: unknown): boolean {
  return value === true || value === "true" || value === 1;
}

function tradeFeatureEnabled(): boolean {
  return ["1", "true", "yes"].includes((process.env.TRADE_WIZARD_ENABLED ?? "").toLowerCase());
}

async function directusRequest<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (!DIRECTUS_URL || !DIRECTUS_TRADE_TOKEN) return null;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${DIRECTUS_TRADE_TOKEN}`);
  if (init?.body) headers.set("Content-Type", "application/json");

  try {
    const response = await fetch(`${DIRECTUS_URL}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export class TradeApiError extends Error {
  constructor(
    public readonly code:
      | "validation_error"
      | "manual_evaluation_required"
      | "safety_stop"
      | "quote_expired"
      | "pricing_unavailable"
      | "product_unavailable",
    public readonly status: number,
  ) {
    super(code);
  }
}

type TradeContext = {
  config: TradePublicConfig;
  pricingVersionId: string;
  configs: Map<string, { public: TradeDeviceConfiguration; baseMin: number; baseMax: number }>;
  rules: TradePricingRule[];
};

export type TradeContextOptions = { allowDraft?: boolean };

export async function getTradeConsentRecord(
  options: TradeContextOptions = {},
): Promise<TradeConsentRecord | null> {
  const allowDraft = options.allowDraft === true && tradeQaEnabled();
  if (options.allowDraft && !allowDraft) return null;

  const response = await directusRequest<DirectusResponse<Row>>(
    "/items/trade_settings/1?fields=legal_status,consent_label,consent_text,consent_version,consent_url,privacy_url,legal_approved_by.id,legal_approved_at",
  );
  const settings = record(response?.data);
  const label = text(settings.consent_label);
  const consentText = text(settings.consent_text);
  const version = text(settings.consent_version);
  const consentUrl = text(settings.consent_url);
  const privacyUrl = text(settings.privacy_url);
  const approved =
    allowDraft ||
    (text(settings.legal_status) === "approved" &&
      Boolean(text(relation(settings.legal_approved_by).id)) &&
      Boolean(text(settings.legal_approved_at)));

  if (!approved || !label || !consentText || !version || !consentUrl || !privacyUrl) return null;

  return {
    label,
    text: consentText,
    version,
    consentUrl,
    privacyUrl,
    textHash: createHash("sha256").update(consentText, "utf8").digest("hex"),
  };
}

async function loadTradeContext(options: TradeContextOptions = {}): Promise<TradeContext | null> {
  const qaAccess = options.allowDraft === true && tradeQaEnabled();
  if (options.allowDraft && !qaAccess) return null;
  if (!qaAccess && !tradeFeatureEnabled()) return null;

  const settingsResponse = await directusRequest<DirectusResponse<Row>>(
    "/items/trade_settings/1?fields=id,status,quote_validity_days,economics_status,tax_treatment_confirmed,primary_document_status,kkt_workflow_status,economics_approved_by,economics_approved_at,legal_status,quote_disclaimer_short,quote_disclaimer_full,consent_label,consent_text,consent_version,consent_url,privacy_url,safety_notice,counteroffer_notice,legal_approved_by,legal_approved_at,active_pricing_version.id,active_pricing_version.version,active_pricing_version.status,default_store.id,default_store.slug,default_store.name,default_store.city",
  );
  const settings = record(settingsResponse?.data);
  const pricingVersion = relation(settings.active_pricing_version);
  const pricingVersionId = text(pricingVersion.id);
  const expectedStatus = qaAccess ? text(settings.status) : "published";
  if (
    !["draft", "published"].includes(expectedStatus) ||
    text(settings.status) !== expectedStatus ||
    text(pricingVersion.status) !== expectedStatus ||
    !pricingVersionId
  )
    return null;

  const versionFilter = encodeURIComponent(pricingVersionId);
  const [configResponse, ruleResponse, storeResponse] = await Promise.all([
    directusRequest<DirectusResponse<Row[]>>(
      `/items/trade_device_configs?filter[status][_eq]=${expectedStatus}&filter[pricing_version][_eq]=${versionFilter}&fields=id,storage,sort,base_min,base_max,device_model.id,device_model.slug,device_model.name&sort=sort,device_model.name,storage&limit=200`,
    ),
    directusRequest<DirectusResponse<Row[]>>(
      `/items/trade_condition_rules?filter[status][_eq]=${expectedStatus}&filter[pricing_version][_eq]=${versionFilter}&fields=id,question_key,question_label,question_help,question_sort,option_value,option_label,option_sort,delta_min,delta_max,factor_label,factor_type,manual_evaluation,safety_stop&sort=question_sort,option_sort&limit=200`,
    ),
    directusRequest<DirectusResponse<Row[]>>(
      "/items/store_locations?filter[status][_eq]=published&fields=id,slug,name,city&sort=sort&limit=100",
    ),
  ]);
  if (!configResponse || !ruleResponse) return null;

  const configs = new Map<
    string,
    { public: TradeDeviceConfiguration; baseMin: number; baseMax: number }
  >();
  for (const item of configResponse.data) {
    const row = record(item);
    const model = relation(row.device_model);
    const config: TradeDeviceConfiguration = {
      id: text(row.id),
      deviceModelId: text(model.id),
      modelSlug: text(model.slug),
      modelName: text(model.name),
      storage: text(row.storage),
      sort: number(row.sort, 100),
    };
    if (
      !config.id ||
      !config.deviceModelId ||
      !config.modelName ||
      !config.storage ||
      !TRADE_SUPPORTED_MODELS.has(config.modelSlug)
    )
      continue;
    configs.set(config.id, {
      public: config,
      baseMin: number(row.base_min),
      baseMax: number(row.base_max),
    });
  }

  const questionMap = new Map<TradeQuestionKey, TradeQuestion>();
  const rules: TradePricingRule[] = [];
  for (const item of ruleResponse.data) {
    const row = record(item);
    const questionKey = text(row.question_key) as TradeQuestionKey;
    const optionValue = text(row.option_value) as TradeAnswerValue;
    if (!QUESTION_KEYS.has(questionKey) || !ANSWER_VALUES.has(optionValue)) continue;
    const option: TradeAnswerOption = { value: optionValue, label: text(row.option_label) };
    const question = questionMap.get(questionKey) ?? {
      key: questionKey,
      label: text(row.question_label),
      helpText: text(row.question_help) || undefined,
      options: [],
    };
    if (!question.options.some((candidate) => candidate.value === option.value)) {
      question.options.push(option);
    }
    questionMap.set(questionKey, question);
    rules.push({
      questionKey,
      optionValue,
      label: text(row.factor_label, text(row.question_label)),
      deltaMin: number(row.delta_min),
      deltaMax: number(row.delta_max),
      factorType: ["positive", "risk"].includes(text(row.factor_type))
        ? (text(row.factor_type) as "positive" | "risk")
        : "neutral",
      manualEvaluation: boolean(row.manual_evaluation),
      safetyStop: boolean(row.safety_stop),
    });
  }

  const defaultStore = relation(settings.default_store);
  const economicsReady =
    text(settings.economics_status) === "approved" &&
    boolean(settings.tax_treatment_confirmed) &&
    text(settings.primary_document_status) === "approved" &&
    text(settings.kkt_workflow_status) === "approved" &&
    Boolean(text(relation(settings.economics_approved_by).id)) &&
    Boolean(text(settings.economics_approved_at));
  const legalReady =
    text(settings.legal_status) === "approved" &&
    Boolean(text(relation(settings.legal_approved_by).id)) &&
    Boolean(text(settings.legal_approved_at)) &&
    Boolean(text(settings.quote_disclaimer_short)) &&
    Boolean(text(settings.quote_disclaimer_full)) &&
    Boolean(text(settings.consent_label)) &&
    Boolean(text(settings.consent_text)) &&
    Boolean(text(settings.consent_version)) &&
    Boolean(text(settings.consent_url)) &&
    Boolean(text(settings.privacy_url));
  const stores = (storeResponse?.data ?? []).map((item) => {
    const row = record(item);
    return {
      id: text(row.id),
      slug: text(row.slug),
      name: text(row.name),
      city: text(row.city),
    } satisfies TradeStoreOption;
  });
  if (stores.length === 0 && text(defaultStore.id)) {
    stores.push({
      id: text(defaultStore.id),
      slug: text(defaultStore.slug),
      name: text(defaultStore.name),
      city: text(defaultStore.city),
    });
  }

  const config: TradePublicConfig = {
    active:
      configs.size > 0 &&
      questionMap.size === QUESTION_KEYS.size &&
      (qaAccess || (economicsReady && legalReady)) &&
      [...questionMap.values()].every(
        (question) =>
          question.options.length === ANSWER_VALUES.size &&
          question.options.every((option) => ANSWER_VALUES.has(option.value)),
      ),
    contractVersion: 2,
    pricingVersion: text(pricingVersion.version),
    quoteValidityDays: Math.max(1, number(settings.quote_validity_days, 7)),
    devices: [...configs.values()].map((item) => item.public),
    questions: [...questionMap.values()],
    stores,
    defaultStoreId: text(defaultStore.id) || undefined,
    legal: {
      quoteDisclaimerShort: text(
        settings.quote_disclaimer_short,
        DRAFT_LEGAL_COPY.quoteDisclaimerShort,
      ),
      quoteDisclaimerFull: text(
        settings.quote_disclaimer_full,
        DRAFT_LEGAL_COPY.quoteDisclaimerFull,
      ),
      consentLabel: text(settings.consent_label, DRAFT_LEGAL_COPY.consentLabel),
      consentVersion: text(settings.consent_version, DRAFT_LEGAL_COPY.consentVersion),
      consentUrl: text(settings.consent_url, DRAFT_LEGAL_COPY.consentUrl),
      safetyNotice: text(settings.safety_notice, DRAFT_LEGAL_COPY.safetyNotice),
      counterofferNotice: text(settings.counteroffer_notice, DRAFT_LEGAL_COPY.counterofferNotice),
    },
  };
  return config.active ? { config, pricingVersionId, configs, rules } : null;
}

export async function getTradePublicConfig(
  options: TradeContextOptions = {},
): Promise<TradePublicConfig> {
  const context = await loadTradeContext(options);
  return (
    context?.config ?? {
      active: false,
      contractVersion: 2,
      pricingVersion: "",
      quoteValidityDays: 7,
      devices: [],
      questions: [],
      stores: [],
      legal: DRAFT_LEGAL_COPY,
    }
  );
}

function validateAnswers(answers: TradeAnswers, questions: TradeQuestion[]): void {
  for (const question of questions) {
    const answer = answers[question.key];
    if (!answer || !question.options.some((option) => option.value === answer)) {
      throw new TradeApiError("validation_error", 400);
    }
  }
}

export async function createTradeQuote(
  payload: TradeQuoteRequest,
  options: TradeContextOptions = {},
): Promise<TradeQuote> {
  const context = await loadTradeContext(options);
  if (!context) throw new TradeApiError("pricing_unavailable", 503);
  const selected = context.configs.get(payload.configurationId);
  if (!selected || selected.public.deviceModelId !== payload.deviceModelId) {
    throw new TradeApiError("validation_error", 400);
  }
  validateAnswers(payload.answers, context.config.questions);

  const calculated = calculateTradeRange(
    selected.baseMin,
    selected.baseMax,
    payload.answers,
    context.rules,
  );
  if (calculated.safetyStop) throw new TradeApiError("safety_stop", 422);
  if (calculated.manualEvaluation) {
    throw new TradeApiError("manual_evaluation_required", 422);
  }

  const validUntil = tradeQuoteValidUntil(new Date(), context.config.quoteValidityDays);
  const response = await directusRequest<DirectusResponse<Row>>("/items/trade_quotes", {
    method: "POST",
    body: JSON.stringify({
      status: "active",
      device_config: payload.configurationId,
      pricing_version: context.pricingVersionId,
      answers_snapshot: payload.answers,
      range_min: calculated.min,
      range_max: calculated.max,
      currency: "RUB",
      positive_factors: calculated.positiveFactors,
      risk_factors: calculated.riskFactors,
      valid_until: validUntil.toISOString(),
      is_test: options.allowDraft === true,
    }),
  });
  const quoteId = text(response?.data?.id);
  if (!quoteId) throw new TradeApiError("pricing_unavailable", 503);

  if (payload.previousQuoteId) {
    await directusRequest(`/items/trade_quotes/${encodeURIComponent(payload.previousQuoteId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "superseded", superseded_by: quoteId }),
    });
  }

  return {
    id: quoteId,
    status: "active",
    deviceModelId: selected.public.deviceModelId,
    configurationId: selected.public.id,
    deviceLabel: `${selected.public.modelName} · ${selected.public.storage}`,
    range: { min: calculated.min, max: calculated.max, currency: "RUB" },
    validUntil: validUntil.toISOString(),
    pricingVersion: context.config.pricingVersion,
    positiveFactors: calculated.positiveFactors,
    riskFactors: calculated.riskFactors,
  };
}

type TradeQuoteAccess = { testMode?: "exclude" | "only" | "include" };

export async function getTradeQuote(
  quoteId: string,
  access: TradeQuoteAccess = {},
): Promise<TradeQuote> {
  const response = await directusRequest<DirectusResponse<Row>>(
    `/items/trade_quotes/${encodeURIComponent(quoteId)}?fields=id,status,range_min,range_max,currency,valid_until,positive_factors,risk_factors,is_test,device_config.id,device_config.storage,device_config.device_model.id,device_config.device_model.name,pricing_version.version`,
  );
  const row = record(response?.data);
  const config = relation(row.device_config);
  const model = relation(config.device_model);
  if (!text(row.id)) throw new TradeApiError("validation_error", 400);
  const testMode = access.testMode ?? "exclude";
  if (
    (testMode === "only" && !boolean(row.is_test)) ||
    (testMode === "exclude" && boolean(row.is_test))
  ) {
    throw new TradeApiError("validation_error", 400);
  }
  if (text(row.status) !== "active" || isTradeQuoteExpired(text(row.valid_until))) {
    throw new TradeApiError("quote_expired", 409);
  }
  return {
    id: text(row.id),
    status: "active",
    deviceModelId: text(model.id),
    configurationId: text(config.id),
    deviceLabel: `${text(model.name)} · ${text(config.storage)}`,
    range: { min: number(row.range_min), max: number(row.range_max), currency: "RUB" },
    validUntil: text(row.valid_until),
    pricingVersion: text(relation(row.pricing_version).version),
    positiveFactors: Array.isArray(row.positive_factors)
      ? row.positive_factors.filter((item): item is string => typeof item === "string")
      : [],
    riskFactors: Array.isArray(row.risk_factors)
      ? row.risk_factors.filter((item): item is string => typeof item === "string")
      : [],
  };
}

export async function getTradeExchangeOffers(
  quoteId: string,
  requestedStoreId?: string,
  options: TradeContextOptions = {},
  cursor?: string,
) {
  const [quote, config] = await Promise.all([
    getTradeQuote(quoteId, { testMode: options.allowDraft ? "only" : "exclude" }),
    getTradePublicConfig(options),
  ]);
  const storeId = requestedStoreId || config.defaultStoreId;
  if (storeId && !config.stores.some((store) => store.id === storeId))
    throw new TradeApiError("validation_error", 400);
  const products = await getAllPublishedV3ProductCards({ noStore: true });
  const offers: TradeExchangeOffer[] = [];

  for (const product of products) {
    const offer = tradeExchangeOffer(product, storeId, quote.range);
    if (offer) offers.push(offer);
  }

  try {
    return tradeExchangePage(offers, `${quote.id}:${storeId ?? ""}`, cursor);
  } catch (error) {
    if (error instanceof RangeError) throw new TradeApiError("validation_error", 400);
    throw error;
  }
}

export async function validateTradeExchangeSelection(
  quoteId: string,
  productId: string,
  offerId: string,
  storeId?: string,
  options: TradeContextOptions = {},
): Promise<boolean> {
  const [quote, config, product] = await Promise.all([
    getTradeQuote(quoteId, { testMode: options.allowDraft ? "only" : "exclude" }),
    getTradePublicConfig(options),
    getPublishedV3ProductForTrade(productId),
  ]);
  const destination = storeId || config.defaultStoreId;
  if (destination && !config.stores.some((store) => store.id === destination)) return false;
  return Boolean(product && tradeExchangeOffer(product, destination, quote.range, offerId));
}

export async function recordTradeEvent(event: {
  eventName: TradeEventName;
  sessionId: string;
  quoteId?: string;
  scenario?: string;
  step?: string;
  durationMs?: number;
  errorCode?: string;
  isTest?: boolean;
}): Promise<void> {
  await directusRequest("/items/trade_events", {
    method: "POST",
    body: JSON.stringify({
      event_name: event.eventName,
      session_id: event.sessionId,
      quote: event.quoteId || null,
      scenario: event.scenario || null,
      step: event.step || null,
      duration_ms: event.durationMs ?? null,
      error_code: event.errorCode || null,
      is_test: event.isTest === true,
    }),
  });
}
