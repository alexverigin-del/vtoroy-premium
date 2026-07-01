import Link from "next/link";
import type { PageSection } from "@vtoroy/shared";
import { normalizeSiteUrl } from "./site-chrome-utils";
import { primaryCtaClass, secondaryCtaClass } from "./ui-classes";

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

const DEFAULT_CHOICES: ChoiceItem[] = [
  {
    title: "Получить деньги сейчас",
    text: "Спокойный выкуп по честной оценке. Деньги в день обращения, без ожидания случайного покупателя.",
    icon: "money",
  },
  {
    title: "Передать дальше через комиссию",
    text: "Мы проводим вещь дальше за вас - с Passport и проверкой. Вы получаете больше, круг получает проверенную вещь.",
    icon: "chart",
  },
  {
    title: "Обновиться на следующую",
    text: "Передаёте текущую вещь в зачёт и доплачиваете разницу. Обновление без продажи и хлопот.",
    icon: "swap",
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

function valuationContent(value: unknown): ValuationContent {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    heading: textField(record, "heading", "heading", "Пример оценки и перехода"),
    fromDevice: textField(record, "fromDevice", "from_device", "iPhone 12"),
    fromNote: textField(record, "fromNote", "from_note", "ваш, грейд B · 128 GB"),
    toDevice: textField(record, "toDevice", "to_device", "iPhone 13 Pro / 14 Pro"),
    toNote: textField(record, "toNote", "to_note", "проверенный, с Passport"),
    label: textField(record, "label", "label", "Доплата при переходе - от"),
    amount: textField(record, "amount", "amount", "19 900 ₽"),
  };
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
  const renderedChoices = choices.length > 0 ? choices : DEFAULT_CHOICES;
  const valuation = valuationContent(section.content.valuation);

  return (
    <section className="bg-white py-16 md:py-20" id="trade">
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

        <div className="mt-10 grid gap-3 md:grid-cols-3">
          {renderedChoices.map((choice) => (
            <div
              key={`${choice.title}-${choice.text}`}
              className="rounded-card border border-hairline bg-frost p-5"
            >
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-card bg-white text-link-blue">
                <Icon name={choice.icon} />
              </span>
              <div className="mt-6 text-lg font-semibold leading-tight text-carbon">
                {choice.title}
              </div>
              <div className="mt-3 text-sm leading-relaxed text-graphite">{choice.text}</div>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-card border border-hairline bg-frost p-5 md:p-6">
          <div className="text-sm font-semibold uppercase tracking-label text-link-blue">
            {valuation.heading}
          </div>
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
