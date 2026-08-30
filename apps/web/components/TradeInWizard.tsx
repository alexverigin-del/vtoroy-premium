"use client";

import type {
  TradeAnswerValue,
  TradeAnswers,
  TradeContactChannel,
  TradeEventName,
  TradeExchangeOffer,
  TradePublicConfig,
  TradeQuote,
  TradeScenario,
  TradeVisitPeriod,
} from "@vtoroy/shared";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { isValidPhoneNumber, sanitizePhoneInput } from "@/lib/phone";
import type { tradeDeviceGroups } from "@/lib/trade-device-groups";
import { useLeadIntake } from "./useLeadIntake";

type Step =
  | "device"
  | "manual"
  | "condition"
  | "safety"
  | "quote"
  | "expired"
  | "scenario"
  | "exchange"
  | "exchange-empty"
  | "contact"
  | "submitted";

type PersistedState = {
  step: Step;
  deviceModelId: string;
  configurationId: string;
  answers: TradeAnswers;
  quote?: TradeQuote;
  scenario?: TradeScenario;
  selectedOffer?: TradeExchangeOffer;
};

type TradeWizardMode = "public" | "qa";
const PERIOD_LABELS: Record<TradeVisitPeriod, string> = {
  morning: "Утро",
  day: "День",
  evening: "Вечер",
};
const SCENARIO_LABELS: Record<TradeScenario, string> = {
  sale: "Продажа",
  commission_consultation: "Комиссия",
  exchange: "Обмен",
  manual_evaluation: "Ручная оценка",
  stock_notification: "Сообщить о поступлении",
};
const PROGRESS_WIDTHS = {
  1: "w-1/4",
  2: "w-1/2",
  3: "w-3/4",
  4: "w-full",
} as const;
const stickyPrimaryActionClass =
  "focus-ring inline-flex min-h-12 w-full items-center justify-center rounded-pill bg-action-blue px-6 py-3 text-base font-semibold text-white transition hover:bg-action-hover disabled:cursor-wait disabled:opacity-60";
const tradeSelectClass =
  "mt-2 h-16 w-full rounded-input border border-hairline bg-white px-3 text-base text-carbon outline-none focus:border-link-blue focus:ring-2 focus:ring-link-blue/15 disabled:bg-surface";
const tradeTextareaClass =
  "mt-2 min-h-32 w-full resize-none rounded-input border border-hairline bg-white p-3 text-sm leading-6 text-carbon outline-none focus:border-link-blue focus:ring-2 focus:ring-link-blue/15";

function readPersistedState(key: string): Partial<PersistedState> {
  try {
    return JSON.parse(window.sessionStorage.getItem(key) ?? "{}") as Partial<PersistedState>;
  } catch {
    return {};
  }
}

const rubFormatter = new Intl.NumberFormat("ru-RU");

function formatRub(value: number): string {
  return `${rubFormatter.format(value)} ₽`;
}

function quoteAmount(quote: TradeQuote): string {
  return `${rubFormatter.format(quote.range.min)}–${rubFormatter.format(quote.range.max)} ₽`;
}

function expiryLabel(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}

function isExpired(value: string): boolean {
  return new Date(value).getTime() < Date.now();
}

function eventSessionId(mode: TradeWizardMode): string {
  const key = mode === "qa" ? "isvoi.trade.qa.session" : "isvoi.trade.session";
  const current = window.sessionStorage.getItem(key);
  if (current) return current;
  const created = window.crypto.randomUUID();
  window.sessionStorage.setItem(key, created);
  return created;
}

function trackTradeEvent(
  eventName: TradeEventName,
  details: Record<string, string | number | undefined> = {},
  mode: TradeWizardMode = "public",
) {
  if (typeof window === "undefined") return;
  const payload = {
    event_name: eventName,
    session_id: eventSessionId(mode),
    quote_id: details.quote_id,
    scenario: details.scenario,
    step: details.step,
    duration_ms: details.duration_ms,
    error_code: details.error_code,
  };
  window.dispatchEvent(new CustomEvent("isvoi:trade", { detail: payload }));
  void fetch("/api/trade/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => null);
}

function Progress({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <div className="mb-5">
      <p className="text-xs font-medium leading-4 text-muted">Шаг {step} из 4</p>
      <div className="mt-2 h-1 overflow-hidden rounded-sm bg-hairline" aria-hidden="true">
        <div
          className={cn(
            "h-full rounded-sm bg-action-blue transition-all motion-reduce:transition-none",
            PROGRESS_WIDTHS[step],
          )}
        />
      </div>
    </div>
  );
}

function WizardHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3
      tabIndex={-1}
      className="focus-ring scroll-mt-24 text-2xl font-bold leading-tight text-carbon md:text-3xl"
    >
      {children}
    </h3>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-hairline py-3 last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-semibold text-carbon">{children}</dd>
    </div>
  );
}

