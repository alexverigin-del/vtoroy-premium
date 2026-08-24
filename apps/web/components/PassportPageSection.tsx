import Link from "next/link";
import type { PageSection } from "@vtoroy/shared";

import { cn } from "@/lib/cn";
import { RichText } from "./RichText";
import { normalizeSiteUrl } from "./site-chrome-utils";
import { primaryPillCtaClass, secondaryPillCtaClass } from "./ui-classes";

type PassportItem = {
  badge: string;
  title: string;
  text: string;
  note: string;
};

const managedSectionKeys = new Set([
  "passport_principles",
  "passport_grades",
  "passport_statement",
  "passport_limits",
  "passport_trade",
]);

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function passportItems(value: unknown): PassportItem[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const parsed = {
      badge: stringField(record, "badge"),
      title: stringField(record, "title"),
      text: stringField(record, "text"),
      note: stringField(record, "note"),
    };
    return parsed.badge || parsed.title || parsed.text || parsed.note ? [parsed] : [];
  });
}

function PassportSectionHeader({ section }: { section: PageSection }) {
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
      {section.subheadline ? (
        <p className="mt-3 text-2xl font-semibold leading-tight text-link-blue md:text-3xl">
          {section.subheadline}
        </p>
      ) : null}
      {section.body ? (
        <RichText
          className="mx-auto mt-5 max-w-measure text-copy leading-relaxed text-graphite"
          html={section.body}
          nodes={section.bodyRichText}
        />
      ) : null}
    </div>
  );
}

