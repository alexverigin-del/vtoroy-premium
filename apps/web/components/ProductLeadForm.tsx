"use client";

import { FormEvent, useId, useState } from "react";
import { cn } from "../lib/cn";
import {
  leadFieldClass,
  leadHoneypotClass,
  leadTextareaClass,
  submitButtonClass,
} from "./ui-classes";
import { useLeadIntake } from "./useLeadIntake";

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
      idleNote: "Заявка будет привязана к этой карточке и текущему статусу.",
      successNote:
        "Заявка принята. Мы свяжемся, если бронь освободится или появится близкая альтернатива.",
      statusNote:
        "Устройство сейчас в брони. Мы не обещаем продажу, но можем поставить вас следующим в очередь.",
    };
  }

  if (stockStatus === "sold") {
    return {
      kind: "selection",
      scenario: "Подобрать похожее устройство",
      title: "Подобрать альтернативу",
      contactPlaceholder: "Телефон или Telegram",
      messagePlaceholder: "Например, хочу похожий iPhone с таким же объёмом памяти",
      submitLabel: "Подобрать альтернативу",
      submittingLabel: "Отправляем...",
      idleNote: "Заявка сохранит контекст этой карточки, чтобы подбор был точнее.",
      successNote:
        "Заявка принята. Мы предложим похожую вещь из круга или сообщим, когда она появится.",
      statusNote: "Эта вещь уже продана. Можно оставить заявку на похожую модель.",
    };
  }

  return {
    kind: "purchase",
    scenario: "Записаться на просмотр",
    title: "Проверить наличие и записаться",
    contactPlaceholder: "Телефон или Telegram",
    messagePlaceholder: "Например, хочу посмотреть сегодня после 18:00",
    submitLabel: "Записаться на просмотр",
    submittingLabel: "Отправляем...",
    idleNote: "Заявка будет привязана к этой карточке и текущим условиям.",
    successNote: "Заявка принята. Мы свяжемся и подтвердим наличие.",
    statusNote: "Устройство сейчас доступно. После заявки мы подтвердим наличие и время просмотра.",
  };
}

export function ProductLeadForm({
  deviceId,
  deviceTitle,
  formId,
  stockStatus = "available",
  stockStatusLabel = "В наличии",
}: {
  deviceId: string;
  deviceTitle: string;
  formId?: string;
  stockStatus?: string;
  stockStatusLabel?: string;
}) {
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const contactId = useId();
  const messageId = useId();
  const statusId = useId();
  const { markError, state, submitLead, turnstileElementRef, turnstileReady, turnstileRequired } =
    useLeadIntake();
  const normalizedStockStatus = normalizeStockStatus(stockStatus);
  const mode = leadMode(normalizedStockStatus);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const website = String(formData.get("website") || "");
    if (!contact.trim()) {
      markError();
      return;
    }

    const leadMessage = [
      `Статус карточки на момент заявки: ${stockStatusLabel} (${normalizedStockStatus}).`,
      message.trim(),
    ]
      .filter(Boolean)
      .join("\n\n");

    const submitted = await submitLead({
      kind: mode.kind,
      scenario: mode.scenario,
      device: deviceTitle,
      device_id: deviceId,
      contact,
      message: leadMessage,
      website,
    });

    if (!submitted) {
      return;
    }

    setContact("");
    setMessage("");
  }

  return (
    <form
      id={formId}
      onSubmit={handleSubmit}
      className="mt-8 scroll-mt-24 rounded-card bg-surface p-4"
      aria-busy={state === "submitting"}
      data-component="ProductLeadForm"
    >
      <p className="text-sm font-semibold">{mode.title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{mode.statusNote}</p>
      <label className="mt-3 block text-sm" htmlFor={contactId}>
        <span className="text-muted">Контакт</span>
        <input
          id={contactId}
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          type="text"
          name="contact"
          aria-label="Контакт для ответа"
          aria-describedby={statusId}
          aria-invalid={state === "error"}
          autoComplete="tel"
          required
          placeholder={mode.contactPlaceholder}
          className={leadFieldClass}
        />
      </label>
      <label className="mt-3 block text-sm" htmlFor={messageId}>
        <span className="text-muted">Комментарий</span>
        <textarea
          id={messageId}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          name="message"
          aria-label="Комментарий к заявке"
          rows={3}
          placeholder={mode.messagePlaceholder}
          className={leadTextareaClass}
        />
      </label>
      {turnstileRequired ? (
        <div ref={turnstileElementRef} className="mt-4 min-h-turnstile" />
      ) : null}
      <input
        name="website"
        type="text"
        autoComplete="off"
        tabIndex={-1}
        aria-hidden="true"
        className={leadHoneypotClass}
      />
      <button
        type="submit"
        disabled={state === "submitting" || !turnstileReady}
        className={submitButtonClass}
      >
        {state === "submitting" ? mode.submittingLabel : mode.submitLabel}
      </button>
      <p
        id={statusId}
        aria-live="polite"
        className={cn(
          "mt-3 text-xs",
          state === "success" ? "text-success" : "text-muted",
          state === "error" ? "text-red-600" : "",
        )}
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