function StickyAction({
  label,
  onClick,
  disabled,
  secondaryLabel,
  onSecondary,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <div className="sticky bottom-0 z-20 mt-8 border-t border-hairline bg-white/95 px-0 py-4 pb-safe-sticky backdrop-blur md:relative md:-mx-6 md:px-6">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={stickyPrimaryActionClass}
      >
        {label}
      </button>
      {secondaryLabel && onSecondary ? (
        <button
          type="button"
          onClick={onSecondary}
          className="focus-ring mt-2 inline-flex min-h-11 w-full items-center justify-center text-sm font-semibold text-link-blue"
        >
          {secondaryLabel}
        </button>
      ) : null}
    </div>
  );
}

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  const groupName = useId();
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-medium leading-5 text-carbon">{label}</legend>
      <div className="grid auto-cols-fr grid-flow-col gap-1.5">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex min-h-11 cursor-pointer items-center justify-center rounded-input border px-2 text-center text-xs font-medium transition focus-within:shadow-focus",
              value === option.value
                ? "border-action-blue bg-action-blue text-white"
                : "border-hairline bg-white text-carbon hover:border-link-blue",
            )}
          >
            <input
              type="radio"
              name={groupName}
              className="sr-only"
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ContactFields({
  channel,
  onChannel,
  contact,
  onContact,
  error,
}: {
  channel: TradeContactChannel;
  onChannel: (value: TradeContactChannel) => void;
  contact: string;
  onContact: (value: string) => void;
  error?: string;
}) {
  const contactErrorId = "trade-contact-error";
  return (
    <>
      <SegmentedControl
        label="Удобный канал связи"
        value={channel}
        options={[
          { value: "phone", label: "Телефон" },
          { value: "telegram", label: "Telegram" },
        ]}
        onChange={onChannel}
      />
      <label className="block">
        <span className="text-xs font-medium text-muted">
          {channel === "phone" ? "Телефон" : "Telegram"}
        </span>
        <input
          type={channel === "phone" ? "tel" : "text"}
          value={contact}
          onChange={(event) =>
            onContact(
              channel === "phone" ? sanitizePhoneInput(event.target.value) : event.target.value,
            )
          }
          inputMode={channel === "phone" ? "tel" : "text"}
          autoComplete={channel === "phone" ? "tel" : "off"}
          placeholder={channel === "phone" ? "+7 999 123-45-67" : "@username"}
          maxLength={channel === "phone" ? 24 : 180}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? contactErrorId : undefined}
          className="mt-2 h-16 w-full rounded-input border border-hairline bg-white px-3 text-base text-carbon outline-none transition focus:border-link-blue focus:ring-2 focus:ring-link-blue/15"
        />
        {error ? (
          <span id={contactErrorId} role="alert" className="mt-2 block text-sm text-warning">
            {error}
          </span>
        ) : null}
      </label>
    </>
  );
}

function TradeConsent({
  accepted,
  onChange,
  label,
  consentUrl,
}: {
  accepted: boolean;
  onChange: (accepted: boolean) => void;
  label: string;
  consentUrl: string;
}) {
  return (
    <label className="flex min-h-11 gap-2 text-xs">
      <input
        type="checkbox"
        required
        checked={accepted}
        onChange={(event) => onChange(event.target.checked)}
        className="focus-ring mt-1 h-5 w-5"
      />
      <span>
        {label}{" "}
        <a href={consentUrl}>
          <u>Подробнее</u>
        </a>
      </span>
    </label>
  );
}

