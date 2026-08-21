import type { PageSection } from "@vtoroy/shared";

import { cn } from "../lib/cn";
import { RichText } from "./RichText";
import { homeSectionLabelClass } from "./ui-classes";

type HomeSectionIntroProps = {
  section: PageSection;
  align?: "center" | "split";
  className?: string;
};

export function HomeSectionIntro({ section, align = "split", className }: HomeSectionIntroProps) {
  if (!section.eyebrow && !section.headline && !section.body) return null;

  if (align === "center") {
    return (
      <div className={cn("mx-auto max-w-copy text-center", className)}>
        {section.eyebrow ? <div className={homeSectionLabelClass}>{section.eyebrow}</div> : null}
        {section.headline ? (
          <h2 className="mt-3 text-balance text-3xl font-semibold leading-tight text-carbon md:text-5xl">
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

  return (
    <div className={cn("grid gap-5 md:gap-8 lg:grid-cols-12 lg:items-end", className)}>
      <div className="lg:col-span-7">
        {section.eyebrow ? <div className={homeSectionLabelClass}>{section.eyebrow}</div> : null}
        {section.headline ? (
          <h2 className="mt-3 max-w-heading text-balance text-3xl font-semibold leading-tight text-carbon md:text-5xl">
            {section.headline}
          </h2>
        ) : null}
      </div>
      {section.body ? (
        <RichText
          className="max-w-form text-copy leading-relaxed text-graphite lg:col-span-5 lg:pb-1"
          html={section.body}
          nodes={section.bodyRichText}
        />
      ) : null}
    </div>
  );
}
