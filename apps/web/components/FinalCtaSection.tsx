"use client";

import type { FormEvent } from "react";
import { useId, useState } from "react";
import Link from "next/link";
import type { PageSection, RichTextNode } from "@vtoroy/shared";
import { cn } from "../lib/cn";
import { HomeSectionIntro } from "./HomeSectionIntro";
import { RichText } from "./RichText";
import { normalizeSiteUrl } from "./site-chrome-utils";
import { useLeadIntake } from "./useLeadIntake";
import {
  leadFieldClass,
  leadHoneypotClass,
  primaryCtaClass,
  secondaryCtaClass,
  submitButtonClass,
} from "./ui-classes";

type FinalCtaForm = {
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
  note: string;
};

type ClosingContent = {
  headline: string;
  body: string;
  bodyRichText?: RichTextNode[];
  brand: string;
  tagline: string;
  primaryCtaLabel: string;
  primaryCtaUrl: string;
  secondaryCtaLabel: string;
  secondaryCtaUrl: string;
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
  const publicScenarioOptions = scenarioOptions.filter((option) => !/\bClub\b/iu.test(option));
  const rawNote = text("note", "note", "Оставьте контакт, и мы предложим спокойный следующий шаг.");
  const note = /Прототип|в реальном запуске|\bCRM\b/iu.test(rawNote)
    ? "Ответим по указанному контакту."
    : rawNote;
  const submitLabel = text("submitLabel", "submit_label", "Получить варианты");

  return {
    showScenario: record.showScenario !== false && record.show_scenario !== false,
    scenarioLabel: text("scenarioLabel", "scenario_label", "Что хотите сделать?"),
    scenarioAriaLabel: text("scenarioAriaLabel", "scenario_aria_label", "Сценарий обращения"),
    scenarioOptions:
      publicScenarioOptions.length > 0
        ? publicScenarioOptions
        : ["Найти устройство", "Подобрать несколько вариантов"],
    deviceLabel: text("deviceLabel", "device_label", "Какая вещь интересна?"),
    devicePlaceholder: text(
      "devicePlaceholder",
      "device_placeholder",
      "Например, iPhone 13 Pro или MacBook Air",
    ),
    contactLabel: text("contactLabel", "contact_label", "Контакт для ответа"),
    contactPlaceholder: text("contactPlaceholder", "contact_placeholder", "Телефон или Telegram"),
    submitLabel,
    submittingLabel: text("submittingLabel", "submitting_label", submitLabel),
    successNote: text("successNote", "success_note", note),
    errorNote: text("errorNote", "error_note", note),
    consentNote: text(
      "consentNote",
      "consent_note",
      "Нажимая кнопку, вы соглашаетесь на обработку контакта для ответа по заявке.",
    ),
    note,
  };
}

function closingContent(value: unknown): ClosingContent | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const text = (key: string): string =>
    typeof record[key] === "string" ? String(record[key]) : "";
  const closing = {
    headline: text("headline"),
    body: text("body"),
    bodyRichText: Array.isArray(record.bodyRichText)
      ? (record.bodyRichText as RichTextNode[])
      : undefined,
    brand: text("brand"),
    tagline: text("tagline"),
    primaryCtaLabel: text("primary_cta_label"),
    primaryCtaUrl: text("primary_cta_url"),
    secondaryCtaLabel: text("secondary_cta_label"),
    secondaryCtaUrl: text("secondary_cta_url"),
  };
  return Object.values(closing).some(Boolean) ? closing : null;
}

function managedClosingContent(section: PageSection): ClosingContent | null {
  const closing = {
    headline: section.closingHeadline || "",
    body: section.closingBody || "",
    bodyRichText: section.closingBodyRichText,
    brand: section.closingBrand || "",
    tagline: section.closingTagline || "",
    primaryCtaLabel: section.closingPrimaryCtaLabel || "",
    primaryCtaUrl: section.closingPrimaryCtaUrl || "",
    secondaryCtaLabel: section.closingSecondaryCtaLabel || "",
    secondaryCtaUrl: section.closingSecondaryCtaUrl || "",
  };
  return [
    closing.headline,
    closing.body,
    closing.brand,
    closing.tagline,
    closing.primaryCtaLabel,
    closing.primaryCtaUrl,
    closing.secondaryCtaLabel,
    closing.secondaryCtaUrl,
  ].some(Boolean) || Boolean(closing.bodyRichText?.length)
    ? closing
    : null;
}

