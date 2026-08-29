export type TradeAnswerValue = "yes" | "no" | "unknown";

export type TradeQuestionKey =
  | "powers_on"
  | "display_works"
  | "hardware_works"
  | "has_damage"
  | "was_repaired"
  | "battery_risk"
  | "account_removed";

export type TradeScenario =
  "sale" | "commission_consultation" | "exchange" | "manual_evaluation" | "stock_notification";

export type TradeVisitPeriod = "morning" | "day" | "evening";
export type TradeContactChannel = "phone" | "telegram";

export interface TradeAnswerOption {
  value: TradeAnswerValue;
  label: string;
}

export interface TradeQuestion {
  key: TradeQuestionKey;
  label: string;
  helpText?: string;
  options: TradeAnswerOption[];
}

export interface TradeDeviceConfiguration {
  id: string;
  deviceModelId: string;
  modelSlug: string;
  modelName: string;
  storage: string;
  sort: number;
}

export interface TradeStoreOption {
  id: string;
  slug: string;
  name: string;
  city: string;
}

export interface TradePublicConfig {
  active: boolean;
  contractVersion: 1;
  pricingVersion: string;
  quoteValidityDays: number;
  devices: TradeDeviceConfiguration[];
  questions: TradeQuestion[];
  stores: TradeStoreOption[];
  defaultStoreId?: string;
}

export type TradeAnswers = Partial<Record<TradeQuestionKey, TradeAnswerValue>>;

export interface TradeQuoteRequest {
  deviceModelId: string;
  configurationId: string;
  answers: TradeAnswers;
  previousQuoteId?: string;
}

export interface TradeQuoteRange {
  min: number;
  max: number;
  currency: "RUB";
}

export interface TradeQuote {
  id: string;
  status: "active" | "expired" | "superseded";
  deviceModelId: string;
  configurationId: string;
  deviceLabel: string;
  range: TradeQuoteRange;
  validUntil: string;
  pricingVersion: string;
  positiveFactors: string[];
  riskFactors: string[];
}

export interface TradeExchangeOffer {
  productId: string;
  offerId: string;
  title: string;
  detailHref: string;
  image?: string;
  imageAlt: string;
  price: number;
  priceText: string;
  location: TradeStoreOption;
  fulfillment: "pickup" | "intercity_delivery";
  deliveryEstimate?: string;
  topUpRange: {
    from: number;
    to: number;
  };
}

export type TradeEventName =
  | "trade_start"
  | "trade_model_selected"
  | "trade_condition_completed"
  | "trade_quote_shown"
  | "trade_scenario_selected"
  | "trade_lead_submitted"
  | "trade_diagnostics_completed"
  | "trade_final_offer_accepted"
  | "trade_api_error";
