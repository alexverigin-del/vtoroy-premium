import type { PageSection } from "@vtoroy/shared";

import { cn } from "../lib/cn-client";
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
      <div className={cn("home-intro-centered", className)} data-component="HomeSectionIntro">
        {section.eyebrow ? <div className={homeSectionLabelClass}>{section.eyebrow}</div> : null}
        {section.headline ? (
          <h2 className="mt-3 text-balance text-3xl font-semibold leading-tight tracking-normal text-carbon md:text-5xl">
            {section.headline}
          </h2>
        ) : null}
        {section.body ? (
          <RichText
            className="mx-auto mt-4 max-w-body-copy text-copy font-normal leading-relaxed text-graphite"
            html={section.body}
            nodes={section.bodyRichText}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className={className} data-component="HomeSectionIntro">
      {section.eyebrow ? <div className={homeSectionLabelClass}>{section.eyebrow}</div> : null}
      <div
        className={cn(
          "grid gap-4 md:gap-8 lg:grid-cols-12 lg:items-start",
          section.eyebrow && "mt-3",
        )}
      >
        <div className="lg:col-span-7">
          {section.headline ? (
            <h2 className="max-w-heading text-balance text-3xl font-semibold leading-tight tracking-normal text-carbon md:text-5xl">
              {section.headline}
            </h2>
          ) : null}
        </div>
        {section.body ? (
          <RichText
            className="max-w-form text-copy font-normal leading-relaxed text-graphite lg:col-span-5"
            html={section.body}
            nodes={section.bodyRichText}
          />
        ) : null}
      </div>
    </div>
  );
}
