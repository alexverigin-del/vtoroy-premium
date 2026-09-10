"use client";

import { FormEvent, useId, useState } from "react";
import type { DevicePageSettings, ProductLeadFormMode } from "@vtoroy/shared";
import { cn } from "../lib/cn-client";
import {
  leadFieldClass,
  leadHoneypotClass,
  leadTextareaClass,
  submitButtonClass,
} from "./ui-classes";
import { TelegramContinue } from "./TelegramContinue";
import { useLeadIntake } from "./useLeadIntake";

type ProductLeadCopy = DevicePageSettings["leadForm"];

function normalizeStockStatus(value: string): string {
  const status = value.trim().toLowerCase();
  if (!status || status === "in_stock") return "available";
  if (status === "service") return "hidden";
  return status;
}

function leadMode(stockStatus: string, copy: ProductLeadCopy): ProductLeadFormMode {
  if (stockStatus === "reserved") {
    return copy.reserved;
  }

  if (stockStatus === "sold") {
    return copy.sold;
  }

  return copy.available;
}

export function ProductLeadFormClient({
  productId,
  productTitle,
  productType = "device",
  deviceId,
  deviceTitle,
  formId,
  stockStatus = "available",
  stockStatusLabel = "В наличии",
  leadCopy,
}: {
  productId?: string;
  productTitle?: string;
  productType?: "device" | "accessory";
  /** Transitional aliases kept for the legacy device page. */
  deviceId?: string;
  deviceTitle?: string;
  formId?: string;
  stockStatus?: string;
  stockStatusLabel?: string;
  leadCopy: ProductLeadCopy;
}) {
  const resolvedId = productId || deviceId || "";
  const resolvedTitle = productTitle || deviceTitle || "";
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const contactId = useId();
  const messageId = useId();
  const statusId = useId();
  const {
    telegramUrl,
    markError,
    state,
    submitLead,
    turnstileElementRef,
    turnstileReady,
    turnstileRequired,
  } = useLeadIntake();
  const normalizedStockStatus = normalizeStockStatus(stockStatus);
  const mode = leadMode(normalizedStockStatus, leadCopy);
  const submitLabel =
    normalizedStockStatus === "available"
      ? productType === "accessory"
        ? `Забронировать ${resolvedTitle}`
        : `Записаться на просмотр ${resolvedTitle}`
      : mode.submitLabel;

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
      scenario:
        productType === "accessory" && normalizedStockStatus === "available"
          ? "Забронировать аксессуар"
          : mode.scenario,
      product: resolvedTitle,
      product_id: resolvedId,
      product_type: productType,
      device: productType === "device" ? resolvedTitle : undefined,
      device_id: productType === "device" ? resolvedId : undefined,
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
      className="mt-8 min-w-0 scroll-mt-24 break-words"
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
          className={cn(leadFieldClass, "placeholder:text-muted")}
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
          className={cn(leadTextareaClass, "placeholder:text-muted")}
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
      {mode.consentNote ? (
        <p className="mt-3 text-xs leading-relaxed text-muted">{mode.consentNote}</p>
      ) : null}
      <button
        type="submit"
        disabled={state === "submitting" || !turnstileReady}
        className={submitButtonClass}
      >
        {state === "submitting" ? mode.submittingLabel : submitLabel}
      </button>
      <p
        id={statusId}
        aria-live="polite"
        className={cn(
          "mt-3 text-xs",
          state === "error" ? "text-red-600" : state === "success" ? "text-success" : "text-muted",
        )}
      >
        {state === "success"
          ? mode.successNote
          : state === "error"
            ? mode.errorNote
            : mode.idleNote}
      </p>
      <TelegramContinue url={telegramUrl} />
    </form>
  );
}
