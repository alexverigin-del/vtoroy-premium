"use client";

import type { NavigationItem, SiteSettings } from "@vtoroy/shared";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "../lib/cn";
import { externalLinkAttrs, navigationHref, sortNavigation } from "./site-chrome-utils";
import { SiteLogo } from "./SiteLogo";
import { headerCtaClass } from "./ui-classes";

function headerCta(settings: SiteSettings, navigation: NavigationItem[]): NavigationItem | null {
  return (
    sortNavigation(
      navigation.filter(
        (item) => item.location === "header" && !item.parent && item.itemRole === "cta",
      ),
    )[0] ??
    (settings.headerCtaLabel
      ? {
          id: "header-cta",
          label: settings.headerCtaLabel,
          url: settings.headerCtaUrl || "/#final",
          location: "header",
          sort: 999,
          isActive: true,
          itemRole: "cta",
        }
      : null)
  );
}

function navPath(value: string): string {
  try {
    const url = new URL(value, "https://isvoi.ru");
    return url.pathname.replace(/\/+$/, "") || "/";
  } catch {
    const path = value.split("#")[0]?.split("?")[0] || "/";
    return path.replace(/\/+$/, "") || "/";
  }
}

function isCurrentNavItem(item: NavigationItem, pathname: string): boolean {
  const href = navigationHref(item);
  if (/^(https?:|mailto:|tel:|#)/i.test(href)) return false;
  const itemPath = navPath(href);
  const currentPath = navPath(pathname);
  return itemPath === currentPath || (itemPath !== "/" && currentPath.startsWith(`${itemPath}/`));
}

function NavLink({
  active,
  item,
  onClick,
}: {
  active: boolean;
  item: NavigationItem;
  onClick?: () => void;
}) {
  return (
    <a
      href={navigationHref(item)}
      aria-current={active ? "page" : undefined}
      aria-label={item.ariaLabel || undefined}
      className={cn(
        "flex min-h-11 items-center rounded-card px-3 text-sm font-medium outline-none transition focus-visible:shadow-focus",
        active
          ? "bg-ice text-carbon opacity-100"
          : "text-graphite opacity-80 hover:text-carbon hover:opacity-100",
      )}
      onClick={onClick}
      {...externalLinkAttrs(item)}
    >
      {item.labelShort || item.label}
    </a>
  );
}

export function SiteHeader({
  settings,
  navigation,
}: {
  settings: SiteSettings;
  navigation: NavigationItem[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const mobileNavId = "site-mobile-navigation";
  const headerItems = sortNavigation(
    navigation.filter(
      (item) => item.location === "header" && !item.parent && item.itemRole !== "cta",
    ),
  );
  const cta = headerCta(settings, navigation);

  return (
    <header
      className="sticky top-0 z-50 border-b border-hairline/80 bg-white/85 backdrop-blur-xl"
      data-component="SiteHeader"
    >
      <div className="mx-auto flex max-w-shell items-center justify-between gap-4 px-5 py-1.5">
        <SiteLogo settings={settings} />

        <nav className="hidden items-center gap-2 md:flex" aria-label="Основная навигация">
          {headerItems.map((item) => (
            <NavLink key={item.id} active={isCurrentNavItem(item, pathname)} item={item} />
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {cta ? (
            <a
              href={navigationHref(cta, "/#final")}
              className={headerCtaClass}
              {...externalLinkAttrs(cta)}
            >
              {cta.label}
            </a>
          ) : null}
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-card text-carbon outline-none transition focus-visible:shadow-focus md:hidden"
            aria-label={open ? "Закрыть меню" : "Открыть меню"}
            aria-controls={mobileNavId}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <path d={open ? "M6 6l12 12M18 6L6 18" : "M3 6h18M3 12h18M3 18h18"} />
            </svg>
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-hairline bg-white px-5 py-3 md:hidden">
          <nav
            id={mobileNavId}
            className="mx-auto grid max-w-shell gap-1"
            aria-label="Мобильная навигация"
          >
            {headerItems.map((item) => (
              <NavLink
                key={item.id}
                active={isCurrentNavItem(item, pathname)}
                item={item}
                onClick={() => setOpen(false)}
              />
            ))}
            {cta ? (
              <a
                href={navigationHref(cta, "/#final")}
                className="mt-2 flex min-h-11 items-center justify-center rounded-pill bg-action-blue px-5 text-sm font-medium text-white outline-none focus-visible:shadow-focus"
                onClick={() => setOpen(false)}
                {...externalLinkAttrs(cta)}
              >
                {cta.label}
              </a>
            ) : null}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