function PassportPrinciplesSection({ section }: { section: PageSection }) {
  const items = passportItems(section.content.items ?? section.content.cards);
  if (items.length === 0) return null;

  return (
    <section className="bg-frost py-14 md:py-20">
      <div className="mx-auto max-w-page px-4 md:px-6">
        <div className="mx-auto grid max-w-content border-y border-hairline lg:grid-cols-3">
          {items.map((item, index) => (
            <article
              key={`${item.badge}-${item.title}`}
              className={cn(
                "py-7 lg:px-7 lg:py-9",
                index > 0 ? "border-t border-hairline lg:border-l lg:border-t-0" : "",
              )}
            >
              {item.badge ? (
                <p className="text-sm font-semibold leading-snug text-link-blue">{item.badge}</p>
              ) : null}
              {item.title ? (
                <h2 className="mt-4 text-2xl font-semibold leading-tight text-carbon md:text-3xl">
                  {item.title}
                </h2>
              ) : null}
              {item.text ? (
                <p className="mt-4 text-base leading-relaxed text-graphite">{item.text}</p>
              ) : null}
              {item.note ? (
                <p className="mt-5 border-t border-hairline pt-4 text-sm font-semibold leading-relaxed text-carbon">
                  {item.note}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function PassportGradesSection({ section }: { section: PageSection }) {
  const grades = passportItems(section.content.items ?? section.content.cards);
  const proof = stringList(section.content.proof);
  const cues = stringList(section.content.cues);
  if (grades.length === 0) return null;

  return (
    <section className="bg-frost py-14 md:py-20">
      <div className="mx-auto max-w-page px-4 md:px-6">
        <PassportSectionHeader section={section} />
        <div className="mx-auto mt-10 grid max-w-content overflow-hidden rounded-card border border-hairline bg-white lg:grid-cols-passport-grade">
          <dl className="grid sm:grid-cols-2">
            {grades.map((grade, index) => (
              <div
                key={`${grade.badge}-${grade.title}`}
                className={cn(
                  "grid grid-cols-grade gap-4 p-5 md:p-6",
                  index > 0 ? "border-t border-hairline sm:border-t-0" : "",
                  index % 2 === 1 ? "sm:border-l sm:border-hairline" : "",
                  index > 1 ? "sm:border-t sm:border-hairline" : "",
                )}
              >
                <dt className="text-3xl font-semibold leading-none text-link-blue">
                  {grade.badge || grade.title}
                </dt>
                <dd className="text-sm leading-relaxed text-graphite">
                  {grade.text || grade.note}
                </dd>
              </div>
            ))}
          </dl>
          <aside className="border-t border-hairline bg-ice p-5 md:p-7 lg:border-l lg:border-t-0">
            {proof.length > 0 ? (
              <div className="grid gap-3">
                {proof.map((item) => (
                  <p key={item} className="text-base font-semibold leading-relaxed text-carbon">
                    {item}
                  </p>
                ))}
              </div>
            ) : null}
            {cues.length > 0 ? (
              <dl className="mt-6 border-t border-hairline pt-5">
                {cues.map((cue) => {
                  const [term, ...description] = cue.split("→");
                  return (
                    <div key={cue} className="grid grid-cols-grade gap-3 py-2">
                      <dt className="text-sm font-semibold text-carbon">{term.trim()}</dt>
                      <dd className="text-sm leading-relaxed text-graphite">
                        {description.join("→").trim()}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            ) : null}
          </aside>
        </div>
        {section.content.note ? (
          <p className="mx-auto mt-6 max-w-content text-center text-sm font-semibold leading-relaxed text-carbon">
            {String(section.content.note)}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function PassportStatementSection({ section }: { section: PageSection }) {
  return (
    <section className="bg-white py-14 md:py-24">
      <div className="mx-auto grid max-w-page gap-8 px-4 md:px-6 lg:grid-cols-editorial lg:gap-16">
        <div>
          {section.eyebrow ? (
            <p className="text-sm font-semibold leading-snug text-link-blue">{section.eyebrow}</p>
          ) : null}
          {section.headline ? (
            <h2 className="mt-4 text-4xl font-semibold leading-tight text-carbon md:text-5xl">
              {section.headline}
            </h2>
          ) : null}
          {section.subheadline ? (
            <p className="mt-4 text-2xl font-semibold leading-tight text-link-blue md:text-3xl">
              {section.subheadline}
            </p>
          ) : null}
        </div>
        <div>
          {section.body ? (
            <RichText
              className="text-lg leading-relaxed text-graphite"
              html={section.body}
              nodes={section.bodyRichText}
            />
          ) : null}
          {section.content.note ? (
            <p className="mt-8 border-t border-hairline pt-6 text-xl font-semibold leading-snug text-carbon">
              {String(section.content.note)}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function PassportLimitsSection({ section }: { section: PageSection }) {
  return (
    <section className="bg-frost py-14 md:py-20">
      <div className="mx-auto max-w-page px-4 md:px-6">
        <div className="mx-auto max-w-content border-y border-hairline py-8 md:py-12">
          <PassportSectionHeader section={section} />
          {section.content.note ? (
            <p className="mx-auto mt-8 max-w-copy text-center text-2xl font-semibold leading-tight text-carbon md:text-3xl">
              {String(section.content.note)}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function PassportTradeSection({ section }: { section: PageSection }) {
  return (
    <section className="bg-white py-14 md:py-20">
      <div className="mx-auto max-w-page px-4 md:px-6">
        <div className="mx-auto grid max-w-content gap-8 rounded-card border border-hairline bg-ice p-6 md:p-10 lg:grid-cols-editorial lg:items-end">
          <div>
            {section.eyebrow ? (
              <p className="text-sm font-semibold leading-snug text-link-blue">{section.eyebrow}</p>
            ) : null}
            {section.headline ? (
              <h2 className="mt-3 text-3xl font-semibold leading-tight text-carbon md:text-5xl">
                {section.headline}
              </h2>
            ) : null}
          </div>
          <div>
            {section.body ? (
              <RichText
                className="text-copy leading-relaxed text-graphite"
                html={section.body}
                nodes={section.bodyRichText}
              />
            ) : null}
            {section.primaryCtaLabel || section.secondaryCtaLabel ? (
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                {section.primaryCtaLabel ? (
                  <Link
                    href={normalizeSiteUrl(section.primaryCtaUrl || "/trade")}
                    className={primaryPillCtaClass}
                  >
                    {section.primaryCtaLabel}
                  </Link>
                ) : null}
                {section.secondaryCtaLabel ? (
                  <Link
                    href={normalizeSiteUrl(section.secondaryCtaUrl || "/catalog")}
                    className={secondaryPillCtaClass}
                  >
                    {section.secondaryCtaLabel}
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

export function isPassportManagedSection(section: PageSection): boolean {
  return managedSectionKeys.has(section.sectionKey);
}

export function PassportPageSection({ section }: { section: PageSection }) {
  if (section.sectionKey === "passport_principles") {
    return <PassportPrinciplesSection section={section} />;
  }
  if (section.sectionKey === "passport_grades") {
    return <PassportGradesSection section={section} />;
  }
  if (section.sectionKey === "passport_statement") {
    return <PassportStatementSection section={section} />;
  }
  if (section.sectionKey === "passport_limits") {
    return <PassportLimitsSection section={section} />;
  }
  if (section.sectionKey === "passport_trade") {
    return <PassportTradeSection section={section} />;
  }
  return null;
}