export function FinalCtaSection({
  section,
  source = "home_final_cta",
}: {
  section: PageSection;
  source?: string;
}) {
  const proof = stringList(section.content.proof);
  const renderedProof =
    proof.length > 0
      ? proof
      : ["варианты под задачу", "без агрессивных продаж", "сначала проверка - потом решение"];
  const form = finalCtaFormContent(section.content.form);
  const closing = managedClosingContent(section) ?? closingContent(section.content.closing);
  const footerNote =
    typeof section.content.footerNote === "string"
      ? section.content.footerNote
      : typeof section.content.footer_note === "string"
        ? section.content.footer_note
        : "";

  const [scenario, setScenario] = useState(form.scenarioOptions[0] ?? "");
  const [device, setDevice] = useState("");
  const [contact, setContact] = useState("");
  const scenarioId = useId();
  const deviceId = useId();
  const contactId = useId();
  const statusId = useId();
  const { markError, state, submitLead, turnstileElementRef, turnstileReady, turnstileRequired } =
    useLeadIntake();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const website = String(formData.get("website") || "");
    if (!contact.trim()) {
      markError();
      return;
    }

    const submitted = await submitLead({
      scenario,
      device,
      contact,
      source,
      website,
    });

    if (!submitted) return;
    setDevice("");
    setContact("");
  }

  return (
    <section className="bg-frost py-14 md:py-20" id="final" data-component="FinalCtaSection">
      <div className="mx-auto max-w-page px-4 md:px-6">
        <HomeSectionIntro section={section} align="split" />
        <div className="mt-8 grid gap-8 lg:grid-cols-12 lg:items-start lg:gap-10">
          <div className="lg:col-span-6">
            <ul className="mt-6 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {renderedProof.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-sm font-medium leading-relaxed text-graphite"
                >
                  <span
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-success"
                    aria-hidden="true"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>

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

            {form.consentNote ? (
              <p className="mt-3 text-xs leading-relaxed text-ash">{form.consentNote}</p>
            ) : null}

            <button
              className={submitButtonClass}
              type="submit"
              disabled={state === "submitting" || !turnstileReady}
            >
              {state === "submitting" ? form.submittingLabel : form.submitLabel}
            </button>

            <p
              id={statusId}
              aria-live="polite"
              className={cn(
                "mt-3 text-sm leading-relaxed",
                state === "success" ? "text-success" : "text-ash",
                state === "error" ? "text-red-600" : "",
              )}
            >
              {state === "success"
                ? form.successNote
                : state === "error"
                  ? form.errorNote
                  : form.note}
            </p>
          </form>
        </div>

        {footerNote ? (
          <p className="mt-5 text-sm leading-relaxed text-ash lg:ml-auto lg:max-w-form">
            {footerNote}
          </p>
        ) : null}

        {closing ? (
          <div className="mt-14 grid gap-6 border-t border-hairline pt-12 md:mt-20 md:pt-16 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-6">
              {closing.headline ? (
                <h2 className="max-w-heading text-balance text-3xl font-semibold leading-tight tracking-normal text-carbon md:text-5xl">
                  {closing.headline}
                </h2>
              ) : null}
            </div>
            <div className="lg:col-span-5 lg:col-start-8">
              {closing.body ? (
                <RichText
                  className="text-copy leading-relaxed text-graphite"
                  html={closing.body}
                  nodes={closing.bodyRichText}
                />
              ) : null}
              {closing.brand ? (
                <strong className="mt-8 block text-xl font-semibold text-carbon">
                  {closing.brand}
                </strong>
              ) : null}
              {closing.tagline ? <p className="mt-2 text-graphite">{closing.tagline}</p> : null}
              {closing.primaryCtaLabel || closing.secondaryCtaLabel ? (
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  {closing.primaryCtaLabel ? (
                    <Link
                      href={normalizeSiteUrl(closing.primaryCtaUrl || "/catalog")}
                      className={primaryCtaClass}
                    >
                      {closing.primaryCtaLabel}
                    </Link>
                  ) : null}
                  {closing.secondaryCtaLabel ? (
                    <Link
                      href={normalizeSiteUrl(closing.secondaryCtaUrl || "/passport")}
                      className={secondaryCtaClass}
                    >
                      {closing.secondaryCtaLabel}
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
