"use client";

import { useEffect, useRef } from "react";
import { lockBodyScroll } from "../lib/body-scroll-lock";
import type { ConsentCategory, IntegrationConsentSettings } from "@vtoroy/shared";
import type { OptionalConsentCategory } from "@/lib/site-integrations";

function categoryCopy(
  category: ConsentCategory,
  settings: IntegrationConsentSettings,
): { label: string; description: string } {
  switch (category) {
    case "necessary":
      return { label: settings.necessaryLabel, description: settings.necessaryDescription };
    case "analytics":
      return { label: settings.analyticsLabel, description: settings.analyticsDescription };
    case "marketing":
      return { label: settings.marketingLabel, description: settings.marketingDescription };
    case "support":
      return { label: settings.supportLabel, description: settings.supportDescription };
  }
}

export function ConsentDialog({
  settings,
  privacyUrl,
  categories,
  onChange,
  onSave,
  onClose,
}: {
  settings: IntegrationConsentSettings;
  privacyUrl?: string;
  categories: Record<OptionalConsentCategory, boolean>;
  onChange: (category: OptionalConsentCategory, checked: boolean) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const unlock = lockBodyScroll();
    const previousFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      unlock();
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-modal grid items-end bg-onyx bg-opacity-40 p-3 sm:items-center sm:justify-center sm:p-6"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="integration-consent-title"
        aria-describedby="integration-consent-description"
        className="max-h-dialog w-full min-w-0 max-w-overlay-wide overflow-y-auto break-words rounded-card border border-hairline bg-white sm:max-h-dialog-sm"
      >
        <div className="flex items-start justify-between gap-6 border-b border-hairline px-5 py-5 sm:px-7">
          <div className="min-w-0">
            <h2 id="integration-consent-title" className="text-2xl font-semibold leading-tight">
              {settings.settingsTitle}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={settings.closeLabel}
            className="grid min-h-11 min-w-11 place-items-center rounded-pill border border-hairline text-xl leading-none outline-none transition hover:bg-frost focus-visible:shadow-focus"
          >
            ×
          </button>
        </div>
        <div className="px-5 py-5 sm:px-7">
          <p id="integration-consent-description" className="text-sm leading-relaxed text-ash">
            {settings.settingsBody}
          </p>
          <div className="mt-6 grid grid-cols-1 divide-y divide-hairline">
            {(["necessary", "analytics", "marketing", "support"] as ConsentCategory[]).map(
              (category) => {
                const copy = categoryCopy(category, settings);
                const necessary = category === "necessary";
                const checked = necessary || categories[category as OptionalConsentCategory];
                return (
                  <label
                    key={category}
                    className="flex min-w-0 cursor-pointer items-start justify-between gap-3 py-4"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-carbon">{copy.label}</span>
                      <span className="mt-1 block text-sm leading-relaxed text-ash">
                        {copy.description}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={necessary}
                      onChange={(event) =>
                        !necessary &&
                        onChange(category as OptionalConsentCategory, event.currentTarget.checked)
                      }
                      className="mt-1 h-5 w-5 shrink-0 accent-accent"
                    />
                  </label>
                );
              },
            )}
          </div>
          <div className="mt-6 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            {privacyUrl ? (
              <a
                href={privacyUrl}
                className="inline-flex min-h-11 items-center text-sm text-link-blue underline-offset-4 outline-none hover:underline focus-visible:shadow-focus"
              >
                {settings.privacyLinkLabel}
              </a>
            ) : (
              <span />
            )}
            <button type="button" onClick={onSave} className="btn-pill min-h-11">
              {settings.saveLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
