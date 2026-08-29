import Link from "next/link";
import dynamic from "next/dynamic";
import type { PageSection, ProductCardData, TradePublicConfig } from "@vtoroy/shared";
import { cn } from "@/lib/cn";
import {
  marketingExampleDevice,
  marketingProductDescriptor,
  marketingProductFacts,
} from "@/lib/marketing-products";
import { ProductImage, productImageSrc } from "./ProductImage";
import { RichText } from "./RichText";
import { normalizeSiteUrl } from "./site-chrome-utils";
import { primaryPillCtaClass, secondaryPillCtaClass } from "./ui-classes";

const TradeInWizard = dynamic(
  () => import("./TradeInWizard").then((module) => module.TradeInWizard),
  {
    loading: () => (
      <div className="mx-auto min-h-96 max-w-[620px] animate-pulse rounded-card bg-surface motion-reduce:animate-none" />
    ),
  },
);

type TradeCard = {
  badge: string;
  title: string;
  heading: string;
  text: string;
  note: string;
  label: string;
  url: string;
};

type TradeStep = {
  title: string;
  text: string;
  note: string;
};

type TradeComparisonRow = {
  label: string;
  bad: string;
  good: string;
};

const managedSectionKeys = new Set([
  "trade_calculator_intro",
  "trade_paths",
  "trade_live_example",
  "trade_steps",
  "trade_compare",
]);

function TradeCalculatorSection({
  section,
  config,
}: {
  section: PageSection;
  config?: TradePublicConfig;
}) {
  if (!config?.active) return null;
  return (
    <>
      <TradeInWizard config={config} />
      {section.content.disclaimer ? (
        <div className="bg-white px-6 pb-10 text-center text-xs leading-relaxed text-muted md:pb-14">
          <p className="mx-auto max-w-copy">{String(section.content.disclaimer)}</p>
        </div>
      ) : null}
    </>
  );
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function contentRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function tradeCards(value: unknown): TradeCard[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item, index) => {
    const record = contentRecord(item);
    const card = {
      badge: stringField(record, "badge") || String(index + 1).padStart(2, "0"),
      title: stringField(record, "title"),
      heading: stringField(record, "heading"),
      text: stringField(record, "text"),
      note: stringField(record, "note"),
      label: stringField(record, "label"),
      url: stringField(record, "url"),
    };
    return card.title || card.heading || card.text ? [card] : [];
  });
}

function tradeSteps(value: unknown): TradeStep[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    const record = contentRecord(item);
    const step = {
      title: stringField(record, "title"),
      text: stringField(record, "text"),
      note: stringField(record, "note"),
    };
    return step.title || step.text || step.note ? [step] : [];
  });
}

function comparisonRows(value: unknown): TradeComparisonRow[] {
  const comparison = contentRecord(value);
  if (!Array.isArray(comparison.rows)) return [];

  return comparison.rows.flatMap((item) => {
    const record = contentRecord(item);
    const row = {
      label: stringField(record, "label"),
      bad: stringField(record, "bad"),
      good: stringField(record, "good"),
    };
    return row.label || row.bad || row.good ? [row] : [];
  });
}

function textParagraphs(value: string) {
  return value
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => (
      <p key={paragraph} className="text-sm leading-relaxed text-graphite">
        {paragraph}
      </p>
    ));
}

