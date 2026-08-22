import Link from "next/link";
import type { PageSection } from "@vtoroy/shared";

import { HomeSectionIntro } from "./HomeSectionIntro";
import { normalizeSiteUrl } from "./site-chrome-utils";
import { primaryCtaClass, secondaryCtaClass } from "./ui-classes";

export function NewTechSection({ section }: { section: PageSection }) {
  return (
    <section className="bg-white pb-14 md:pb-20" id="new-tech" data-component="NewTechSection">
      <div className="mx-auto max-w-page px-4 md:px-6">
        <div className="border-t border-hairline pt-12 md:pt-16">
          <HomeSectionIntro section={section} align="split" />

          {section.primaryCtaLabel || section.secondaryCtaLabel ? (
            <div className="mt-8 grid lg:grid-cols-12">
              <div className="flex flex-col gap-3 sm:flex-row lg:col-span-5 lg:col-start-8">
                {section.primaryCtaLabel ? (
                  <Link
                    href={normalizeSiteUrl(section.primaryCtaUrl || "/catalog/tech?condition=new")}
                    className={primaryCtaClass}
                  >
                    {section.primaryCtaLabel}
                  </Link>
                ) : null}
                {section.secondaryCtaLabel ? (
                  <Link
                    href={normalizeSiteUrl(section.secondaryCtaUrl || "/catalog/tech")}
                    className={secondaryCtaClass}
                  >
                    {section.secondaryCtaLabel}
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
