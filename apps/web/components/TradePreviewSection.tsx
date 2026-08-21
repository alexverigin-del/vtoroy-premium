import Link from "next/link";
import type { PageSection } from "@vtoroy/shared";
import { cn } from "../lib/cn";
import { normalizeSiteUrl } from "./site-chrome-utils";
import { RichText } from "./RichText";
import { homeSectionLabelClass, primaryCtaClass, secondaryCtaClass } from "./ui-classes";

type ChoiceItem = {
  title: string;
  text: string;
  icon: string;
};

type ValuationContent = {
  heading: string;
  fromDevice: string;
  fromNote: string;
  toDevice: string;
  toNote: string;
  label: string;
  amount: string;
};

function textField(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey: string,
  fallback: string,
): string {
  const camelValue = record[camelKey];
  const snakeValue = record[snakeKey];
  if (typeof camelValue === "string" && camelValue.trim()) return camelValue;
  if (typeof snakeValue === "string" && snakeValue.trim()) return snakeValue;
  return fallback;
}

function choiceList(value: unknown): ChoiceItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title : "";
    const text = typeof record.text === "string" ? record.text : "";
    const icon =
      typeof record.icon === "string"
        ? record.icon
        : (["money", "chart", "swap"][index] ?? "money");
    return title || text ? [{ title, text, icon }] : [];
  });
}

function valuationContent(value: unknown): ValuationContent | null {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  if (Object.keys(record).length === 0) return null;

  return {
    heading: textField(record, "heading", "heading", ""),
    fromDevice: textField(record, "fromDevice", "from_device", ""),
    fromNote: textField(record, "fromNote", "from_note", ""),
    toDevice: textField(record, "toDevice", "to_device", ""),
    toNote: textField(record, "toNote", "to_note", ""),
    label: textField(record, "label", "label", ""),
    amount: textField(record, "amount", "amount", ""),
  };
}

function stepList(value: unknown): { title: string; text: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title : "";
    const text = typeof record.text === "string" ? record.text : "";
    return title ? [{ title, text }] : [];
  });
}

function Icon({ name }: { name: string }) {
  if (name === "chart") {
    return (
      <svg
        className="h-7 w-7"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <path d="M4 17l6-6 4 4 6-7" />
        <path d="M20 8v4h-4" />
      </svg>
    );
  }
  if (name === "swap") {
    return (
      <svg
        className="h-7 w-7"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <path d="M7 7h11l-2.5-2.5" />
        <path d="M17 17H6l2.5 2.5" />
      </svg>
    );
  }
  return (
    <svg
      className="h-7 w-7"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      className="h-9 w-9 text-link-blue"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

export function TradePreviewSection({ section }: { section: PageSection }) {
  const choices = choiceList(section.content.choices);
  const renderedChoices = choices;
  const choicesGridClass =
    renderedChoices.length === 1
      ? "md:grid-cols-1"
      : renderedChoices.length === 2
        ? "md:grid-cols-2"
        : "md:grid-cols-3";
  const valuation = valuationContent(section.content.valuation);
  const steps = stepList(section.content.steps);
  const note = typeof section.content.note === "string" ? section.content.note : "";

  return (
    <section className="bg-white py-16 md:py-20" id="trade">
      <div className="mx-auto max-w-page px-4 md:px-6">
        <div className="mx-auto max-w-copy text-center">
          {section.eyebrow ? <div className={homeSectionLabelClass}>{section.eyebrow}</div> : null}
          {section.headline ? (
            <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-normal text-carbon md:text-5xl">
              {section.headline}
            </h2>
          ) : null}
          {section.body ? (
            <RichText
              className="mt-4 text-copy leading-relaxed text-graphite"
              html={section.body}
              nodes={section.bodyRichText}
            />
          ) : null}
        </div>

        {renderedChoices.length > 0 ? (
          <div className="mt-10 overflow-hidden rounded-card border border-hairline bg-frost">
            <div className={cn("grid", choicesGridClass)}>
              {renderedChoices.map((choice, index) => (
                <div
                  key={`${choice.title}-${choice.text}`}
                  className={cn(
                    "p-5 md:p-6",
                    index > 0 ? "border-t border-hairline md:border-l md:border-t-0" : "",
                  )}
                >
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-card bg-white text-link-blue">
                    <Icon name={choice.icon} />
                  </span>
                  <div className="mt-4 text-lg font-semibold leading-tight text-carbon">
                    {choice.title}
                  </div>
                  <div className="mt-3 text-sm leading-relaxed text-graphite">{choice.text}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {steps.length > 0 ? (
          <ol className="mx-auto mt-8 flex max-w-content flex-col items-stretch justify-center overflow-hidden rounded-card border border-hairline bg-frost md:flex-row md:items-center">
            {steps.map((step, index) => (
              <li
                key={step.title}
                className="flex min-w-0 flex-1 flex-col items-center md:flex-row"
              >
                {index > 0 ? (
                  <span className="block px-2 text-2xl text-link-blue" aria-hidden="true">
                    ↓
                  </span>
                ) : null}
                <div className="w-full p-5 text-center">
                  <strong className="text-carbon">{step.title}</strong>
                  {step.text ? (
                    <span className="mt-1 block text-sm leading-relaxed text-graphite">
                      {step.text}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        ) : null}

        {valuation ? (
          <div className="mt-8 rounded-card border border-hairline bg-frost p-5 md:p-6">
            <div className={homeSectionLabelClass}>{valuation.heading}</div>
            <div className="mt-5 grid items-center gap-4 md:grid-cols-trade">
              <div className="rounded-card border border-hairline bg-white p-5">
                <div className="text-xl font-semibold text-carbon">{valuation.fromDevice}</div>
                <div className="mt-2 text-sm leading-relaxed text-ash">{valuation.fromNote}</div>
              </div>
              <div className="flex justify-center">
                <ArrowIcon />
              </div>
              <div className="rounded-card border border-hairline bg-white p-5">
                <div className="text-xl font-semibold text-carbon">{valuation.toDevice}</div>
                <div className="mt-2 text-sm leading-relaxed text-ash">{valuation.toNote}</div>
              </div>
            </div>
            <div className="mt-5 rounded-card bg-carbon px-5 py-4 text-white">
              <div className="text-sm text-white/70">{valuation.label}</div>
              <div className="mt-1 text-3xl font-semibold">{valuation.amount}</div>
            </div>
          </div>
        ) : null}

        {note ? (
          <RichText
            className="mx-auto mt-8 max-w-copy text-center text-copy leading-relaxed text-graphite"
            html={note}
            nodes={section.content.noteRichText}
          />
        ) : null}

        {section.primaryCtaLabel || section.secondaryCtaLabel ? (
          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            {section.primaryCtaLabel ? (
              <Link
                href={normalizeSiteUrl(section.primaryCtaUrl || "/trade")}
                className={primaryCtaClass}
              >
                {section.primaryCtaLabel}
              </Link>
            ) : null}
            {section.secondaryCtaLabel ? (
              <Link
                href={normalizeSiteUrl(section.secondaryCtaUrl || "/#final")}
                className={secondaryCtaClass}
              >
                {section.secondaryCtaLabel}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