function TradeSectionHeader({ section }: { section: PageSection }) {
  return (
    <div className="mx-auto max-w-copy text-center">
      {section.eyebrow ? (
        <p className="text-sm font-semibold leading-snug text-link-blue">{section.eyebrow}</p>
      ) : null}
      {section.headline ? (
        <h2 className="mt-3 text-3xl font-semibold leading-tight text-carbon md:text-5xl">
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
  );
}

function TradePathsSection({ section }: { section: PageSection }) {
  const cards = tradeCards(section.content.items ?? section.content.cards);
  if (cards.length === 0) return null;

  return (
    <section className="bg-white py-14 md:py-20">
      <div className="mx-auto max-w-page px-4 md:px-6">
        <TradeSectionHeader section={section} />
        <div className="mx-auto mt-10 grid max-w-content border-y border-hairline lg:grid-cols-3">
          {cards.map((card, index) => (
            <article
              key={`${card.badge}-${card.title}`}
              className={cn(
                "flex flex-col py-7 lg:px-7 lg:py-9",
                index > 0 ? "border-t border-hairline lg:border-l lg:border-t-0" : "",
              )}
            >
              <p className="text-sm font-semibold text-link-blue">
                {card.badge}. {card.title}
              </p>
              {card.heading ? (
                <h3 className="mt-4 text-2xl font-semibold leading-tight text-carbon">
                  {card.heading}
                </h3>
              ) : null}
              {card.text ? (
                <div className="mt-5 grid gap-3">{textParagraphs(card.text)}</div>
              ) : null}
              {card.note ? (
                <p className="mt-5 text-sm font-semibold leading-relaxed text-carbon">
                  {card.note}
                </p>
              ) : null}
              {card.label && card.url ? (
                <Link
                  href={normalizeSiteUrl(card.url)}
                  className="focus-ring mt-auto inline-flex items-center gap-2 pt-7 text-sm font-semibold text-link-blue transition hover:text-action"
                >
                  {card.label}
                  <span aria-hidden="true">→</span>
                </Link>
              ) : null}
            </article>
          ))}
        </div>
        {section.content.note ? (
          <p className="mx-auto mt-7 max-w-copy text-center text-xl font-semibold leading-snug text-carbon">
            {String(section.content.note)}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function TradeLiveExampleSection({
  section,
  products,
}: {
  section: PageSection;
  products: ProductCardData[];
}) {
  const device = marketingExampleDevice(products);
  if (!device) return null;

  const valuation = contentRecord(section.content.valuation);
  const valuationHeading = stringField(valuation, "heading");
  const valuationAmount = stringField(valuation, "amount");
  const valuationNote = stringField(valuation, "from_note");
  const disclaimerLabel = String(section.content.note_label || "").trim();
  const deviceHref = device.detailHref;
  const facts = marketingProductFacts(device, 3);
  const image = productImageSrc(device.listingImage);

  return (
    <section className="bg-frost py-14 md:py-20">
      <div className="mx-auto max-w-page px-4 md:px-6">
        <TradeSectionHeader section={section} />
        <div className="mx-auto mt-10 max-w-content overflow-hidden rounded-card border border-hairline bg-white">
          <div className="grid lg:grid-cols-2">
            <article className="p-5 md:p-7">
              <p className="text-sm font-semibold text-link-blue">
                {String(section.content.label || "")}
              </p>
              <div className="mt-5 grid gap-5 sm:grid-cols-2 sm:items-center">
                <div className="relative aspect-product overflow-hidden rounded-card bg-surface">
                  {image ? (
                    <ProductImage
                      src={image}
                      alt={device.listingAlt || device.title}
                      fill
                      sizes="(min-width: 1024px) 24vw, (min-width: 640px) 45vw, 100vw"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div>
                  <h3 className="text-2xl font-semibold leading-tight text-carbon">
                    {device.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-graphite">
                    {marketingProductDescriptor(device)}
                  </p>
                  <p className="mt-5 text-3xl font-semibold leading-none text-carbon">
                    {device.priceText}
                  </p>
                  {facts.length > 0 ? (
                    <ul className="mt-5 grid gap-2 border-t border-hairline pt-4">
                      {facts.map((fact) => (
                        <li key={fact} className="text-sm leading-relaxed text-graphite">
                          {fact}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </article>

            <article className="border-t border-hairline bg-ice p-5 md:p-7 lg:border-l lg:border-t-0">
              {valuationHeading ? (
                <p className="text-sm font-semibold text-link-blue">{valuationHeading}</p>
              ) : null}
              {valuationAmount ? (
                <h3 className="mt-5 text-3xl font-semibold leading-tight text-carbon">
                  {valuationAmount}
                </h3>
              ) : null}
              {valuationNote ? (
                <div className="mt-6 grid gap-4">{textParagraphs(valuationNote)}</div>
              ) : null}
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                {section.primaryCtaLabel ? (
                  <Link
                    href={normalizeSiteUrl(section.primaryCtaUrl || "#final")}
                    className={primaryPillCtaClass}
                  >
                    {section.primaryCtaLabel}
                  </Link>
                ) : null}
                {section.secondaryCtaLabel ? (
                  <Link href={deviceHref} className={secondaryPillCtaClass}>
                    {section.secondaryCtaLabel}
                  </Link>
                ) : null}
              </div>
            </article>
          </div>
          {section.content.disclaimer ? (
            <div className="border-t border-hairline px-5 py-5 md:px-7">
              {disclaimerLabel ? (
                <p className="text-sm font-semibold text-carbon">{disclaimerLabel}</p>
              ) : null}
              <div className="mt-2 grid gap-2">
                {textParagraphs(String(section.content.disclaimer))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function TradeStepsSection({ section }: { section: PageSection }) {
  const steps = tradeSteps(section.content.steps);
  if (steps.length === 0) return null;

  return (
    <section className="bg-white py-14 md:py-20">
      <div className="mx-auto max-w-page px-4 md:px-6">
        <TradeSectionHeader section={section} />
        <ol className="mx-auto mt-10 grid max-w-content border-y border-hairline md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li
              key={`${index}-${step.title}`}
              className={cn(
                "py-6 md:p-6 lg:py-8",
                index > 0 ? "border-t border-hairline md:border-l md:border-t-0" : "",
                index === 2 ? "md:border-l-0 lg:border-l" : "",
                index > 1 ? "md:border-t lg:border-t-0" : "",
              )}
            >
              <p className="text-sm font-semibold text-link-blue">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-4 text-xl font-semibold leading-tight text-carbon">{step.title}</h3>
              {step.text ? (
                <div className="mt-4 grid gap-3">{textParagraphs(step.text)}</div>
              ) : null}
              {step.note ? (
                <p className="mt-5 border-t border-hairline pt-4 text-sm font-semibold leading-relaxed text-carbon">
                  {step.note}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function TradeCompareSection({ section }: { section: PageSection }) {
  const comparison = contentRecord(section.content.comparison);
  const rows = comparisonRows(comparison);
  if (rows.length === 0) return null;

  const labelHeader = stringField(comparison, "label_header");
  const badHeader = stringField(comparison, "bad_header");
  const goodHeader = stringField(comparison, "good_header");

  return (
    <section className="bg-frost py-14 md:py-20">
      <div className="mx-auto max-w-page px-4 md:px-6">
        <TradeSectionHeader section={section} />
        <div className="mx-auto mt-10 max-w-content overflow-hidden rounded-card border border-hairline bg-white">
          <div className="hidden grid-cols-compare border-b border-hairline bg-ice text-sm font-semibold text-carbon md:grid">
            <div className="border-r border-hairline p-4">{labelHeader}</div>
            <div className="border-r border-hairline p-4">{badHeader}</div>
            <div className="p-4 text-link-blue">{goodHeader}</div>
          </div>
          {rows.map((row) => (
            <div
              key={row.label}
              className="grid border-b border-hairline last:border-b-0 md:grid-cols-compare"
            >
              <div className="bg-ice p-4 text-sm font-semibold text-carbon md:bg-white">
                {row.label}
              </div>
              <div className="border-t border-hairline p-4 md:border-l md:border-t-0">
                <p className="text-xs font-semibold text-ash md:hidden">{badHeader}</p>
                <p className="mt-1 text-sm leading-relaxed text-graphite md:mt-0">{row.bad}</p>
              </div>
              <div className="border-t border-hairline bg-ice p-4 md:border-l md:border-t-0">
                <p className="text-xs font-semibold text-link-blue md:hidden">{goodHeader}</p>
                <p className="mt-1 text-sm font-semibold leading-relaxed text-carbon md:mt-0">
                  {row.good}
                </p>
              </div>
            </div>
          ))}
        </div>
        {section.content.note ? (
          <div className="mx-auto mt-8 max-w-copy text-center">
            <h3 className="text-2xl font-semibold leading-tight text-carbon md:text-3xl">
              {String(section.content.note)}
            </h3>
            {section.content.disclaimer ? (
              <p className="mt-3 text-copy leading-relaxed text-graphite">
                {String(section.content.disclaimer)}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function isTradeManagedSection(section: PageSection): boolean {
  return managedSectionKeys.has(section.sectionKey);
}

export function TradePageSection({
  section,
  products,
  tradeConfig,
}: {
  section: PageSection;
  products: ProductCardData[];
  tradeConfig?: TradePublicConfig;
}) {
  if (section.sectionKey === "trade_calculator_intro") {
    return <TradeCalculatorSection section={section} config={tradeConfig} />;
  }
  if (section.sectionKey === "trade_paths") return <TradePathsSection section={section} />;
  if (section.sectionKey === "trade_live_example") {
    return <TradeLiveExampleSection section={section} products={products} />;
  }
  if (section.sectionKey === "trade_steps") return <TradeStepsSection section={section} />;
  if (section.sectionKey === "trade_compare") return <TradeCompareSection section={section} />;
  return null;
}
