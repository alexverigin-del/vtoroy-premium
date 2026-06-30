import Link from "next/link";
import type { PageSection } from "@vtoroy/shared";
import { cn } from "../lib/cn";
import { normalizeSiteUrl } from "./site-chrome-utils";

type FeatureItem = {
  title: string;
  text: string;
  icon: string;
};

type PassportRow = {
  label: string;
  value: string;
  state: string;
};

type PassportCard = {
  device: string;
  sub: string;
  grade: string;
  gradeLabel: string;
  rows: PassportRow[];
  exitLabel: string;
  exitValue: string;
  warranty: string;
  warrantyStrong: string;
};

const DEFAULT_FEATURES: FeatureItem[] = [
  {
    title: "Состояние и грейд",
    text: "Батарея, корпус, экран - оценка по прозрачной шкале A / B / C.",
    icon: "device",
  },
  {
    title: "История и проверка",
    text: "Ремонт, вскрытие, влага, Face ID - зафиксировано по результатам диагностики.",
    icon: "shield",
  },
  {
    title: "Гарантия 90 дней",
    text: "Письменная гарантия, а не «верьте на слово».",
    icon: "clock",
  },
  {
    title: "Цена выхода",
    text: "Сколько вещь будет стоить, когда пойдёт дальше через своих - известно заранее.",
    icon: "chart",
  },
];

const DEFAULT_ROWS: PassportRow[] = [
  { label: "Батарея", value: "89%", state: "ok" },
  { label: "Ремонт", value: "не вскрывался", state: "ok" },
  { label: "Face ID", value: "работает", state: "ok" },
  { label: "Влага", value: "следов нет", state: "ok" },
  { label: "Экран / корпус", value: "микроцарапины", state: "ok" },
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

function featureList(value: unknown): FeatureItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title : "";
    const text = typeof record.text === "string" ? record.text : "";
    const icon =
      typeof record.icon === "string"
        ? record.icon
        : (["device", "shield", "clock", "chart"][index] ?? "device");
    return title || text ? [{ title, text, icon }] : [];
  });
}

function passportRows(value: unknown): PassportRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const label = typeof record.label === "string" ? record.label : "";
    const rowValue = typeof record.value === "string" ? record.value : "";
    const state = typeof record.state === "string" ? record.state : "ok";
    return label || rowValue ? [{ label, value: rowValue, state }] : [];
  });
}

function passportCard(value: unknown): PassportCard {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rows = passportRows(record.rows);

  return {
    device: textField(record, "device", "device", "iPhone 13 Pro"),
    sub: textField(record, "sub", "sub", "256 GB · Графитовый · IMEI ···4821"),
    grade: textField(record, "grade", "grade", "A-"),
    gradeLabel: textField(record, "gradeLabel", "grade_label", "Грейд"),
    rows: rows.length > 0 ? rows : DEFAULT_ROWS,
    exitLabel: textField(record, "exitLabel", "exit_label", "Цена выхода через 6 мес"),
    exitValue: textField(record, "exitValue", "exit_value", "до 42 000 ₽"),
    warranty: textField(record, "warranty", "warranty", "Гарантия"),
    warrantyStrong: textField(record, "warrantyStrong", "warranty_strong", "90 дней"),
  };
}

function dotClasses(state: string): string {
  if (state === "warn") return "bg-warning";
  if (state === "bad") return "bg-red-500";
  return "bg-success";
}

