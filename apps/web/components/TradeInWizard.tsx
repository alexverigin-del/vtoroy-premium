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
import { cn } from "@/lib/cn-client";
import { isValidPhoneNumber, sanitizePhoneInput } from "@/lib/phone";
import type { tradeDeviceGroups } from "@/lib/trade-device-groups";
import {
  resolveTradeStep,
  restoreTradeState,
  tradeBackStep,
  tradeInputKey,
  tradeQuoteExpired,
  type TradeStep as Step,
  type TradeWizardSnapshot as PersistedState,
} from "@/lib/trade-wizard-navigation";
import { useLeadIntake } from "./useLeadIntake";

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

function eventSessionId(mode: TradeWizardMode): string {
  const key = mode === "qa" ? "isvoi.trade.qa.session" : "isvoi.trade.session";
  const created = window.crypto.randomUUID();
  try {
    const current = window.sessionStorage.getItem(key);
    if (current) return current;
    window.sessionStorage.setItem(key, created);
  } catch {
    // Analytics must not prevent using the calculator with storage disabled.
  }
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
  const [quoteInputKey, setQuoteInputKey] = useState<string>();
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
  const startedAt = useRef(Date.now());
  const runId = useRef("");
  const trail = useRef<Step[]>(["device"]);
  const historyIndex = useRef(0);
  const pendingHistory = useRef(false);
  const request = useRef<AbortController>();
  const submitting = useRef(false);
  const previousQuoteId = useRef<string>();
  const resetDialog = useRef<HTMLDialogElement>(null);
  const resetCancel = useRef<HTMLButtonElement>(null);
  const resetTrigger = useRef<HTMLButtonElement>(null);
  const [notice, setNotice] = useState("");
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
    resetState: resetLeadState,
    resetTurnstile,
  } = useLeadIntake();

  const configurations = config.devices.filter((device) => device.deviceModelId === deviceModelId);
  const selectedConfiguration = config.devices.find((item) => item.id === configurationId);
  const selectedStore = config.stores.find((store) => store.id === storeId);
  const completeAnswers = config.questions.every((question) =>
    question.options.some((option) => option.value === answers[question.key]),
  );
  const snapshot = useRef<PersistedState>({
    runId: "",
    step,
    deviceModelId,
    configurationId,
    answers,
  });
  snapshot.current = {
    runId: runId.current,
    step,
    deviceModelId,
    configurationId,
    answers,
    quote,
    quoteInputKey,
    scenario,
  };
  const hasProgress = Boolean(
    deviceModelId ||
    configurationId ||
    Object.keys(answers).length ||
    contact ||
    manualDescription ||
    step !== "device",
  );

  const cancelRequest = useCallback(() => {
    request.current?.abort();
    request.current = undefined;
    setLoading(false);
  }, []);

  const writeHistory = useCallback(
    (next: Step, replace = false) => {
      window.history[replace ? "replaceState" : "pushState"](
        {
          ...(window.history.state ?? {}),
          tradeStep: next,
          tradeWizard: {
            runId: runId.current,
            mode,
            index: historyIndex.current,
            trail: trail.current,
          },
        },
        "",
      );
    },
    [mode],
  );

  const navigate = useCallback(
    (next: Step, replace = false) => {
      if (submitting.current || snapshot.current.step === "submitted") return;
      cancelRequest();
      setError("");
      setContactError("");
      if (!replace && next === snapshot.current.step) return;
      if (replace) trail.current[historyIndex.current] = next;
      else {
        trail.current = [...trail.current.slice(0, historyIndex.current + 1), next];
        historyIndex.current += 1;
      }
      snapshot.current.step = next;
      setStep(next);
      writeHistory(next, replace);
    },
    [cancelRequest, writeHistory],
  );

  function goBackTo(target?: Step) {
    if (submitting.current || pendingHistory.current || step === "submitted") return;
    cancelRequest();
    const destination =
      target ?? trail.current[historyIndex.current - 1] ?? tradeBackStep(step, scenario);
    const index = trail.current.slice(0, historyIndex.current).lastIndexOf(destination);
    if (index >= 0 && window.history.state?.tradeWizard?.runId === runId.current) {
      pendingHistory.current = true;
      window.history.go(index - historyIndex.current);
    } else
      navigate(
        resolveTradeStep(destination, snapshot.current, config, Boolean(selectedOffer)),
        true,
      );
  }

  function invalidateQuote() {
    cancelRequest();
    if (quote) previousQuoteId.current = quote.id;
    setQuote(undefined);
    setQuoteInputKey(undefined);
    setScenario(undefined);
    setOffers([]);
    setSelectedOffer(undefined);
    setError("");
    if (quote) setNotice("Данные изменились. Рассчитаем оценку заново.");
  }

  function startNewEvaluation() {
    if (submitting.current) return;
    cancelRequest();
    resetDialog.current?.close();
    runId.current = window.crypto.randomUUID();
    idempotencyKey.current = runId.current;
    previousQuoteId.current = undefined;
    startedAt.current = Date.now();
    trail.current = ["device"];
    historyIndex.current = 0;
    pendingHistory.current = false;
    setDeviceModelId("");
    setConfigurationId("");
    setAnswers({});
    setQuote(undefined);
    setQuoteInputKey(undefined);
    setScenario(undefined);
    setOffers([]);
    setSelectedOffer(undefined);
    setManualDescription("");
    setContactChannel("phone");
    setContact("");
    setContactError("");
    setConsentAccepted(false);
    setVisitDate("");
    setVisitPeriod("day");
    setStoreId(config.defaultStoreId ?? config.stores[0]?.id ?? "");
    setReferenceCode("");
    setError("");
    setNotice("Новая оценка. Выберите устройство.");
    resetLeadState();
    resetTurnstile();
    snapshot.current = {
      runId: runId.current,
      step: "device",
      deviceModelId: "",
      configurationId: "",
      answers: {},
    };
    try {
      window.sessionStorage.setItem(wizardStorageKey, JSON.stringify(snapshot.current));
      window.sessionStorage.setItem(
        mode === "qa" ? "isvoi.trade.qa.session" : "isvoi.trade.session",
        runId.current,
      );
    } catch {
      /* On-screen reset works even when browser storage is unavailable. */
    }
    writeHistory("device", true);
    setStep("device");
    // Reset from the first step also needs a focus move.
    window.requestAnimationFrame(() =>
      headingRef.current?.querySelector("h3")?.focus({ preventScroll: true }),
    );
    trackTradeEvent("trade_start", { step: "device" }, mode);
  }

  useEffect(() => {
    if (!started.current) {
      started.current = true;
      trackTradeEvent("trade_start", { step: "device" }, mode);
    }
  }, [mode]);

  useEffect(() => {
    const saved = restoreTradeState(
      readPersistedState(wizardStorageKey),
      config,
      window.crypto.randomUUID(),
    );
    const nextStep = saved.step;
    runId.current = saved.runId;
    idempotencyKey.current = saved.runId;
    const history = window.history.state?.tradeWizard;
    if (
      history?.runId === saved.runId &&
      history.mode === mode &&
      Array.isArray(history.trail) &&
      Number.isInteger(history.index) &&
      history.index >= 0 &&
      history.index < history.trail.length
    ) {
      trail.current = history.trail;
      historyIndex.current = history.index;
      trail.current[historyIndex.current] = nextStep;
    } else {
      trail.current = [nextStep];
      historyIndex.current = 0;
    }
    previousStep.current = nextStep;
    setStep(nextStep);
    setDeviceModelId(saved.deviceModelId ?? "");
    setConfigurationId(saved.configurationId ?? "");
    setAnswers(saved.answers ?? {});
    setQuote(saved.quote);
    setQuoteInputKey(saved.quoteInputKey);
    setScenario(saved.scenario);
    writeHistory(nextStep, true);
    setRestored(true);
  }, [wizardStorageKey, config, mode, writeHistory]);

  useEffect(() => {
    if (!restored) return;
    const state: PersistedState = {
      runId: runId.current,
      step,
      deviceModelId,
      configurationId,
      answers,
      quote,
      quoteInputKey,
      scenario,
    };
    try {
      window.sessionStorage.setItem(wizardStorageKey, JSON.stringify(state));
    } catch {
      // Storage can be unavailable in private browsing; keep the on-screen state.
    }
  }, [
    answers,
    configurationId,
    deviceModelId,
    quote,
    quoteInputKey,
    scenario,
    step,
    wizardStorageKey,
    restored,
  ]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      pendingHistory.current = false;
      cancelRequest();
      resetDialog.current?.close();
      const history = event.state?.tradeWizard;
      const sameRun = history?.runId === runId.current && history.mode === mode;
      const validTrail =
        sameRun &&
        Array.isArray(history.trail) &&
        Number.isInteger(history.index) &&
        history.index >= 0 &&
        history.index < history.trail.length;
      // An old browser entry may move the cursor, but cannot restore its old run.
      const next =
        submitting.current || !validTrail
          ? snapshot.current.step
          : resolveTradeStep(
              event.state.tradeStep,
              snapshot.current,
              config,
              Boolean(selectedOffer),
            );
      if (validTrail && !submitting.current) {
        trail.current = history.trail;
        historyIndex.current = history.index;
      } else {
        trail.current = [next];
        historyIndex.current = 0;
      }
      trail.current[historyIndex.current] = next;
      snapshot.current.step = next;
      setStep(next);
      setError("");
      setContactError("");
      writeHistory(next, true);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [cancelRequest, config, mode, selectedOffer, writeHistory]);

  useEffect(() => () => request.current?.abort(), []);

  useEffect(() => {
    if (
      !quote ||
      !["quote", "scenario", "exchange", "exchange-empty", "contact"].includes(step) ||
      leadState === "submitting"
    )
      return;
    const check = () => {
      if (tradeQuoteExpired(quote)) navigate("expired", true);
    };
    check();
    const timer = window.setTimeout(
      check,
      Math.min(Math.max(0, Date.parse(quote.validUntil) - Date.now() + 1), 2147483647),
    );
    window.addEventListener("focus", check);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", check);
    };
  }, [quote, step, navigate, leadState]);

  useEffect(() => {
    if (!restored) return;
    if (previousStep.current === step) return;
    previousStep.current = step;
    const heading = headingRef.current?.querySelector("h3");
    heading?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
  }, [step, restored]);

  async function requestQuote() {
    if (request.current || submitting.current) return;
    if (!deviceModelId || !configurationId || !completeAnswers) {
      setError("Ответьте на все вопросы о состоянии устройства.");
      return;
    }
    const inputKey = tradeInputKey(deviceModelId, configurationId, answers);
    if (quote && quoteInputKey === inputKey && !tradeQuoteExpired(quote)) {
      navigate("quote");
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    const response = await fetch("/api/trade/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        deviceModelId,
        configurationId,
        answers,
        previousQuoteId: quote?.id ?? previousQuoteId.current,
      }),
    }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as
      { ok: true; quote: TradeQuote } | { ok: false; error: string } | null;
    if (request.current !== controller || controller.signal.aborted) return;
    request.current = undefined;
    setLoading(false);
    if (payload?.ok) {
      setQuote(payload.quote);
      setQuoteInputKey(inputKey);
      previousQuoteId.current = payload.quote.id;
      setNotice("");
      navigate("quote");
      trackTradeEvent("trade_condition_completed", { step: "condition" }, mode);
      trackTradeEvent(
        "trade_quote_shown",
        {
          quote_id: payload.quote.id,
          duration_ms: Date.now() - startedAt.current,
        },
        mode,
      );
      return;
    }
    const code = payload && !payload.ok ? payload.error : "network_error";
    trackTradeEvent("trade_api_error", { step: "quote", error_code: code }, mode);
    if (code === "safety_stop") {
      setQuote(undefined);
      setQuoteInputKey(inputKey);
      navigate("safety");
    } else if (code === "manual_evaluation_required") {
      setScenario("manual_evaluation");
      navigate("manual");
    } else setError("Не удалось рассчитать оценку. Проверьте соединение и попробуйте ещё раз.");
  }

  async function openExchange(replace = false) {
    if (!quote || request.current || submitting.current) return;
    if (tradeQuoteExpired(quote)) {
      navigate("expired");
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ quote_id: quote.id });
    if (storeId) params.set("store_location_id", storeId);
    const response = await fetch(`/api/trade/exchange?${params}`, {
      cache: "no-store",
      signal: controller.signal,
    }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as
      { ok: true; offers: TradeExchangeOffer[] } | { ok: false; error: string } | null;
    if (request.current !== controller || controller.signal.aborted) return;
    request.current = undefined;
    setLoading(false);
    if (payload?.ok) {
      setOffers(payload.offers);
      if (payload.offers.length === 0) {
        setSelectedOffer(undefined);
        navigate("exchange-empty", replace);
      } else {
        setSelectedOffer(
          (current) =>
            payload.offers.find((offer) => offer.offerId === current?.offerId) ?? payload.offers[0],
        );
        navigate("exchange", replace);
      }
      return;
    }
    if (payload && !payload.ok && payload.error === "quote_expired") {
      setQuote({ ...quote, status: "expired" });
      navigate("expired");
    } else setError("Не удалось загрузить каталог. Попробуйте ещё раз.");
  }

  function chooseScenario(value: TradeScenario) {
    if (loading || submitting.current) return;
    if (!quote || tradeQuoteExpired(quote)) {
      navigate(quote ? "expired" : "condition");
      return;
    }
    if (value !== "exchange") setSelectedOffer(undefined);
    setScenario(value);
    trackTradeEvent("trade_scenario_selected", { scenario: value, quote_id: quote?.id }, mode);
    if (value === "exchange") void openExchange();
    else navigate("contact");
  }

  async function submitTradeLead(manual = false) {
    if (submitting.current || step === "submitted" || !consentAccepted || !turnstileReady) return;
    if (!manual && (!quote || tradeQuoteExpired(quote))) {
      navigate(quote ? "expired" : "condition");
      return;
    }
    if (!manual && scenario === "exchange" && !selectedOffer) {
      navigate("exchange");
      return;
    }
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
    submitting.current = true;
    setError("");
    let submissionError = "network_error";
    const result = await submitLead(
      {
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
      },
      (code) => {
        submissionError = code;
      },
    );
    submitting.current = false;
    if (!result) {
      if (submissionError === "quote_expired" && quote) {
        setQuote({ ...quote, status: "expired" });
        navigate("expired");
        return;
      }
      if (submissionError === "product_unavailable") {
        setSelectedOffer(undefined);
        setOffers([]);
        setNotice(
          "Выбранное устройство больше недоступно. Выберите другое — ваши контакты сохранены на экране.",
        );
        navigate("exchange");
        return;
      }
      setError("Не удалось отправить заявку. Данные сохранены на экране — попробуйте ещё раз.");
      return;
    }
    setReferenceCode(result.reference_code ?? "TR—СОХРАНЕНО");
    if (manual) {
      setQuote(undefined);
      setQuoteInputKey(undefined);
      setSelectedOffer(undefined);
    }
    trackTradeEvent(
      "trade_lead_submitted",
      {
        scenario: manual ? "manual_evaluation" : scenario,
        quote_id: manual ? undefined : quote?.id,
      },
      mode,
    );
    navigate("submitted");
  }

  // Restored exchange offers are fetched again: sessionStorage is not stock authority.
  useEffect(() => {
    if (restored && step === "exchange" && !offers.length && !loading && !error)
      void openExchange(true);
    // openExchange is intentionally invoked only on entry, not on each loading update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, step]);

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
      <fieldset
        disabled={leadState === "submitting"}
        className="min-w-0 border-0 p-0"
        aria-label="Шаги оценки"
      >
        <div ref={headingRef} className="mx-auto max-w-form scroll-mt-24 px-6">
          {step !== "submitted" && (step !== "device" || hasProgress) ? (
            <nav
              aria-label="Навигация оценки"
              className="mb-3 flex min-h-11 items-center justify-between gap-4"
            >
              {step !== "device" ? (
                <button
                  type="button"
                  onClick={() => goBackTo()}
                  className="focus-ring min-h-11 px-2 text-sm font-semibold text-link-blue"
                >
                  ← Назад
                </button>
              ) : (
                <span />
              )}
              <button
                ref={resetTrigger}
                type="button"
                onClick={() => {
                  resetDialog.current?.showModal();
                  resetCancel.current?.focus();
                }}
                className="focus-ring min-h-11 px-2 text-sm font-semibold text-muted"
              >
                Начать заново
              </button>
            </nav>
          ) : null}
          <Progress step={stepNumber} />
          <p
            role="status"
            aria-live="polite"
            className={notice ? "mb-4 text-sm leading-5 text-muted" : "sr-only"}
          >
            {notice}
          </p>
          {loading ? (
            <p role="status" className="mb-3 text-sm text-muted">
              {step === "condition" || step === "expired"
                ? "Рассчитываем оценку…"
                : "Проверяем доступные устройства…"}
            </p>
          ) : null}

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
                      if (event.target.value === deviceModelId) return;
                      invalidateQuote();
                      setDeviceModelId(event.target.value);
                      setConfigurationId("");
                      setAnswers({});
                      setNotice(
                        deviceModelId
                          ? "Модель изменена. Подтвердите состояние этого устройства заново."
                          : "",
                      );
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
                    onChange={(event) => {
                      invalidateQuote();
                      setConfigurationId(event.target.value);
                    }}
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
                Не нашли модель. Опишите устройство — менеджер уточнит детали и рассчитает
                стоимость.
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
                onSecondary={() => goBackTo("device")}
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
                  onClick={() => goBackTo("device")}
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
                    onChange={(value) => {
                      if (value === answers[question.key]) return;
                      invalidateQuote();
                      setAnswers((current) => ({ ...current, [question.key]: value }));
                    }}
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
                onSecondary={() => goBackTo("condition")}
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
                <p className="mt-2 text-3xl font-bold leading-10 text-carbon">
                  {quoteAmount(quote)}
                </p>
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
                onClick={() => goBackTo("condition")}
                className="focus-ring mt-3 min-h-11 text-sm font-semibold text-link-blue"
              >
                Изменить ответы
              </button>
              <button
                type="button"
                onClick={() => goBackTo("device")}
                className="focus-ring ml-4 mt-3 min-h-11 text-sm font-semibold text-link-blue"
              >
                Изменить устройство
              </button>
              <StickyAction
                label="Выбрать способ сделки"
                onClick={() =>
                  tradeQuoteExpired(quote) ? navigate("expired") : navigate("scenario")
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
                onSecondary={() => goBackTo("condition")}
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
                    disabled={loading}
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
                {error ? (
                  <p role="alert" className="text-sm text-warning">
                    {error}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}

          {step === "exchange" && quote ? (
            <>
              <WizardHeading>Выберите устройство для обмена</WizardHeading>
              <div className="mt-3 rounded-card border border-hairline bg-surface p-5">
                <p className="text-xs text-muted">Ваша предварительная оценка</p>
                <p className="mt-1 text-3xl font-bold text-carbon">{quoteAmount(quote)}</p>
                <p className="mt-1 text-xs text-muted">
                  До {expiryLabel(quote.validUntil)} · итог после диагностики
                </p>
              </div>
              {error ? (
                <div className="mt-3">
                  <p role="alert" className="text-sm text-warning">
                    {error}
                  </p>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void openExchange(true)}
                    className="focus-ring min-h-11 text-sm font-semibold text-link-blue"
                  >
                    Повторить загрузку каталога
                  </button>
                </div>
              ) : null}
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
                      <span className="text-caption font-bold uppercase text-link-blue">
                        Выбрано
                      </span>
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
                onClick={() =>
                  tradeQuoteExpired(quote) ? navigate("expired") : navigate("contact")
                }
                secondaryLabel="Вернуться к вариантам"
                onSecondary={() => goBackTo("scenario")}
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
                {scenario === "stock_notification"
                  ? "Оставьте контакт"
                  : "Запишитесь на диагностику"}
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
                      onChange={(event) => {
                        setStoreId(event.target.value);
                        if (scenario === "exchange") {
                          setSelectedOffer(undefined);
                          setOffers([]);
                          navigate("exchange");
                        }
                      }}
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
                onSecondary={() => goBackTo("scenario")}
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
                {selectedStore ? (
                  <SummaryRow label="Магазин">{selectedStore.name}</SummaryRow>
                ) : null}
                <SummaryRow label="Связь">
                  {contactChannel === "phone" ? "Телефон" : "Telegram"} · {contact}
                </SummaryRow>
              </dl>
              <p className="mt-4 text-sm leading-5 text-carbon">
                Менеджер подтвердит детали по выбранному каналу. Пожелание по времени пока не
                является подтверждённой записью.
              </p>
              <StickyAction
                label="Оценить другое устройство"
                onClick={startNewEvaluation}
                secondaryLabel="Скопировать номер заявки"
                onSecondary={() => void navigator.clipboard.writeText(referenceCode)}
              />
            </>
          ) : null}
        </div>
      </fieldset>
      <dialog
        ref={resetDialog}
        aria-labelledby="trade-reset-title"
        aria-describedby="trade-reset-description"
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const buttons =
            event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
          const first = buttons[0],
            last = buttons[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        onClose={() => resetTrigger.current?.focus({ preventScroll: true })}
        className="m-auto w-full max-w-form rounded-card border border-hairline bg-white p-6 text-carbon shadow-xl backdrop:bg-black/40"
      >
        <h2 id="trade-reset-title" className="text-xl font-bold">
          Начать оценку заново?
        </h2>
        <p id="trade-reset-description" className="mt-3 text-sm leading-6 text-muted">
          Уберём выбранное устройство, ответы, оценку и введённые контакты. Уже отправленные заявки
          сохранятся.
        </p>
        <div className="mt-6 grid gap-2">
          <button
            ref={resetCancel}
            type="button"
            onClick={() => resetDialog.current?.close()}
            className={stickyPrimaryActionClass}
          >
            Продолжить текущую оценку
          </button>
          <button
            type="button"
            onClick={startNewEvaluation}
            disabled={leadState === "submitting"}
            className="focus-ring min-h-12 rounded-pill border border-hairline px-6 py-3 text-sm font-semibold"
          >
            Начать заново
          </button>
        </div>
      </dialog>
    </section>
  );
}
