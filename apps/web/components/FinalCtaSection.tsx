import type { PageSection, RichTextNode } from "@vtoroy/shared";
import Link from "next/link";
import { cn } from "../lib/cn";
import { HomeSectionIntro } from "./HomeSectionIntro";
import { RichText } from "./RichText";
import { normalizeSiteUrl } from "./site-chrome-utils";
import { primaryCtaClass, secondaryCtaClass } from "./ui-classes";
import { FinalCtaForm, type FinalCtaFormConfig } from "./FinalCtaForm";

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

function finalCtaFormContent(value: unknown): FinalCtaFormConfig {
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
    successNote: text(
      "successNote",
      "success_note",
      "Заявка принята. Менеджер свяжется с вами по указанному контакту.",
    ),
    errorNote: text(
      "errorNote",
      "error_note",
      "Не удалось отправить заявку. Проверьте данные и попробуйте ещё раз.",
    ),
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

          <FinalCtaForm form={form} source={source} />
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