function Icon({ name }: { name: string }) {
  if (name === "shield") {
    return (
      <svg
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <path d="M12 3l7 4v5c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V7l7-4Z" />
        <path d="M9.5 12l1.8 1.8L15 10" />
      </svg>
    );
  }
  if (name === "clock") {
    return (
      <svg
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }
  if (name === "chart") {
    return (
      <svg
        className="h-5 w-5"
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
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <rect x="6" y="3" width="12" height="18" rx="2" />
      <path d="M9 7h6M9 11h6" />
    </svg>
  );
}

function PassportQr() {
  return (
    <svg className="h-11 w-11 rounded-md bg-frost p-1" viewBox="0 0 44 44" aria-hidden="true">
      <g fill="#1d1d1f">
        <rect x="6" y="6" width="11" height="11" />
        <rect x="9" y="9" width="5" height="5" fill="#f5f5f7" />
        <rect x="27" y="6" width="11" height="11" />
        <rect x="30" y="9" width="5" height="5" fill="#f5f5f7" />
        <rect x="6" y="27" width="11" height="11" />
        <rect x="9" y="30" width="5" height="5" fill="#f5f5f7" />
        <rect x="21" y="6" width="3" height="3" />
        <rect x="21" y="14" width="3" height="3" />
        <rect x="21" y="21" width="3" height="3" />
        <rect x="27" y="21" width="3" height="3" />
        <rect x="33" y="21" width="3" height="3" />
        <rect x="21" y="27" width="3" height="3" />
        <rect x="27" y="27" width="3" height="3" />
        <rect x="33" y="33" width="3" height="3" />
        <rect x="27" y="33" width="3" height="3" />
        <rect x="33" y="27" width="3" height="3" />
      </g>
    </svg>
  );
}

export function PassportPreviewSection({ section }: { section: PageSection }) {
  const features = featureList(section.content.features);
  const renderedFeatures = features.length > 0 ? features : DEFAULT_FEATURES;
  const card = passportCard(section.content.passport);

  return (
    <section
      className="bg-frost py-16 md:py-20"
      id="passport"
      data-component="PassportPreviewSection"
    >
      <div className="mx-auto grid max-w-[1180px] gap-8 px-4 md:grid-cols-[0.95fr_1.05fr] md:px-6">
        <div className="flex flex-col justify-center">
          {section.eyebrow ? (
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-link-blue">
              {section.eyebrow}
            </div>
          ) : null}
          {section.headline ? (
            <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-normal text-carbon md:text-5xl">
              {section.headline}
            </h2>
          ) : null}
          {section.body ? (
            <p className="mt-4 text-[17px] leading-relaxed text-graphite">{section.body}</p>
          ) : null}

          <ul className="mt-8 grid gap-3">
            {renderedFeatures.map((feature) => (
              <li
                key={`${feature.title}-${feature.text}`}
                className="flex gap-4 rounded-card border border-hairline bg-white p-4"
              >
                <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-frost text-link-blue">
                  <Icon name={feature.icon} />
                </span>
                <div>
                  <div className="font-semibold text-carbon">{feature.title}</div>
                  <div className="mt-1 text-sm leading-relaxed text-graphite">{feature.text}</div>
                </div>
              </li>
            ))}
          </ul>

          {section.primaryCtaLabel || section.secondaryCtaLabel ? (
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {section.primaryCtaLabel ? (
                <Link
                  href={normalizeSiteUrl(section.primaryCtaUrl || "/passport")}
                  className="focus-ring inline-flex min-h-11 items-center justify-center rounded-full bg-action px-7 py-3 text-sm font-semibold text-white transition hover:bg-action-blue"
                >
                  {section.primaryCtaLabel}
                </Link>
              ) : null}
              {section.secondaryCtaLabel ? (
                <Link
                  href={normalizeSiteUrl(section.secondaryCtaUrl || "/catalog")}
                  className="focus-ring inline-flex min-h-11 items-center justify-center rounded-full border border-hairline bg-white px-7 py-3 text-sm font-semibold text-carbon transition hover:border-link-blue hover:text-link-blue"
                >
                  {section.secondaryCtaLabel}
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="rounded-card border border-hairline bg-white p-4 shadow-product md:p-6">
          <div className="flex items-start justify-between gap-4 border-b border-hairline pb-5">
            <div>
              <div className="text-xl font-semibold text-carbon">{card.device}</div>
              <div className="mt-1 text-sm text-ash">{card.sub}</div>
            </div>
            <div className="rounded-card border border-hairline bg-frost px-4 py-3 text-center">
              <b className="block text-2xl text-carbon">{card.grade}</b>
              <span className="text-xs uppercase tracking-[0.08em] text-ash">
                {card.gradeLabel}
              </span>
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            {card.rows.map((row) => (
              <div
                key={`${row.label}-${row.value}`}
                className="flex items-center justify-between gap-4 rounded-card bg-frost px-4 py-3 text-sm"
              >
                <span className="flex items-center gap-2 text-graphite">
                  <span className={cn("h-2 w-2 rounded-full", dotClasses(row.state))} />
                  {row.label}
                </span>
                <span className="font-semibold text-carbon">{row.value}</span>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-card bg-carbon px-5 py-4 text-white">
            <span className="block text-sm text-white/70">{card.exitLabel}</span>
            <span className="mt-1 block text-2xl font-semibold">{card.exitValue}</span>
          </div>

          <div className="mt-5 flex items-center justify-between gap-4">
            <span className="text-sm text-graphite">
              {card.warranty} <b className="text-carbon">{card.warrantyStrong}</b> · проверка
              пройдена
            </span>
            <PassportQr />
          </div>
        </div>
      </div>
    </section>
  );
}
