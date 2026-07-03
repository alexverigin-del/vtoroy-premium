import type { NavigationItem, SiteSettings } from "@vtoroy/shared";
import { externalLinkAttrs, navigationHref, sortNavigation } from "./site-chrome-utils";
import { SiteLogo } from "./SiteLogo";

const footerLinkClass =
  "inline-flex min-h-11 items-center text-sm text-ash outline-none transition hover:text-carbon focus-visible:shadow-focus";

const mobileFooterSummaryClass =
  "flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-card px-4 text-sm font-semibold text-carbon outline-none transition marker:hidden focus-visible:shadow-focus";

export function SiteFooter({
  settings,
  navigation,
}: {
  settings: SiteSettings;
  navigation: NavigationItem[];
}) {
  const footerItems = sortNavigation(navigation.filter((item) => item.location === "footer"));
  const parentItems = footerItems.filter((item) => !item.parent);
  const columns = parentItems.length
    ? parentItems
    : [
        {
          id: "footer-links",
          label: "Навигация",
          url: "#top",
          location: "footer" as const,
          sort: 1,
          isActive: true,
        },
      ];
  const columnLinks = (columnId: string) =>
    parentItems.length ? footerItems.filter((item) => item.parent === columnId) : footerItems;

  return (
    <footer className="border-t border-hairline bg-white py-12" data-component="SiteFooter">
      <div className="mx-auto max-w-shell px-5">
        {settings.footerNote ? (
          <p className="max-w-copy-wide text-sm leading-relaxed text-ash">{settings.footerNote}</p>
        ) : null}
        <div className="mt-9 grid content-start gap-4 md:hidden">
          <SiteLogo settings={settings} />
          <p className="max-w-caption text-sm leading-relaxed text-ash">
            {settings.footerBrandText || settings.tagline}
          </p>
        </div>
        <div className="mt-8 grid gap-2 md:hidden">
          {columns.map((column) => {
            const links = columnLinks(column.id);
            return (
              <details
                key={column.id}
                className="group rounded-card border border-hairline bg-white"
              >
                <summary className={mobileFooterSummaryClass}>
                  <span>{column.label}</span>
                  <span
                    className="text-lg leading-none text-link-blue transition group-open:rotate-45"
                    aria-hidden="true"
                  >
                    +
                  </span>
                </summary>
                <div className="grid gap-1 border-t border-hairline px-4 py-2">
                  {links.map((item) => (
                    <a
                      key={item.id}
                      href={navigationHref(item)}
                      aria-label={item.ariaLabel || undefined}
                      className={footerLinkClass}
                      {...externalLinkAttrs(item)}
                    >
                      {item.label}
                    </a>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
        <div className="mt-9 hidden gap-8 md:grid md:grid-cols-footer">
          <div className="grid content-start gap-4">
            <SiteLogo settings={settings} />
            <p className="max-w-caption text-sm leading-relaxed text-ash">
              {settings.footerBrandText || settings.tagline}
            </p>
          </div>
          {columns.map((column) => {
            const links = columnLinks(column.id);
            return (
              <div key={column.id}>
                <h4 className="mb-3 text-sm font-semibold text-carbon">{column.label}</h4>
                <div className="grid gap-1">
                  {links.map((item) => (
                    <a
                      key={item.id}
                      href={navigationHref(item)}
                      aria-label={item.ariaLabel || undefined}
                      className={footerLinkClass}
                      {...externalLinkAttrs(item)}
                    >
                      {item.label}
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-10 flex flex-wrap gap-3 border-t border-hairline pt-5 text-xs text-ash">
          {settings.footerCopyright ? <span>{settings.footerCopyright}</span> : null}
          {settings.footerLegal ? <span>{settings.footerLegal}</span> : null}
        </div>
      </div>
    </footer>
  );
}
