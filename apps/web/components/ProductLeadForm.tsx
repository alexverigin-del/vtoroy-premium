"use client";

import { FormEvent, useState } from "react";

type SubmitState = "idle" | "submitting" | "success" | "error";

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

export function ProductLeadForm({
  deviceId,
  deviceTitle,
}: {
  deviceId: string;
  deviceTitle: string;
}) {
  const [state, setState] = useState<SubmitState>("idle");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contact.trim()) {
      setState("error");
      return;
    }

    setState("submitting");
    const response = await fetch("/lead-intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "purchase",
        scenario: "Забронировать устройство",
        device: deviceTitle,
        device_id: deviceId,
        contact,
        message,
        ...trackingPayload(),
      }),
    }).catch(() => null);

    if (!response?.ok) {
      setState("error");
      return;
    }

    setContact("");
    setMessage("");
    setState("success");
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 rounded-card bg-surface p-4">
      <p className="text-sm font-semibold">Забронировать или уточнить</p>
      <label className="mt-3 block text-sm">
        <span className="text-muted">Контакт</span>
        <input
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          type="text"
          name="contact"
          placeholder="Телефон или Telegram"
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
          placeholder="Например, хочу посмотреть сегодня после 18:00"
          className="mt-1 w-full resize-none rounded-card border border-hairline bg-white px-4 py-3 text-ink outline-none transition focus:border-accent"
        />
      </label>
      <button
        type="submit"
        disabled={state === "submitting"}
        className="mt-4 inline-flex w-full items-center justify-center rounded-pill bg-accent px-7 py-3 font-medium text-white transition hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
      >
        {state === "submitting" ? "Отправляем..." : "Отправить заявку"}
      </button>
      <p
        className={[
          "mt-3 text-xs",
          state === "success" ? "text-emerald-700" : "text-muted",
          state === "error" ? "text-red-600" : "",
        ].join(" ")}
      >
        {state === "success"
          ? "Заявка принята. Мы свяжемся и подтвердим наличие."
          : state === "error"
            ? "Оставьте контакт или попробуйте отправить еще раз."
            : "Заявка попадет в Directus с привязкой к этой карточке."}
      </p>
    </form>
  );
}
