"use client";

import type { FormEvent } from "react";
import { useEffect, useId, useState } from "react";
import Link from "next/link";
import type { PageSection, RichTextNode } from "@vtoroy/shared";
import { cn } from "../lib/cn-client";
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
  consentLabel: string;
  consentVersion: string;
  consentUrl: string;
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
    consentLabel: text(
      "consentLabel",
      "consent_label",
      "Я даю согласие на обработку телефона или Telegram для ответа по заявке Trade-in и ознакомлен с Политикой обработки персональных данных.",
    ),
    consentVersion: text("consentVersion", "consent_version", "trade-consent-v1-2026-08-30"),
    consentUrl: text("consentUrl", "consent_url", "/privacy#trade-in-consent"),
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
  const renderedProof =
    section.content.proof == null
      ? ["варианты под задачу", "без агрессивных продаж", "сначала проверка - потом решение"]
      : stringList(section.content.proof);
  const form = finalCtaFormContent(section.content.form);
  const closing =
    source === "trade_page"
      ? null
      : (managedClosingContent(section) ?? closingContent(section.content.closing));
  const footerNote =
    typeof section.content.footerNote === "string"
      ? section.content.footerNote
      : typeof section.content.footer_note === "string"
        ? section.content.footer_note
        : "";
  const isHomepage = source === "home_final_cta";
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
  const { markError, state, submitLead, turnstileElementRef, turnstileReady, turnstileRequired } =
    useLeadIntake();

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
    <section
      className="scroll-mt-24 bg-frost py-14 md:py-20"
      id="final"
      data-component="FinalCtaSection"
    >
      <div className="mx-auto max-w-page px-4 md:px-6">
        <HomeSectionIntro section={section} align="split" />
        <div className="mt-8 grid gap-8 lg:grid-cols-12 lg:items-stretch lg:gap-10">
          {renderedProof.length > 0 ? (
            <div className="lg:col-span-6 lg:h-full">
              <ul
                className={cn(
                  isHomepage
                    ? "grid grid-cols-2 border-y border-hairline"
                    : "grid h-full grid-rows-3 border-y border-hairline",
                )}
              >
                {renderedProof.map((item, index) => (
                  <li
                    key={item}
                    className={cn(
                      isHomepage
                        ? "flex min-h-28 flex-col justify-between gap-5 py-5 text-base font-semibold leading-snug text-carbon sm:min-h-32 sm:py-6 sm:text-xl"
                        : "grid min-h-28 grid-cols-grade items-center border-b border-hairline py-5 text-lg font-semibold leading-snug text-carbon last:border-b-0 sm:min-h-32 sm:text-xl",
                      isHomepage && index % 2 === 0 && "border-r border-hairline pr-4 sm:pr-6",
                      isHomepage && index % 2 === 1 && "pl-4 sm:pl-6",
                      isHomepage && index < 2 && "border-b border-hairline",
                    )}
                  >
                    {isHomepage ? (
                      <>
                        <span className="text-sm font-semibold text-link-blue" aria-hidden="true">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="max-w-56 text-balance">{item}</span>
                      </>
                    ) : (
                      <>
                        <span
                          className="h-3 w-3 justify-self-center rounded-full bg-success"
                          aria-hidden="true"
                        />
                        <span className="max-w-80 text-balance">{item}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

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
              disabled={
                state === "submitting" || !turnstileReady || (isTradePage && !consentAccepted)
              }
            >
              {state === "submitting" ? form.submittingLabel : form.submitLabel}
            </button>

            <p
              id={statusId}
              aria-live="polite"
              className={cn(
                "mt-3 text-sm leading-relaxed",
                state === "error"
                  ? "text-red-600"
                  : state === "success"
                    ? "text-success"
                    : "text-ash",
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
