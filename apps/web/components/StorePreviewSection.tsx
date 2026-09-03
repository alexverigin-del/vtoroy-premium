import Image from "next/image";
import Link from "next/link";
import type { PageSection } from "@vtoroy/shared";
import { cn } from "../lib/cn";
import { HomeSectionIntro } from "./HomeSectionIntro";
import { normalizeSiteUrl } from "./site-chrome-utils";
import { RichText } from "./RichText";
import { primaryCtaClass, secondaryCtaClass } from "./ui-classes";

type StepItem = {
  title: string;
  text: string;
};

type VisualContent = {
  imageAlt: string;
  captionTitle?: string;
  captionText?: string;
};

const DEFAULT_STEPS: StepItem[] = [
  {
    title: "Выбираете",
    text: "Подбираем вещь под задачу и бюджет. Каждая - с Passport и грейдом.",
  },
  {
    title: "Проверяете",
    text: "Открытая проверка при вас. Сначала история и состояние - потом решение.",
  },
  {
    title: "Забираете",
    text: "Получаете Passport, чек и письменную гарантию на 90 дней.",
  },
  {
    title: "Передаёте дальше",
    text: "Захотели обновиться - знаете цену выхода заранее. Вещь идёт дальше через своих.",
  },
];

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

function stepList(value: unknown): StepItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title : "";
    const text = typeof record.text === "string" ? record.text : "";
    return title || text ? [{ title, text }] : [];
  });
}

function visualContent(value: unknown): VisualContent {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    imageAlt: textField(
      record,
      "imageAlt",
      "image_alt",
      "Интерьер премиального бутика: дерево, каменная стойка и графитовые полки с устройствами",
    ),
    captionTitle: textField(record, "captionTitle", "caption_title", "") || undefined,
    captionText: textField(record, "captionText", "caption_text", "") || undefined,
  };
}

export function StorePreviewSection({ section }: { section: PageSection }) {
  const visual = visualContent(section.content.visual);
  const renderedSteps =
    section.content.steps == null ? DEFAULT_STEPS : stepList(section.content.steps);
  const imageSrc = section.image || "/assets/store-real-premium-hero.webp";
  const note = typeof section.content.note === "string" ? section.content.note : "";

  return (
    <section className="bg-white py-14 md:py-20" id="store">
      <div className="mx-auto max-w-page px-4 md:px-6">
        <HomeSectionIntro section={section} align="center" />

        <div className="relative mt-8 min-h-visual-md overflow-hidden rounded-img border border-hairline bg-frost md:mt-10 md:min-h-marketing-tall">
          <Image
            src={imageSrc}
            alt={visual.imageAlt}
            fill
            sizes="(min-width: 1180px) 1180px, 92vw"
            className="object-cover"
          />
          {visual.captionTitle || visual.captionText ? (
            <div className="absolute inset-x-4 bottom-4 rounded-card border border-hairline bg-white p-4 md:inset-x-auto md:bottom-6 md:left-6 md:max-w-overlay md:p-5">
              {visual.captionTitle ? (
                <strong className="block text-base font-semibold text-carbon">
                  {visual.captionTitle}
                </strong>
              ) : null}
              {visual.captionText ? (
                <span className="mt-2 block text-sm leading-relaxed text-graphite">
                  {visual.captionText}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {renderedSteps.length > 0 ? (
          <ol className="mt-8 grid border-y border-hairline md:grid-cols-2 lg:grid-cols-4">
            {renderedSteps.map((step, index) => {
              const number = String(index + 1).padStart(2, "0");
              return (
                <li
                  key={`${step.title}-${step.text}`}
                  className={cn(
                    "py-5",
                    index > 0 ? "border-t border-hairline" : "",
                    index === 1 ? "md:border-t-0 md:pl-6" : "",
                    index % 2 === 1 ? "md:border-l md:border-hairline" : "md:pr-6",
                    index > 1 ? "md:border-t md:border-hairline lg:border-t-0" : "",
                    index > 0 ? "lg:border-l lg:border-hairline lg:pl-6" : "",
                    index < renderedSteps.length - 1 ? "lg:pr-6" : "",
                  )}
                >
                  <div className="text-sm font-semibold text-link-blue">{number}</div>
                  <div className="mt-4 text-lg font-semibold leading-tight text-carbon">
                    {step.title}
                  </div>
                  <div className="mt-3 text-sm leading-relaxed text-graphite">{step.text}</div>
                </li>
              );
            })}
          </ol>
        ) : null}

        {note ? (
          <RichText
            className="mt-8 max-w-copy text-copy leading-relaxed text-graphite"
            html={note}
            nodes={section.content.noteRichText}
          />
        ) : null}

        {section.primaryCtaLabel || section.secondaryCtaLabel ? (
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {section.primaryCtaLabel ? (
              <Link
                href={normalizeSiteUrl(section.primaryCtaUrl || "/belgorod")}
                className={primaryCtaClass}
              >
                {section.primaryCtaLabel}
              </Link>
            ) : null}
            {section.secondaryCtaLabel ? (
              <Link
                href={normalizeSiteUrl(section.secondaryCtaUrl || "/catalog")}
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
