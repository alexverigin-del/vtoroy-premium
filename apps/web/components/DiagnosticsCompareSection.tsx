import Image from "next/image";
import type { PageSection } from "@vtoroy/shared";
import { homeSectionLabelClass } from "./ui-classes";

type DiagnosticsContent = {
  imageSrc: string;
  imageAlt: string;
  noteLabel: string;
  noteText: string;
};

type ComparisonRow = {
  label: string;
  bad: string;
  good: string;
};

type ComparisonContent = {
  ariaLabel: string;
  labelHeader: string;
  badHeader: string;
  goodHeader: string;
  rows: ComparisonRow[];
};

function textField(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey: string,
  fallback: string,
): string {
  const camelField = record[camelKey];
  const snakeField = record[snakeKey];
  if (typeof camelField === "string" && camelField.trim()) return camelField;
  if (typeof snakeField === "string" && snakeField.trim()) return snakeField;
  return fallback;
}

function diagnosticsContent(value: unknown): DiagnosticsContent {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    imageSrc: textField(record, "imageSrc", "image_src", "/assets/generated-diagnostics.webp"),
    imageAlt: textField(
      record,
      "imageAlt",
      "image_alt",
      "Открытая диагностика смартфона на чистом белом столе в премиальной сервисной зоне",
    ),
    noteLabel: textField(record, "noteLabel", "note_label", "Открытая проверка"),
    noteText: textField(record, "noteText", "note_text", "Состояние видно до решения о покупке."),
  };
}

function comparisonRows(value: unknown): ComparisonRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const label = typeof row.label === "string" ? row.label : "";
    const bad = typeof row.bad === "string" ? row.bad : "";
    const good = typeof row.good === "string" ? row.good : "";
    return label || bad || good ? [{ label, bad, good }] : [];
  });
}

function comparisonContent(value: unknown): ComparisonContent {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rows = comparisonRows(record.rows);

  return {
    ariaLabel: textField(
      record,
      "ariaLabel",
      "aria_label",
      "Сравнение случайного рынка и круга I СВОИ",
    ),
    labelHeader: textField(record, "labelHeader", "label_header", "Что вы получаете"),
    badHeader: textField(record, "badHeader", "bad_header", "Случайный рынок"),
    goodHeader: textField(record, "goodHeader", "good_header", "Круг I СВОИ"),
    rows:
      rows.length > 0
        ? rows
        : [
            { label: "История вещи", bad: "неизвестна", good: "I СВОИ Passport" },
            { label: "Через кого вещь", bad: "через незнакомца", good: "через своих" },
            { label: "Цена", bad: "только сегодня", good: "ориентир выхода понятен" },
            { label: "Состояние", bad: "вера на слово", good: "проверка при вас" },
          ],
  };
}

function XIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M5 12l4 4 10-10" />
    </svg>
  );
}

export function DiagnosticsCompareSection({ section }: { section: PageSection }) {
  const diagnostics = diagnosticsContent(section.content.diagnostics);
  const comparison = comparisonContent(section.content.comparison);
  const imageSrc = section.image || diagnostics.imageSrc;

  return (
    <section className="bg-white py-16 md:py-20" id="diagnostics">
      <div className="mx-auto max-w-page px-4 md:px-6">
        <div className="mx-auto max-w-copy text-center">
          {section.eyebrow ? <div className={homeSectionLabelClass}>{section.eyebrow}</div> : null}
          {section.headline ? (
            <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-normal text-carbon md:text-5xl">
              {section.headline}
            </h2>
          ) : null}
          {section.body ? (
            <p className="mt-4 text-copy leading-relaxed text-graphite">{section.body}</p>
          ) : null}
        </div>

        <div className="relative mt-10 min-h-visual-md overflow-hidden rounded-img border border-hairline bg-frost md:min-h-section-visual">
          <Image
            src={imageSrc}
            alt={diagnostics.imageAlt}
            fill
            sizes="(min-width: 1180px) 1180px, 92vw"
            className="object-cover"
          />
          <div className="absolute inset-x-4 bottom-4 rounded-card border border-hairline bg-white p-4 md:inset-x-auto md:bottom-6 md:left-6 md:max-w-overlay md:p-5">
            <span className={homeSectionLabelClass}>{diagnostics.noteLabel}</span>
            <strong className="mt-2 block text-base font-semibold leading-snug text-carbon">
              {diagnostics.noteText}
            </strong>
          </div>
        </div>

        <div
          className="mt-8 overflow-hidden rounded-card border border-hairline bg-white"
          role="table"
          aria-label={comparison.ariaLabel}
        >
          <div
            className="hidden grid-cols-compare bg-frost text-sm font-semibold text-carbon md:grid"
            role="row"
          >
            <div className="border-r border-hairline p-4" role="columnheader">
              {comparison.labelHeader}
            </div>
            <div className="border-r border-hairline p-4" role="columnheader">
              {comparison.badHeader}
            </div>
            <div className="p-4" role="columnheader">
              {comparison.goodHeader}
            </div>
          </div>

          {comparison.rows.map((row) => (
            <div
              key={`${row.label}-${row.bad}-${row.good}`}
              className="grid gap-0 border-t border-hairline md:grid-cols-compare"
              role="row"
            >
              <div
                className="bg-frost p-4 text-sm font-semibold text-carbon md:bg-white"
                role="cell"
              >
                {row.label}
              </div>
              <div
                className="flex gap-2 border-t border-hairline p-4 text-sm leading-relaxed text-red-700 md:border-l md:border-t-0"
                role="cell"
              >
                <XIcon />
                <span>{row.bad}</span>
              </div>
              <div
                className="flex gap-2 border-t border-hairline p-4 text-sm font-medium leading-relaxed text-success md:border-l md:border-t-0"
                role="cell"
              >
                <CheckIcon />
                <span>{row.good}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
