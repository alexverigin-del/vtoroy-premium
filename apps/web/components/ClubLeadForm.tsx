"use client";

import { FormEvent, useId, useMemo, useState } from "react";
import type { ClubOffer, ClubPageSettings, ClubPlan } from "@vtoroy/shared";
import { cn } from "@/lib/cn-client";
import {
  leadFieldClass,
  leadHoneypotClass,
  leadTextareaClass,
  submitButtonClass,
} from "./ui-classes";
import { TelegramContinue } from "./TelegramContinue";
import { useLeadIntake } from "./useLeadIntake";

type ClubLeadFormProps = {
  settings: ClubPageSettings;
  offers: ClubOffer[];
  plans: ClubPlan[];
  selectedOfferId?: string;
};

export function ClubLeadForm({ settings, offers, plans, selectedOfferId }: ClubLeadFormProps) {
  const [contact, setContact] = useState("");
  const [deviceRequest, setDeviceRequest] = useState("");
  const [budget, setBudget] = useState("");
  const [message, setMessage] = useState("");
  const [offerId, setOfferId] = useState(
    offers.some((offer) => offer.id === selectedOfferId) ? selectedOfferId || "" : "",
  );
  const [planId, setPlanId] = useState(
    plans.find((plan) => !plan.isFuture)?.id ?? plans[0]?.id ?? "",
  );
  const [termMonths, setTermMonths] = useState("12");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [deviceError, setDeviceError] = useState("");
  const contactId = useId();
  const deviceRequestId = useId();
  const offerIdInput = useId();
  const planIdInput = useId();
  const termId = useId();
  const budgetId = useId();
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

  const selectedOffer = useMemo(
    () => offers.find((offer) => offer.id === offerId),
    [offerId, offers],
  );
  const selectedPlan = useMemo(() => plans.find((plan) => plan.id === planId), [planId, plans]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const website = String(formData.get("website") || "");

    if (!selectedOffer && !deviceRequest.trim()) {
      setDeviceError(settings.formDeviceError);
      markError();
      return;
    }

    if (!contact.trim() || !consentAccepted) {
      markError();
      return;
    }

    const leadMessage = [
      selectedOffer
        ? `Club-устройство: ${selectedOffer.product.title}`
        : `Запрос устройства: ${deviceRequest.trim()}`,
      selectedPlan ? `Тариф: ${selectedPlan.name}` : "",
      termMonths ? `Срок: ${termMonths} мес.` : "",
      budget.trim() ? `Комфортный платёж: ${budget.trim()}` : "",
      message.trim(),
    ]
      .filter(Boolean)
      .join("\n");

    const submitted = await submitLead({
      kind: "club",
      scenario: settings.formScenario,
      product: selectedOffer?.product.title,
      product_id: selectedOffer?.product.id,
      product_type: selectedOffer?.product.productType,
      club_offer: selectedOffer?.id,
      club_plan: selectedPlan?.id,
      club_term_months: termMonths,
      club_budget_text: budget,
      club_device_request: deviceRequest,
      club_consent_accepted: consentAccepted,
      club_consent_version: settings.consentVersion,
      contact,
      message: leadMessage,
      website,
    });

    if (!submitted) return;

    setContact("");
    setDeviceRequest("");
    setBudget("");
    setMessage("");
    setConsentAccepted(false);
    setDeviceError("");
  }

  return (
    <form
      id="club-request"
      onSubmit={handleSubmit}
      className="scroll-mt-24 rounded-card border border-hairline bg-white p-5 shadow-soft md:p-7"
      aria-busy={state === "submitting"}
      data-component="ClubLeadForm"
    >
      <p className="text-xl font-semibold text-carbon">{settings.formTitle}</p>
      <p className="mt-2 text-sm leading-relaxed text-graphite">{settings.formIdleNote}</p>

      {offers.length > 0 ? (
        <label className="mt-5 block text-sm" htmlFor={offerIdInput}>
          <span className="font-medium text-carbon">Устройство</span>
          <select
            id={offerIdInput}
            value={offerId}
            onChange={(event) => setOfferId(event.target.value)}
            className={leadFieldClass}
          >
            <option value="">Подобрать другое устройство</option>
            {offers.map((offer) => (
              <option key={offer.id} value={offer.id}>
                {offer.product.title} — {offer.monthlyText}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {!selectedOffer ? (
        <label className="mt-4 block text-sm" htmlFor={deviceRequestId}>
          <span className="font-medium text-carbon">{settings.formDeviceLabel}</span>
          <input
            id={deviceRequestId}
            value={deviceRequest}
            onChange={(event) => {
              setDeviceRequest(event.target.value);
              if (event.target.value.trim()) setDeviceError("");
            }}
            type="text"
            name="club_device_request"
            required
            aria-invalid={Boolean(deviceError)}
            aria-describedby={deviceError ? `${deviceRequestId}-error` : undefined}
            placeholder={settings.formDevicePlaceholder}
            className={leadFieldClass}
          />
          {deviceError ? (
            <span id={`${deviceRequestId}-error`} className="mt-2 block text-xs text-red-600">
              {deviceError}
            </span>
          ) : null}
        </label>
      ) : null}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="block text-sm" htmlFor={planIdInput}>
          <span className="font-medium text-carbon">Тариф</span>
          <select
            id={planIdInput}
            value={planId}
            onChange={(event) => setPlanId(event.target.value)}
            className={leadFieldClass}
          >
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
                {plan.isFuture ? " — лист ожидания" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm" htmlFor={termId}>
          <span className="font-medium text-carbon">{settings.formTermLabel}</span>
          <select
            id={termId}
            value={termMonths}
            onChange={(event) => setTermMonths(event.target.value)}
            className={leadFieldClass}
          >
            <option value="6">6 месяцев</option>
            <option value="12">12 месяцев</option>
            <option value="18">18 месяцев</option>
            <option value="24">24 месяца</option>
          </select>
        </label>
      </div>

      <label className="mt-4 block text-sm" htmlFor={contactId}>
        <span className="font-medium text-carbon">{settings.formContactLabel}</span>
        <input
          id={contactId}
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          type="text"
          name="contact"
          autoComplete="tel"
          required
          aria-describedby={statusId}
          aria-invalid={state === "error"}
          placeholder={settings.formContactPlaceholder}
          className={leadFieldClass}
        />
      </label>

      <label className="mt-4 block text-sm" htmlFor={budgetId}>
        <span className="font-medium text-carbon">{settings.formBudgetLabel}</span>
        <input
          id={budgetId}
          value={budget}
          onChange={(event) => setBudget(event.target.value)}
          type="text"
          name="club_budget_text"
          placeholder={settings.formBudgetPlaceholder}
          className={leadFieldClass}
        />
      </label>

      <label className="mt-4 block text-sm" htmlFor={messageId}>
        <span className="font-medium text-carbon">{settings.formMessageLabel}</span>
        <textarea
          id={messageId}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          name="message"
          rows={4}
          placeholder={settings.formMessagePlaceholder}
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
      <label className="mt-4 flex items-start gap-3 text-xs leading-relaxed text-graphite">
        <input
          type="checkbox"
          checked={consentAccepted}
          onChange={(event) => setConsentAccepted(event.target.checked)}
          required
          className="mt-1 h-4 w-4 shrink-0 accent-action-blue"
        />
        <span>
          {settings.formConsentLabel}{" "}
          <a
            href={settings.privacyUrl}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-link-blue underline"
          >
            Политика обработки данных
          </a>
          .
        </span>
      </label>
      {settings.formConsentNote ? (
        <p className="mt-2 text-xs leading-relaxed text-muted">{settings.formConsentNote}</p>
      ) : null}
      <button
        type="submit"
        disabled={state === "submitting" || !turnstileReady || !consentAccepted}
        className={submitButtonClass}
      >
        {state === "submitting" ? settings.formSubmittingLabel : settings.formSubmitLabel}
      </button>
      <p
        id={statusId}
        aria-live="polite"
        className={cn(
          "mt-3 text-xs leading-relaxed",
          state === "error" ? "text-red-600" : state === "success" ? "text-success" : "text-muted",
        )}
      >
        {state === "success"
          ? settings.formSuccessNote
          : state === "error"
            ? settings.formErrorNote
            : settings.formIdleNote}
      </p>
      <TelegramContinue url={telegramUrl} />
    </form>
  );
}
