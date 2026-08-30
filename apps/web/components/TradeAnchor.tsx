"use client";

import type { AnchorHTMLAttributes } from "react";

// Same-page actions must not remount the wizard or add duplicate history steps.
export function TradeAnchor({
  href,
  intent,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "onClick"> & { intent?: string }) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        const link = event.currentTarget;
        if (
          link.origin !== location.origin ||
          link.pathname !== location.pathname ||
          link.search !== location.search
        )
          return;
        const target = document.getElementById(link.hash.slice(1));
        if (!target) return;
        event.preventDefault();
        if (intent === "commission_consultation") {
          window.dispatchEvent(new Event("isvoi:trade-help"));
        }
        const heading = target.querySelector<HTMLElement>("h2, h1") ?? target;
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
        target.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
          block: "start",
        });
      }}
    />
  );
}
