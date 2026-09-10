"use client";

import type { FormEvent } from "react";
import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { cn } from "../lib/cn-client";
import { TelegramContinue } from "./TelegramContinue";
import { useLeadIntake } from "./useLeadIntake";
import { leadFieldClass, leadHoneypotClass, submitButtonClass } from "./ui-classes";

export type FinalCtaFormConfig = {
  showScenario: boolean;
  scenarioLabel: string;
  scenarioAriaLabel: string;
  scenarioOptions: string[];
  deviceLabel: string;
  devicePlaceholder: string;
  contactLabel: string;
  contactPlaceholder: string;
  submitLabel: string;
  submittingLabel: string;
  successNote: string;
  errorNote: string;
  consentNote: string;
  consentLabel: string;
  consentVersion: string;
  consentUrl: string;
  note: string;
};

export function FinalCtaForm({ form, source }: { form: FinalCtaFormConfig; source: string }) {
  const isTradePage = source === "trade_page";
  const [scenario, setScenario] = useState(form.scenarioOptions[0] ?? "");
  const [device, setDevice] = useState("");
  const [contact, setContact] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const scenarioId = useId();
  const deviceId = useId();
  const contactId = useId();
  const consentId = useId();
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

  useEffect(() => {
    if (!isTradePage) return;
    const onHelp = () => {
      const commission = form.scenarioOptions.find((option) => /комисси/iu.test(option));
      if (commission) setScenario(commission);
    };
    window.addEventListener("isvoi:trade-help", onHelp);
    return () => window.removeEventListener("isvoi:trade-help", onHelp);
  }, [isTradePage, form.scenarioOptions]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const website = String(formData.get("website") || "");
    if (!contact.trim() || (isTradePage && !consentAccepted)) {
      markError();
      return;
    }

    const submitted = await submitLead({
      kind: isTradePage ? "trade" : undefined,
      scenario: isTradePage ? "manual_evaluation" : scenario,
      device,
      contact,
      source,
      website,
      trade_consent_accepted: isTradePage ? consentAccepted : undefined,
      trade_consent_version: isTradePage ? form.consentVersion : undefined,
      message: isTradePage ? `Выбранный сценарий: ${scenario}` : undefined,
    });

    if (!submitted) return;
    setDevice("");
    setContact("");
    setConsentAccepted(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={state === "submitting"}
      className="rounded-card border border-hairline bg-white p-5 lg:col-span-5 lg:col-start-8 lg:p-6"
    >
      {form.showScenario ? (
        <label className="block text-sm font-medium text-carbon" htmlFor={scenarioId}>
          <span>{form.scenarioLabel}</span>
          <select
            id={scenarioId}
            name="scenario"
            aria-label={form.scenarioAriaLabel}
            value={scenario}
            onChange={(event) => setScenario(event.target.value)}
            className={leadFieldClass}
          >
            {form.scenarioOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
      ) : (
        <input name="scenario" type="hidden" value={scenario} />
      )}

      <label
        className={cn("block text-sm font-medium text-carbon", form.showScenario && "mt-4")}
        htmlFor={deviceId}
      >
        <span>{form.deviceLabel}</span>
        <input
          id={deviceId}
          name="device"
          type="text"
          aria-label={form.deviceLabel}
          value={device}
          onChange={(event) => setDevice(event.target.value)}
          placeholder={form.devicePlaceholder}
          className={leadFieldClass}
        />
      </label>

      <label className="mt-4 block text-sm font-medium text-carbon" htmlFor={contactId}>
        <span>{form.contactLabel}</span>
        <input
          id={contactId}
          name="contact"
          type="text"
          aria-label={form.contactLabel}
          aria-describedby={statusId}
          aria-invalid={state === "error"}
          autoComplete="tel"
          required
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          placeholder={form.contactPlaceholder}
          className={leadFieldClass}
        />
      </label>

      <input
        name="website"
        type="text"
        autoComplete="off"
        tabIndex={-1}
        aria-hidden="true"
        className={leadHoneypotClass}
      />

      {turnstileRequired ? (
        <div ref={turnstileElementRef} className="mt-4 min-h-turnstile" />
      ) : null}

      {isTradePage ? (
        <label
          className="mt-4 flex min-h-11 cursor-pointer gap-3 text-xs leading-relaxed text-ash"
          htmlFor={consentId}
        >
          <input
            id={consentId}
            type="checkbox"
            required
            checked={consentAccepted}
            onChange={(event) => setConsentAccepted(event.target.checked)}
            className="focus-ring mt-0.5 h-5 w-5 shrink-0"
          />
          <span>
            {form.consentLabel}{" "}
            <Link className="font-medium text-link-blue underline" href={form.consentUrl}>
              Полный текст согласия
            </Link>
          </span>
        </label>
      ) : form.consentNote ? (
        <p className="mt-3 text-xs leading-relaxed text-ash">{form.consentNote}</p>
      ) : null}

      <button
        className={submitButtonClass}
        type="submit"
        disabled={state === "submitting" || !turnstileReady || (isTradePage && !consentAccepted)}
      >
        {state === "submitting" ? form.submittingLabel : form.submitLabel}
      </button>

      <p
        id={statusId}
        aria-live="polite"
        className={cn(
          "mt-3 text-sm leading-relaxed",
          state === "error" ? "text-red-600" : state === "success" ? "text-success" : "text-ash",
        )}
      >
        {state === "success" ? form.successNote : state === "error" ? form.errorNote : form.note}
      </p>
      <TelegramContinue url={telegramUrl} />
    </form>
  );
}
