import Link from "next/link";
import type { PageSection } from "@vtoroy/shared";
import { cn } from "../lib/cn";
import { RichText } from "./RichText";
import { normalizeSiteUrl } from "./site-chrome-utils";
import { primaryPillCtaClass, publicPageHeroTitleClass, secondaryPillCtaClass } from "./ui-classes";

function items(value: unknown): { title: string; text: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title : "";
    const text = typeof row.text === "string" ? row.text : "";
    return title || text ? [{ title, text }] : [];
  });
}

export function InfoPageSectionRenderer({ section }: { section: PageSection }) {
  const isHero = section.variant === "page.hero" || section.sectionKey.endsWith("_hero");
  const isFaq = section.variant === "faq" || section.sectionKey === "faq";
  const sectionItems = items(section.content.items);

  if (isFaq && sectionItems.length > 0) {
    return (
      <section className="bg-frost py-14 md:py-20">
        <div className="mx-auto max-w-copy px-4 md:px-6">
          {section.headline ? (
            <h2 className="text-3xl font-semibold leading-tight text-carbon md:text-5xl">
              {section.headline}
            </h2>
          ) : null}
          <div className="mt-8 overflow-hidden rounded-card border border-hairline bg-white">
            {sectionItems.map((item, index) => (
              <details
                key={`${item.title}-${index}`}
                className={index ? "border-t border-hairline" : ""}
              >
                <summary className="cursor-pointer list-none p-5 font-semibold marker:hidden md:p-6">
                  {item.title}
                </summary>
                <p className="border-t border-hairline px-5 py-4 text-sm leading-relaxed text-graphite md:px-6">
                  {item.text}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={cn("bg-white", isHero ? "py-16 text-center md:py-24" : "py-12 md:py-16")}>
      <div className={cn("mx-auto px-4 md:px-6", isHero ? "max-w-page" : "max-w-copy")}>
        {section.eyebrow ? (
          <p className="text-sm font-semibold uppercase tracking-eyebrow text-link-blue">
            {section.eyebrow}
          </p>
        ) : null}
        {section.headline ? (
          isHero ? (
            <h1 className={cn("mx-auto mt-3 max-w-display", publicPageHeroTitleClass)}>
              {section.headline}
            </h1>
          ) : (
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-carbon md:text-4xl">
              {section.headline}
            </h2>
          )
        ) : null}
        {section.body ? (
          <RichText
            className={cn(
              "mt-5 text-copy leading-relaxed text-graphite",
              isHero && "mx-auto max-w-copy",
            )}
            html={section.body}
            nodes={section.bodyRichText}
          />
        ) : null}
        {sectionItems.length > 0 ? (
          <dl className="mt-8 grid gap-4 text-left sm:grid-cols-2">
            {sectionItems.map((item) => (
              <div key={item.title} className="rounded-card border border-hairline bg-frost p-5">
                <dt className="font-semibold text-carbon">{item.title}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-graphite">{item.text}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {section.primaryCtaLabel || section.secondaryCtaLabel ? (
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            {section.primaryCtaLabel ? (
              <Link
                href={normalizeSiteUrl(section.primaryCtaUrl || "/catalog")}
                className={primaryPillCtaClass}
              >
                {section.primaryCtaLabel}
              </Link>
            ) : null}
            {section.secondaryCtaLabel ? (
              <Link
                href={normalizeSiteUrl(section.secondaryCtaUrl || "/contacts")}
                className={secondaryPillCtaClass}
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
