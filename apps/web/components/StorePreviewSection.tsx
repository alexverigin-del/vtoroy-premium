import Image from "next/image";
import Link from "next/link";
import type { PageSection } from "@vtoroy/shared";
import { normalizeSiteUrl } from "./site-chrome-utils";
import { primaryCtaClass, secondaryCtaClass } from "./ui-classes";

type StepItem = {
  title: string;
  text: string;
};

type VisualContent = {
  imageSrc: string;
  imageAlt: string;
  captionTitle: string;
  captionText: string;
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
    imageSrc: textField(record, "imageSrc", "image_src", "/assets/store-real-premium-hero.webp"),
    imageAlt: textField(
      record,
      "imageAlt",
      "image_alt",
      "Интерьер премиального бутика: дерево, каменная стойка и графитовые полки с устройствами",
    ),
    captionTitle: textField(record, "captionTitle", "caption_title", "Store как точка доверия."),
    captionText: textField(
      record,
      "captionText",
      "caption_text",
      "Чистая витрина, видимая ответственность и спокойная консультация без давления.",
    ),
  };
}

export function StorePreviewSection({ section }: { section: PageSection }) {
  const visual = visualContent(section.content.visual);
  const steps = stepList(section.content.steps);
  const renderedSteps = steps.length > 0 ? steps : DEFAULT_STEPS;
  const imageSrc = section.image || visual.imageSrc;

  return (
    <section className="bg-frost py-16 md:py-20" id="store">
      <div className="mx-auto max-w-page px-4 md:px-6">
        <div className="mx-auto max-w-copy text-center">
          {section.eyebrow ? (
            <div className="text-xs font-semibold uppercase tracking-label text-link-blue">
              {section.eyebrow}
            </div>
          ) : null}
          {section.headline ? (
            <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-normal text-carbon md:text-5xl">
              {section.headline}
            </h2>
          ) : null}
          {section.body ? (
            <p className="mt-4 text-copy leading-relaxed text-graphite">{section.body}</p>
          ) : null}
        </div>

        <div className="relative mt-10 min-h-store-visual overflow-hidden rounded-img border border-hairline bg-white md:min-h-section-visual">
          <Image
            src={imageSrc}
            alt={visual.imageAlt}
            fill
            sizes="(min-width: 1180px) 1180px, 92vw"
            className="object-cover"
          />
          <div className="absolute inset-x-4 bottom-4 rounded-card border border-hairline bg-white p-4 md:inset-x-auto md:bottom-6 md:left-6 md:max-w-overlay md:p-5">
            <strong className="block text-base font-semibold text-carbon">
              {visual.captionTitle}
            </strong>
            <span className="mt-2 block text-sm leading-relaxed text-graphite">
              {visual.captionText}
            </span>
          </div>
        </div>

        <div className="mt-8 grid gap-3 md:grid-cols-4">
          {renderedSteps.map((step, index) => {
            const number = String(index + 1).padStart(2, "0");
            return (
              <div
                key={`${step.title}-${step.text}`}
                className="rounded-card border border-hairline bg-white p-5"
              >
                <div className="text-sm font-semibold text-link-blue">{number}</div>
                <div className="mt-6 text-lg font-semibold leading-tight text-carbon">
                  {step.title}
                </div>
                <div className="mt-3 text-sm leading-relaxed text-graphite">{step.text}</div>
              </div>
            );
          })}
        </div>

        {section.primaryCtaLabel || section.secondaryCtaLabel ? (
          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            {section.primaryCtaLabel ? (
              <Link
                href={normalizeSiteUrl(section.primaryCtaUrl || "/store")}
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