export function TradeInWizard({
  config,
  deviceGroups,
  mode = "public",
  embedded = false,
}: {
  config: TradePublicConfig;
  deviceGroups: ReturnType<typeof tradeDeviceGroups>;
  mode?: TradeWizardMode;
  embedded?: boolean;
}) {
  const wizardStorageKey = mode === "qa" ? "isvoi.trade.qa.v1" : "isvoi.trade.v1";
  const [restored, setRestored] = useState(false);
  const [step, setStep] = useState<Step>("device");
  const [deviceModelId, setDeviceModelId] = useState("");
  const [configurationId, setConfigurationId] = useState("");
  const [answers, setAnswers] = useState<TradeAnswers>({});
  const [quote, setQuote] = useState<TradeQuote>();
  const [scenario, setScenario] = useState<TradeScenario>();
  const [offers, setOffers] = useState<TradeExchangeOffer[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<TradeExchangeOffer>();
  const [manualDescription, setManualDescription] = useState("");
  const [contactChannel, setContactChannel] = useState<TradeContactChannel>("phone");
  const [contact, setContact] = useState("");
  const [contactError, setContactError] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [storeId, setStoreId] = useState(config.defaultStoreId ?? config.stores[0]?.id ?? "");
  const [visitDate, setVisitDate] = useState("");
  const [visitPeriod, setVisitPeriod] = useState<TradeVisitPeriod>("day");
  const [referenceCode, setReferenceCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [startedAt] = useState(() => Date.now());
  const headingRef = useRef<HTMLDivElement>(null);
  const previousStep = useRef(step);
  const idempotencyKey = useRef("");
  const started = useRef(false);
  const {
    state: leadState,
    submitLead,
    turnstileElementRef,
    turnstileReady,
    turnstileRequired,
  } = useLeadIntake();

  const configurations = config.devices.filter((device) => device.deviceModelId === deviceModelId);
  const selectedConfiguration = config.devices.find((item) => item.id === configurationId);
  const selectedStore = config.stores.find((store) => store.id === storeId);
  const completeAnswers = config.questions.every((question) => Boolean(answers[question.key]));

  const navigate = useCallback((next: Step, replace = false) => {
    setError("");
    setStep(next);
    const method = replace ? "replaceState" : "pushState";
    window.history[method]({ ...(window.history.state ?? {}), tradeStep: next }, "");
  }, []);

  useEffect(() => {
    if (!started.current) {
      started.current = true;
      trackTradeEvent("trade_start", { step: "device" }, mode);
    }
  }, [mode]);

  useEffect(() => {
    const saved = readPersistedState(wizardStorageKey);
    const nextStep = saved.step === "submitted" ? "device" : (saved.step ?? "device");
    previousStep.current = nextStep;
    setStep(nextStep);
    setDeviceModelId(saved.deviceModelId ?? "");
    setConfigurationId(saved.configurationId ?? "");
    setAnswers(saved.answers ?? {});
    setQuote(saved.quote);
    setScenario(saved.scenario);
    setSelectedOffer(saved.selectedOffer);
    setRestored(true);
  }, [wizardStorageKey]);

  useEffect(() => {
    if (!restored) return;
    const state: PersistedState = {
      step,
      deviceModelId,
      configurationId,
      answers,
      quote,
      scenario,
      selectedOffer,
    };
    try {
      window.sessionStorage.setItem(wizardStorageKey, JSON.stringify(state));
    } catch {
      // Storage can be unavailable in private browsing; keep the on-screen state.
    }
    window.history.replaceState({ ...(window.history.state ?? {}), tradeStep: step }, "");
  }, [
    answers,
    configurationId,
    deviceModelId,
    quote,
    scenario,
    selectedOffer,
    step,
    wizardStorageKey,
    restored,
  ]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const historyStep = event.state?.tradeStep as Step | undefined;
      if (historyStep) setStep(historyStep);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!restored) return;
    if (previousStep.current === step) return;
    previousStep.current = step;
    const heading = headingRef.current?.querySelector("h3");
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
  }, [step, restored]);

  async function requestQuote() {
    if (!deviceModelId || !configurationId || !completeAnswers) {
      setError("Ответьте на все вопросы о состоянии устройства.");
      return;
    }
    setLoading(true);
    setError("");
    const response = await fetch("/api/trade/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceModelId,
        configurationId,
        answers,
        previousQuoteId: quote?.id,
      }),
    }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as
      { ok: true; quote: TradeQuote } | { ok: false; error: string } | null;
    setLoading(false);
    if (payload?.ok) {
      setQuote(payload.quote);
      navigate("quote");
      trackTradeEvent("trade_condition_completed", { step: "condition" }, mode);
      trackTradeEvent(
        "trade_quote_shown",
        {
          quote_id: payload.quote.id,
          duration_ms: Date.now() - startedAt,
        },
        mode,
      );
      return;
    }
    const code = payload && !payload.ok ? payload.error : "network_error";
    trackTradeEvent("trade_api_error", { step: "quote", error_code: code }, mode);
    if (code === "safety_stop") navigate("safety");
    else if (code === "manual_evaluation_required") {
      setScenario("manual_evaluation");
      navigate("manual");
    } else setError("Не удалось рассчитать оценку. Проверьте соединение и попробуйте ещё раз.");
  }

  async function openExchange() {
    if (!quote) return;
    if (isExpired(quote.validUntil)) {
      navigate("expired");
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ quote_id: quote.id });
    if (storeId) params.set("store_location_id", storeId);
    const response = await fetch(`/api/trade/exchange?${params}`, { cache: "no-store" }).catch(
      () => null,
    );
    const payload = (await response?.json().catch(() => null)) as
      { ok: true; offers: TradeExchangeOffer[] } | { ok: false; error: string } | null;
    setLoading(false);
    if (payload?.ok) {
      setOffers(payload.offers);
      if (payload.offers.length === 0) navigate("exchange-empty");
      else {
        setSelectedOffer(payload.offers[0]);
        navigate("exchange");
      }
      return;
    }
    if (payload && !payload.ok && payload.error === "quote_expired") navigate("expired");
    else setError("Не удалось загрузить каталог. Попробуйте ещё раз.");
  }

  function chooseScenario(value: TradeScenario) {
    setScenario(value);
    trackTradeEvent("trade_scenario_selected", { scenario: value, quote_id: quote?.id }, mode);
    if (value === "exchange") void openExchange();
    else navigate("contact");
  }

  async function submitTradeLead(manual = false) {
    if (!contact.trim()) {
      setContactError(
        contactChannel === "phone"
          ? "Введите номер телефона."
          : "Укажите Telegram для ответа менеджера.",
      );
      return;
    }
    if (contactChannel === "phone" && !isValidPhoneNumber(contact)) {
      setContactError("Введите корректный номер телефона: от 10 до 15 цифр.");
      return;
    }
    if (manual && !manualDescription.trim()) {
      setError("Коротко опишите устройство и его состояние.");
      return;
    }
    if (!idempotencyKey.current) idempotencyKey.current = window.crypto.randomUUID();
    const result = await submitLead({
      kind: "trade",
      scenario: manual ? "manual_evaluation" : scenario,
      contact,
      contact_channel: contactChannel,
      device: manual ? manualDescription : quote?.deviceLabel,
      quote_id: manual ? undefined : quote?.id,
      target_product_id: scenario === "exchange" ? selectedOffer?.productId : undefined,
      target_offer_id: scenario === "exchange" ? selectedOffer?.offerId : undefined,
      store_location_id: storeId || undefined,
      preferred_visit_date: manual ? undefined : visitDate || undefined,
      preferred_visit_period: manual ? undefined : visitPeriod,
      idempotency_key: idempotencyKey.current,
      trade_consent_accepted: consentAccepted,
      trade_consent_version: config.legal.consentVersion,
      message: manual
        ? "Запрос ручной оценки устройства"
        : "Пожелание по визиту. Точное время должен подтвердить менеджер.",
      source: mode === "qa" ? "/trade/qa" : "/trade",
    });
    if (!result) {
      setError("Не удалось отправить заявку. Данные сохранены на экране — попробуйте ещё раз.");
      return;
    }
    setReferenceCode(result.reference_code ?? "TR—СОХРАНЕНО");
    trackTradeEvent(
      "trade_lead_submitted",
      {
        scenario: manual ? "manual_evaluation" : scenario,
        quote_id: quote?.id,
      },
      mode,
    );
    navigate("submitted");
  }

  const stepNumber: 1 | 2 | 3 | 4 =
    step === "device" || step === "manual"
      ? 1
      : step === "condition" || step === "safety"
        ? 2
        : step === "quote" || step === "expired"
          ? 3
          : 4;

  return (
    <section
      id={embedded ? undefined : "trade-calculator"}
      aria-label="Онлайн-оценка устройства"
      className={cn("scroll-mt-24 bg-white", embedded ? "pb-6 pt-8" : "py-10 md:py-16")}
    >
      <div ref={headingRef} className="mx-auto max-w-form px-6">
        <Progress step={stepNumber} />

        {step === "device" ? (
          <>
            <WizardHeading>Какой смартфон вы хотите оценить?</WizardHeading>
            <p className="mt-2 text-sm leading-5 text-muted">
              Выберите точную конфигурацию — от неё зависит диапазон.
            </p>
            <div className="mt-5 grid gap-3">
              <label>
                <span className="text-xs font-medium text-muted">Модель</span>
                <select
                  aria-label="Модель"
                  value={deviceModelId}
                  onChange={(event) => {
                    setDeviceModelId(event.target.value);
                    setConfigurationId("");
                  }}
                  className={tradeSelectClass}
                >
                  <option value="">Выберите модель</option>
                  {deviceGroups.map((group) => (
                    <optgroup key={group.brand} label={group.brand}>
                      {group.models.map((device) => (
                        <option key={device.id} value={device.id}>
                          {device.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label>
                <span className="text-xs font-medium text-muted">Память</span>
                <select
                  aria-label="Память"
                  value={configurationId}
                  onChange={(event) => setConfigurationId(event.target.value)}
                  disabled={!deviceModelId}
                  className={tradeSelectClass}
                >
                  <option value="">Выберите память</option>
                  {configurations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.storage}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => {
                  setScenario("manual_evaluation");
                  navigate("manual");
                }}
                className="focus-ring min-h-11 text-left text-sm font-semibold text-link-blue"
              >
                Не нашли свою модель?
              </button>
            </div>
            <StickyAction
              label="Продолжить"
              disabled={!deviceModelId || !configurationId}
              onClick={() => {
                if (!deviceModelId || !configurationId) return;
                trackTradeEvent("trade_model_selected", { step: "device" }, mode);
                navigate("condition");
              }}
            />
          </>
        ) : null}

        {step === "manual" ? (
          <>
            <WizardHeading>Оценим устройство вручную</WizardHeading>
            <p className="mt-2 text-sm leading-5 text-muted">
              Не нашли модель. Опишите устройство — менеджер уточнит детали и рассчитает стоимость.
            </p>
            <div className="mt-5 grid gap-3">
              <label>
                <span className="text-xs font-medium text-muted">Опишите устройство</span>
                <textarea
                  value={manualDescription}
                  onChange={(event) => setManualDescription(event.target.value)}
                  placeholder="iPhone 12, 128 ГБ, включается, есть царапины на корпусе"
                  className={tradeTextareaClass}
                />
              </label>
              <ContactFields
                channel={contactChannel}
                onChannel={(value) => {
                  setContactChannel(value);
                  setContactError("");
                }}
                contact={contact}
                onContact={(value) => {
                  setContact(value);
                  setContactError("");
                }}
                error={contactError}
              />
              <p className="text-xs leading-5 text-muted">
                Контакт нужен только для ответа менеджера.
              </p>
              <TradeConsent
                accepted={consentAccepted}
                onChange={setConsentAccepted}
                label={config.legal.consentLabel}
                consentUrl={config.legal.consentUrl}
              />
              {turnstileRequired ? <div ref={turnstileElementRef} /> : null}
            </div>
            {error ? (
              <p role="alert" className="mt-3 text-sm text-warning">
                {error}
              </p>
            ) : null}
            <StickyAction
              label={leadState === "submitting" ? "Отправляем…" : "Отправить на оценку"}
              disabled={leadState === "submitting" || !turnstileReady || !consentAccepted}
              onClick={() => void submitTradeLead(true)}
              secondaryLabel="Вернуться к моделям"
              onSecondary={() => navigate("device")}
            />
          </>
        ) : null}

        {step === "condition" ? (
          <>
            <WizardHeading>В каком состоянии устройство?</WizardHeading>
            <div className="mt-2 flex min-h-11 items-center justify-between gap-3 text-sm font-semibold text-carbon">
              <span>
                {selectedConfiguration
                  ? `${selectedConfiguration.modelName} · ${selectedConfiguration.storage}`
                  : "Устройство"}
              </span>
              <button
                type="button"
                onClick={() => navigate("device")}
                className="focus-ring min-h-11 px-2 text-link-blue"
              >
                Изменить
              </button>
            </div>
            <div className="mt-2 grid gap-2">
              {config.questions.map((question) => (
                <SegmentedControl<TradeAnswerValue>
                  key={question.key}
                  label={question.label}
                  value={answers[question.key]}
                  options={question.options}
                  onChange={(value) =>
                    setAnswers((current) => ({ ...current, [question.key]: value }))
                  }
                />
              ))}
            </div>
            {error ? (
              <p role="alert" className="mt-3 text-sm text-warning">
                {error}
              </p>
            ) : null}
            <StickyAction
              label={loading ? "Рассчитываем…" : "Показать оценку"}
              disabled={loading || !completeAnswers}
              onClick={() => void requestQuote()}
            />
          </>
        ) : null}

        {step === "safety" ? (
          <>
            <div className="rounded-card border border-warning bg-surface p-4">
              <p className="text-sm font-semibold text-warning">Важное предупреждение</p>
              <p className="mt-1 text-xs leading-5 text-carbon">
                Есть признаки повреждения аккумулятора.
              </p>
            </div>
            <div className="mt-4">
              <WizardHeading>Не заряжайте и не пересылайте устройство</WizardHeading>
            </div>
            <p className="mt-2 text-sm text-muted">
              Чтобы безопасно передать устройство, выполните три шага.
            </p>
            <ol className="mt-4 grid gap-3">
              {[
                "Выключите устройство, если это можно сделать без давления на корпус.",
                "Не давите на корпус и не пытайтесь вскрыть устройство.",
                "Свяжитесь с магазином — подскажем безопасный способ передачи.",
              ].map((item, index) => (
                <li
                  key={item}
                  className="flex min-h-16 items-center gap-3 rounded-card bg-surface px-3 py-2.5 text-xs leading-5 text-carbon"
                >
                  <strong className="text-base text-warning">{index + 1}</strong>
                  {item}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs font-medium leading-5 text-warning">
              {config.legal.safetyNotice}
            </p>
            <StickyAction
              label="Связаться с магазином"
              onClick={() => {
                setScenario("manual_evaluation");
                navigate("manual");
              }}
              secondaryLabel="Вернуться к ответам"
              onSecondary={() => navigate("condition")}
            />
          </>
        ) : null}

        {step === "quote" && quote ? (
          <>
            <WizardHeading>Ваша предварительная оценка</WizardHeading>
            <div
              className="mt-4 rounded-card border border-hairline bg-surface p-6"
              aria-live="polite"
            >
              <p className="text-xs font-medium text-muted">Предварительная оценка</p>
              <p className="mt-2 text-3xl font-bold leading-10 text-carbon">{quoteAmount(quote)}</p>
              <p className="mt-2 text-xs leading-5 text-muted">
                Действует до {expiryLabel(quote.validUntil)} · итог подтвердим после диагностики
              </p>
            </div>
            {quote.positiveFactors.length ? (
              <div className="mt-4">
                <p className="text-sm font-semibold text-carbon">Что повысило оценку</p>
                <ul className="mt-2 grid gap-1">
                  {quote.positiveFactors.map((factor) => (
                    <li
                      key={factor}
                      className="flex min-h-11 items-center gap-2 text-sm text-carbon"
                    >
                      <strong className="text-success">↑</strong>
                      {factor}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {quote.riskFactors.length ? (
              <div className="mt-3">
                <p className="text-sm font-semibold text-carbon">Что может её изменить</p>
                <ul className="mt-2 grid gap-1">
                  {quote.riskFactors.map((factor) => (
                    <li
                      key={factor}
                      className="flex min-h-11 items-center gap-2 text-sm text-carbon"
                    >
                      <strong className="text-warning">•</strong>
                      {factor}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => navigate("condition")}
              className="focus-ring mt-3 min-h-11 text-sm font-semibold text-link-blue"
            >
              Изменить ответы
            </button>
            <StickyAction
              label="Выбрать способ сделки"
              onClick={() =>
                isExpired(quote.validUntil) ? navigate("expired") : navigate("scenario")
              }
            />
          </>
        ) : null}

        {step === "expired" && quote ? (
          <>
            <WizardHeading>Оценка устарела</WizardHeading>
            <p className="mt-2 text-sm leading-5 text-muted">
              Старый диапазон сохранили как ориентир — продолжить с ним нельзя.
            </p>
            <div className="mt-4 rounded-card border border-warning bg-surface p-6">
              <p className="text-xs text-muted">Оценка устарела</p>
              <p className="mt-2 text-3xl font-bold leading-10 text-warning">
                было {quoteAmount(quote)}
              </p>
              <p className="mt-2 text-xs text-muted">Предложение больше не действует</p>
            </div>
            <div className="mt-3 rounded-card border border-warning bg-surface p-4">
              <p className="text-sm font-semibold text-warning">Цены изменились</p>
              <p className="mt-1 text-xs text-carbon">Повторим расчёт с сохранёнными ответами.</p>
            </div>
            <p className="mt-4 text-sm text-muted">
              Модель, память и ответы о состоянии уже сохранены — заполнять заново не нужно.
            </p>
            {error ? (
              <p role="alert" className="mt-3 text-sm text-warning">
                {error}
              </p>
            ) : null}
            <StickyAction
              label={loading ? "Обновляем…" : "Обновить оценку"}
              disabled={loading}
              onClick={() => void requestQuote()}
              secondaryLabel="Изменить ответы"
              onSecondary={() => navigate("condition")}
            />
          </>
        ) : null}

        {step === "scenario" ? (
          <>
            <WizardHeading>Как поступить с устройством?</WizardHeading>
            <p className="mt-2 text-sm text-muted">
              Выбор не фиксируется заранее — сравните варианты.
            </p>
            <div className="mt-4 grid gap-3">
              {[
                ["sale", "Продать", "Деньги после диагностики"],
                [
                  "commission_consultation",
                  "Передать на комиссию",
                  "Условия и ожидаемую сумму рассчитаем индивидуально после диагностики",
                ],
                ["exchange", "Обменять", "Реальный каталог и ориентир доплаты"],
              ].map(([value, title, description]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => chooseScenario(value as TradeScenario)}
                  className="focus-ring flex min-h-trade-option items-center gap-3 rounded-card border border-hairline bg-white p-4 text-left transition hover:border-link-blue"
                >
                  <span
                    className="h-5 w-5 shrink-0 rounded-full border border-hairline"
                    aria-hidden="true"
                  />
                  <span>
                    <strong className="block text-base text-carbon">{title}</strong>
                    <span className="mt-0.5 block text-xs leading-5 text-muted">
                      {description}
                      <br />
                      <span className="text-link-blue">Выбрать →</span>
                    </span>
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setScenario("stock_notification");
                  navigate("exchange-empty");
                }}
                className="focus-ring min-h-11 text-left text-sm font-semibold text-link-blue"
              >
                Нет подходящего товара сейчас?
              </button>
              <p className="text-xs text-muted">Сценарий можно изменить до отправки заявки.</p>
            </div>
          </>
        ) : null}

        {step === "exchange" && quote ? (
          <>
            <WizardHeading>Выберите устройство для обмена</WizardHeading>
            <div className="mt-3 rounded-card border border-hairline bg-surface p-5">
              <p className="text-xs text-muted">Ваш Trade‑in quote</p>
              <p className="mt-1 text-3xl font-bold text-carbon">{quoteAmount(quote)}</p>
              <p className="mt-1 text-xs text-muted">
                До {expiryLabel(quote.validUntil)} · итог после диагностики
              </p>
            </div>
            <div className="mt-3 grid max-h-trade-list gap-3 overflow-y-auto pr-1">
              {offers.map((offer) => (
                <button
                  key={offer.offerId}
                  type="button"
                  onClick={() => setSelectedOffer(offer)}
                  className={cn(
                    "focus-ring rounded-card border p-4 text-left",
                    selectedOffer?.offerId === offer.offerId
                      ? "border-action-blue bg-ice"
                      : "border-hairline bg-white",
                  )}
                >
                  {selectedOffer?.offerId === offer.offerId ? (
                    <span className="text-caption font-bold uppercase text-link-blue">Выбрано</span>
                  ) : null}
                  <strong className="mt-1 block text-lg text-carbon">{offer.title}</strong>
                  <span className="mt-1 block text-sm text-muted">
                    {offer.location.name} ·{" "}
                    {offer.fulfillment === "pickup" ? "самовывоз" : "доставка"}
                  </span>
                  <span className="mt-2 block text-lg font-semibold text-carbon">
                    {offer.priceText}
                  </span>
                  <span className="mt-2 block text-sm font-semibold text-link-blue">
                    Доплата {formatRub(offer.topUpRange.from)}–{formatRub(offer.topUpRange.to)}
                  </span>
                </button>
              ))}
            </div>
            <StickyAction
              label={loading ? "Проверяем…" : "Продолжить с этим устройством"}
              disabled={!selectedOffer || loading}
              onClick={() => navigate("contact")}
              secondaryLabel="Вернуться к вариантам"
              onSecondary={() => navigate("scenario")}
            />
          </>
        ) : null}

        {step === "exchange-empty" ? (
          <>
            <WizardHeading>Сейчас нет подходящих устройств</WizardHeading>
            <p className="mt-2 text-sm leading-5 text-muted">
              Оставьте заявку — сообщим, когда появится подходящий вариант, или выберите продажу.
            </p>
            <div className="mt-4 flex min-h-path-card flex-col items-center justify-center rounded-card bg-surface p-6 text-center">
              <span className="h-16 w-16 rounded-full border border-hairline bg-white" />
              <strong className="mt-4 text-lg text-carbon">Каталог обновляется</strong>
              <p className="mt-2 text-sm text-muted">
                Не показываем неактивные или уже проданные предложения.
              </p>
            </div>
            <div className="mt-3 rounded-card border border-action-blue bg-white p-4">
              <p className="text-sm font-semibold text-link-blue">Что произойдёт дальше</p>
              <p className="mt-1 text-xs leading-5 text-carbon">
                Менеджер свяжется только при появлении подходящего варианта.
              </p>
            </div>
            <StickyAction
              label="Сообщить о поступлении"
              onClick={() => {
                setScenario("stock_notification");
                navigate("contact");
              }}
              secondaryLabel="Выбрать продажу"
              onSecondary={() => {
                setScenario("sale");
                navigate("contact");
              }}
            />
          </>
        ) : null}

        {step === "contact" ? (
          <>
            <WizardHeading>
              {scenario === "stock_notification" ? "Оставьте контакт" : "Запишитесь на диагностику"}
            </WizardHeading>
            <p className="mt-2 text-sm leading-5 text-muted">
              Оставьте удобный канал и пожелание по времени — точный визит подтвердит менеджер.
            </p>
            <div className="mt-4 grid gap-3">
              <ContactFields
                channel={contactChannel}
                onChannel={(value) => {
                  setContactChannel(value);
                  setContactError("");
                }}
                contact={contact}
                onContact={(value) => {
                  setContact(value);
                  setContactError("");
                }}
                error={contactError}
              />
              {config.stores.length ? (
                <label>
                  <span className="text-xs font-medium text-muted">Магазин</span>
                  <select
                    value={storeId}
                    onChange={(event) => setStoreId(event.target.value)}
                    className="mt-2 h-16 w-full rounded-input border border-hairline bg-white px-3 text-base text-carbon outline-none focus:border-link-blue"
                  >
                    {config.stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {scenario !== "stock_notification" ? (
                <>
                  <label>
                    <span className="text-xs font-medium text-muted">Желаемый день</span>
                    <input
                      type="date"
                      value={visitDate}
                      min={new Date().toISOString().slice(0, 10)}
                      onChange={(event) => setVisitDate(event.target.value)}
                      className="mt-2 h-16 w-full rounded-input border border-hairline bg-white px-3 text-base text-carbon outline-none focus:border-link-blue"
                    />
                  </label>
                  <SegmentedControl
                    label="Удобный период"
                    value={visitPeriod}
                    options={Object.entries(PERIOD_LABELS).map(([value, label]) => ({
                      value: value as TradeVisitPeriod,
                      label,
                    }))}
                    onChange={setVisitPeriod}
                  />
                </>
              ) : null}
              <p className="text-xs leading-5 text-muted">
                Точное время подтвердит менеджер. При ошибке отправки введённые данные сохранятся.
              </p>
              <TradeConsent
                accepted={consentAccepted}
                onChange={setConsentAccepted}
                label={config.legal.consentLabel}
                consentUrl={config.legal.consentUrl}
              />
              {turnstileRequired ? <div ref={turnstileElementRef} /> : null}
            </div>
            {error ? (
              <p role="alert" className="mt-3 text-sm text-warning">
                {error}
              </p>
            ) : null}
            <StickyAction
              label={leadState === "submitting" ? "Отправляем…" : "Отправить заявку"}
              disabled={leadState === "submitting" || !turnstileReady || !consentAccepted}
              onClick={() => void submitTradeLead()}
              secondaryLabel="Изменить сценарий"
              onSecondary={() => navigate("scenario")}
            />
          </>
        ) : null}

        {step === "submitted" ? (
          <>
            <div className="rounded-card border border-success bg-surface p-4">
              <p className="text-sm font-semibold text-success">Заявка принята</p>
              <p className="mt-1 text-xs leading-5 text-carbon">
                Мы сохранили выбранный сценарий и пожелание по визиту.
              </p>
            </div>
            <div className="mt-4">
              <WizardHeading>Заявка отправлена</WizardHeading>
            </div>
            <p className="mt-3 text-sm text-muted">Номер заявки</p>
            <p className="mt-2 text-3xl font-bold text-carbon">{referenceCode}</p>
            <dl className="mt-4 rounded-card bg-surface p-4 text-sm">
              <SummaryRow label="Сценарий">
                {scenario ? SCENARIO_LABELS[scenario] : "Trade‑in"}
              </SummaryRow>
              <SummaryRow label="Устройство">
                {quote?.deviceLabel || manualDescription || "Уточнит менеджер"}
              </SummaryRow>
              {quote ? <SummaryRow label="Оценка">{quoteAmount(quote)}</SummaryRow> : null}
              {selectedStore ? <SummaryRow label="Магазин">{selectedStore.name}</SummaryRow> : null}
              <SummaryRow label="Связь">
                {contactChannel === "phone" ? "Телефон" : "Telegram"} · {contact}
              </SummaryRow>
            </dl>
            <p className="mt-4 text-sm leading-5 text-carbon">
              Менеджер подтвердит детали по выбранному каналу. Пожелание по времени пока не является
              подтверждённой записью.
            </p>
            <StickyAction
              label="Вернуться на сайт"
              onClick={() => {
                window.sessionStorage.removeItem(wizardStorageKey);
                window.location.assign("/");
              }}
              secondaryLabel="Скопировать номер заявки"
              onSecondary={() => void navigator.clipboard.writeText(referenceCode)}
            />
          </>
        ) : null}
      </div>
    </section>
  );
}
