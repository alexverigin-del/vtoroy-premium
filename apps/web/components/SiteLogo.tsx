/* eslint-disable @next/next/no-img-element */
import type { SiteSettings } from "@vtoroy/shared";
import { boundedLogoSize, logoSizeStyle, normalizeSiteUrl } from "./site-chrome-utils";

function LogoMark() {
  return (
    <svg
      className="h-[var(--logo-height,22px)] w-[var(--logo-width,34px)] shrink-0"
      viewBox="0 0 34 34"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="32" height="32" rx="9" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M9.5 23V11.6c0-.4.46-.62.78-.37l7.2 5.6c.27.2.27.6 0 .8l-7.2 5.6c-.32.25-.78.03-.78-.37Z"
        fill="currentColor"
      />
      <path
        d="M18 23V11.6c0-.4.46-.62.78-.37l7.2 5.6c.27.2.27.6 0 .8l-7.2 5.6c-.32.25-.78.03-.78-.37Z"
        fill="currentColor"
        opacity="0.45"
      />
    </svg>
  );
}

export function SiteLogo({ settings }: { settings: SiteSettings }) {
  const href = normalizeSiteUrl(settings.logoHref || "/");
  const logoWidth = boundedLogoSize(settings.logoWidth, 28, 360) ?? 34;
  const logoHeight = boundedLogoSize(settings.logoHeight, 16, 120) ?? 22;
  return (
    <a
      href={href}
      aria-label={`${settings.brandName} на главную`}
      className="flex min-h-11 items-center gap-2 rounded-card text-carbon outline-none transition focus-visible:shadow-focus"
    >
      <span
        className="flex min-h-[var(--logo-height,22px)] shrink-0 items-center gap-1 text-carbon"
        style={logoSizeStyle(settings)}
      >
        {settings.logoFile ? (
          <img
            className="h-[var(--logo-height,22px)] w-[var(--logo-width,34px)] object-contain"
            src={settings.logoFile}
            alt={settings.logoAlt || settings.brandName}
            width={logoWidth}
            height={logoHeight}
            loading="eager"
            decoding="async"
            fetchPriority="low"
          />
        ) : (
          <LogoMark />
        )}
        {settings.logoCaption ? (
          <span className="max-w-logo-caption text-brand-caption font-semibold uppercase leading-brand-caption tracking-caption text-ash">
            {settings.logoCaption}
          </span>
        ) : null}
      </span>
      {settings.showBrandName === false ? null : (
        <span className="text-sm font-semibold tracking-normal text-carbon">
          {settings.brandName}
        </span>
      )}
    </a>
  );
}
