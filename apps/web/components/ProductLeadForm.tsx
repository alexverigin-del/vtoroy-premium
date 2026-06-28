"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type SubmitState = "idle" | "submitting" | "success" | "error";

type TurnstileApi = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

type ProductLeadMode = {
  kind: "purchase" | "selection";
  scenario: string;
  title: string;
  contactPlaceholder: string;
  messagePlaceholder: string;
  submitLabel: string;
  submittingLabel: string;
  idleNote: string;
  successNote: string;
  statusNote: string;
};

function trackingPayload() {
  const params = new URLSearchParams(window.location.search);
  return {
    source_path: window.location.pathname,
    source_url: window.location.href,
    page_title: document.title,
    referrer: document.referrer,
    utm_source: params.get("utm_source") ?? "",
    utm_medium: params.get("utm_medium") ?? "",
    utm_campaign: params.get("utm_campaign") ?? "",
    utm_content: params.get("utm_content") ?? "",
    utm_term: params.get("utm_term") ?? "",
  };
}

function normalizeStockStatus(value: string): string {
  const status = value.trim().toLowerCase();
  if (!status || status === "in_stock") return "available";
  if (status === "service") return "hidden";
  return status;
}

function leadMode(stockStatus: string): ProductLeadMode {
  if (stockStatus === "reserved") {
    return {
      kind: "purchase",
      scenario: "Встать в лист ожидания по брони",
      title: "Встать в лист ожидания",
      contactPlaceholder: "Телефон или Telegram",
      messagePlaceholder: "Например, если бронь освободится, готов посмотреть сегодня",
      submitLabel: "Встать в лист ожидания",
      submittingLabel: "Отправляем...",
      idleNote: "Заявка попадёт в Directus как обращение по забронированной карточке.",
      successNote: "Заявка принята. Мы свяжемся, если бронь освободится или появится близкая альтернатива.",
      statusNote: "Устройство сейчас в брони. Мы не обещаем продажу, но можем поставить вас следующим в очередь.",
    };
  }

  if (stockStatus === "sold") {
    return {
      kind: "selection",
      scenario: "Подобрать похожее устройство",
      title: "Подобрать похожее устройство",
      contactPlaceholder: "Телефон или Telegram",
      messagePlaceholder: "Например, хочу похожий iPhone с таким же объёмом памяти",
      submitLabel: "Подобрать альтернативу",
      submittingLabel: "Отправляем...",
      idleNote: "Заявка попадёт в Directus как подбор альтернативы по проданной карточке.",
      successNote: "Заявка принята. Мы предложим похожую вещь из круга или сообщим, когда она появится.",
      statusNote: "Эта вещь уже продана. Можно оставить заявку на похожую модель.",
    };
  }

  return {
    kind: "purchase",
    scenario: "Забронировать устройство",
    title: "Забронировать или уточнить",
    contactPlaceholder: "Телефон или Telegram",
    messagePlaceholder: "Например, хочу посмотреть сегодня после 18:00",
    submitLabel: "Отправить заявку",
    submittingLabel: "Отправляем...",
    idleNote: "Заявка попадёт в Directus с привязкой к этой карточке.",
    successNote: "Заявка принята. Мы свяжемся и подтвердим наличие.",
    statusNote: "Устройство сейчас доступно. После заявки мы подтвердим наличие и время просмотра.",
  };
}

export function ProductLeadForm({
  deviceId,
  deviceTitle,
  stockStatus = "available",
  stockStatusLabel = "В наличии",
}: {
  deviceId: string;
  deviceTitle: string;
  stockStatus?: string;
  stockStatusLabel?: string;
}) {
  const [state, setState] = useState<SubmitState>("idle");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileElementRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetRef = useRef<string>();
  const normalizedStockStatus = normalizeStockStatus(stockStatus);
  const mode = leadMode(normalizedStockStatus);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !turnstileElementRef.current || turnstileWidgetRef.current) return;

    let attempts = 0;
    let cancelled = false;
    let timeoutId: number | undefined;

    function renderWidget() {
      if (cancelled || !turnstileElementRef.current || turnstileWidgetRef.current) return;
      if (window.turnstile) {
        turnstileWidgetRef.current = window.turnstile.render(turnstileElementRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: setTurnstileToken,
          "expired-callback": () => setTurnstileToken(""),
          "error-callback": () => setTurnstileToken(""),
        });
        return;
      }
      attempts += 1;
      if (attempts < 40) {
        timeoutId = window.setTimeout(renderWidget, 250);
      }
    }

    renderWidget();

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contact.trim()) {
      setState("error");
      return;
    }
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setState("error");
      return;
    }

    const leadMessage = [
      `Статус карточки на момент заявки: ${stockStatusLabel} (${normalizedStockStatus}).`,
      message.trim(),
    ].filter(Boolean).join("\n\n");

    setState("submitting");
    const response = await fetch("/lead-intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: mode.kind,
        scenario: mode.scenario,
        device: deviceTitle,
        device_id: deviceId,
        contact,
        message: leadMessage,
        turnstile_token: turnstileToken,
        ...trackingPayload(),
      }),
    }).catch(() => null);

    if (!response?.ok) {
      if (turnstileWidgetRef.current) window.turnstile?.reset(turnstileWidgetRef.current);
      setTurnstileToken("");
      setState("error");
      return;
    }

    setContact("");
    setMessage("");
    if (turnstileWidgetRef.current) window.turnstile?.reset(turnstileWidgetRef.current);
    setTurnstileToken("");
    setState("success");
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 rounded-card bg-surface p-4">
      <p className="text-sm font-semibold">{mode.title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{mode.statusNote}</p>
      <label className="mt-3 block text-sm">
        <span className="text-muted">Контакт</span>
        <input
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          type="text"
          name="contact"
          placeholder={mode.contactPlaceholder}
          className="mt-1 w-full rounded-card border border-hairline bg-white px-4 py-3 text-ink outline-none transition focus:border-accent"
        />
      </label>
      <label className="mt-3 block text-sm">
        <span className="text-muted">Комментарий</span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          name="message"
          rows={3}
          placeholder={mode.messagePlaceholder}
          className="mt-1 w-full resize-none rounded-card border border-hairline bg-white px-4 py-3 text-ink outline-none transition focus:border-accent"
        />
      </label>
      {TURNSTILE_SITE_KEY ? <div ref={turnstileElementRef} className="mt-4 min-h-[65px]" /> : null}
      <button
        type="submit"
        disabled={state === "submitting" || Boolean(TURNSTILE_SITE_KEY && !turnstileToken)}
        className="mt-4 inline-flex w-full items-center justify-center rounded-pill bg-accent px-7 py-3 font-medium text-white transition hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
      >
        {state === "submitting" ? mode.submittingLabel : mode.submitLabel}
      </button>
      <p
        className={[
          "mt-3 text-xs",
          state === "success" ? "text-emerald-700" : "text-muted",
          state === "error" ? "text-red-600" : "",
        ].join(" ")}
      >
        {state === "success"
          ? mode.successNote
          : state === "error"
            ? "Оставьте контакт, пройдите проверку или попробуйте отправить ещё раз."
            : mode.idleNote}
      </p>
    </form>
  );
}
