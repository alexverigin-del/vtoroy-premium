"use client";

import type { FormEvent } from "react";
import { useId, useState } from "react";
import type { PageSection } from "@vtoroy/shared";
import { cn } from "../lib/cn";
import { useLeadIntake } from "./useLeadIntake";
import { homeSectionLabelClass, submitButtonClass } from "./ui-classes";

type FinalCtaForm = {
  scenarioLabel: string;
  scenarioAriaLabel: string;
  scenarioOptions: string[];
  deviceLabel: string;
  devicePlaceholder: string;
  contactLabel: string;
  contactPlaceholder: string;
  submitLabel: string;
  note: string;
};

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : []));
}

function finalCtaFormContent(value: unknown): FinalCtaForm {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const text = (camelKey: string, snakeKey: string, fallback: string): string => {
    const camelField = record[camelKey];
    const snakeField = record[snakeKey];
    if (typeof camelField === "string") return camelField;
    if (typeof snakeField === "string") return snakeField;
    return fallback;
  };
  const scenarioOptions = stringList(record.scenarioOptions).length
    ? stringList(record.scenarioOptions)
    : stringList(record.scenario_options);

  return {
    scenarioLabel: text("scenarioLabel", "scenario_label", "Что хотите сделать?"),
    scenarioAriaLabel: text("scenarioAriaLabel", "scenario_aria_label", "Сценарий обращения"),
    scenarioOptions:
      scenarioOptions.length > 0
        ? scenarioOptions
        : [
            "Найти вещь в кругу",
            "Передать свою вещь дальше",
            "Обновиться на следующую",
            "Узнать про Club",
          ],
    deviceLabel: text("deviceLabel", "device_label", "Какая вещь интересна?"),
    devicePlaceholder: text(
      "devicePlaceholder",
      "device_placeholder",
      "Например, iPhone 13 Pro или MacBook Air",
    ),
    contactLabel: text("contactLabel", "contact_label", "Контакт для ответа"),
    contactPlaceholder: text("contactPlaceholder", "contact_placeholder", "Телефон или Telegram"),
    submitLabel: text("submitLabel", "submit_label", "Войти в круг"),
    note: text("note", "note", "Оставьте контакт, и мы предложим спокойный следующий шаг."),
  };
}

export function FinalCtaSection({ section }: { section: PageSection }) {
  const proof = stringList(section.content.proof);
  const renderedProof =
    proof.length > 0
      ? proof
      : ["варианты под задачу", "без агрессивных продаж", "сначала проверка - потом решение"];
  const form = finalCtaFormContent(section.content.form);
  const footerNote =
    typeof section.content.footerNote === "string"
      ? section.content.footerNote
      : typeof section.content.footer_note === "string"
        ? section.content.footer_note
        : "Северодвинск. Мы здесь. Нас можно найти. Мы отвечаем за то, что проходит через своих.";

  const [scenario, setScenario] = useState(form.scenarioOptions[0] ?? "");
  const [device, setDevice] = useState("");
  const [contact, setContact] = useState("");
  const scenarioId = useId();
  const deviceId = useId();
  const contactId = useId();
  const { markError, state, submitLead, turnstileElementRef, turnstileReady, turnstileRequired } =
    useLeadIntake();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contact.trim()) {
      markError();
      return;
    }

    const submitted = await submitLead({
      scenario,
      device,
      contact,
      source: "home_final_cta",
    });

    if (!submitted) return;
    setDevice("");
    setContact("");
  }

  return (
    <section className="bg-frost py-16 md:py-20" id="final" data-component="FinalCtaSection">
      <div className="mx-auto max-w-page px-4 md:px-6">
        <div className="grid gap-6 rounded-card border border-hairline bg-white p-5 md:grid-cols-lead md:p-8">
          <div className="flex flex-col justify-center">
            {section.eyebrow ? (
              <div className={homeSectionLabelClass}>{section.eyebrow}</div>
            ) : null}
            {section.headline ? (
              <h2 className="mt-3 max-w-heading text-3xl font-semibold leading-tight tracking-normal text-carbon md:text-4xl">
                {section.headline}
              </h2>
            ) : null}
            {section.body ? (
              <p className="mt-4 max-w-form text-copy leading-relaxed text-graphite">
                {section.body}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-2">
              {renderedProof.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-hairline bg-frost px-3 py-2 text-sm font-medium text-graphite"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-card border border-hairline bg-frost p-4 md:p-5"
          >
            <label className="block text-sm font-medium text-carbon" htmlFor={scenarioId}>
              <span>{form.scenarioLabel}</span>
              <select
                id={scenarioId}
                name="scenario"
                aria-label={form.scenarioAriaLabel}
                value={scenario}
                onChange={(event) => setScenario(event.target.value)}
                className="mt-2 h-12 w-full rounded-input border border-hairline bg-white px-4 text-carbon outline-none transition focus:border-link-blue focus:ring-2 focus:ring-link-blue/15"
              >
                {form.scenarioOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="mt-4 block text-sm font-medium text-carbon" htmlFor={deviceId}>
              <span>{form.deviceLabel}</span>
              <input
                id={deviceId}
                name="device"
                type="text"
                aria-label={form.deviceLabel}
                value={device}
                onChange={(event) => setDevice(event.target.value)}
                placeholder={form.devicePlaceholder}
                className="mt-2 h-12 w-full rounded-input border border-hairline bg-white px-4 text-carbon outline-none transition focus:border-link-blue focus:ring-2 focus:ring-link-blue/15"
              />
            </label>

            <label className="mt-4 block text-sm font-medium text-carbon" htmlFor={contactId}>
              <span>{form.contactLabel}</span>
              <input
                id={contactId}
                name="contact"
                type="text"
                aria-label={form.contactLabel}
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                placeholder={form.contactPlaceholder}
                className="mt-2 h-12 w-full rounded-input border border-hairline bg-white px-4 text-carbon outline-none transition focus:border-link-blue focus:ring-2 focus:ring-link-blue/15"
              />
            </label>

            <input
              name="website"
              type="text"
              autoComplete="off"
              tabIndex={-1}
              aria-hidden="true"
              className="absolute left-[-9999px] h-px w-px opacity-0"
            />

            {turnstileRequired ? (
              <div ref={turnstileElementRef} className="mt-4 min-h-turnstile" />
            ) : null}

            <button
              className={submitButtonClass}
              type="submit"
              disabled={state === "submitting" || !turnstileReady}
            >
              {state === "submitting" ? "Отправляем..." : form.submitLabel}
            </button>

            <p
              className={cn(
                "mt-3 text-sm leading-relaxed",
                state === "success" ? "text-success" : "text-ash",
                state === "error" ? "text-red-600" : "",
              )}
            >
              {state === "success"
                ? "Заявка принята. Мы свяжемся с вами и предложим спокойный следующий шаг."
                : state === "error"
                  ? "Оставьте контакт, пройдите проверку или попробуйте отправить ещё раз."
                  : form.note}
            </p>
          </form>
        </div>

        <p className="mt-6 text-sm leading-relaxed text-ash">{footerNote}</p>
      </div>
    </section>
  );
}
