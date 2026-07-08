"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  mobileProductCtaBarClass,
  mobileProductCtaInnerClass,
  mobileProductPrimaryCtaClass,
  mobileProductSecondaryCtaClass,
} from "./ui-classes";

export function MobileProductActionBar({
  leadFormId,
  primaryAriaLabel,
  primaryLabel,
  tradeLabel = "Trade",
  tradeAriaLabel,
  navAriaLabel = "Действия по товару",
}: {
  leadFormId: string;
  primaryAriaLabel: string;
  primaryLabel: string;
  tradeLabel?: string;
  tradeAriaLabel: string;
  navAriaLabel?: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function updateVisibility() {
      setVisible(window.scrollY > 320);
    }

    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    return () => window.removeEventListener("scroll", updateVisibility);
  }, []);

  if (!visible) return null;

  return (
    <nav className={mobileProductCtaBarClass} aria-label={navAriaLabel}>
      <div className={mobileProductCtaInnerClass}>
        <Link
          href={`#${leadFormId}`}
          className={mobileProductPrimaryCtaClass}
          aria-label={primaryAriaLabel}
        >
          {primaryLabel}
        </Link>
        <Link href="/trade" className={mobileProductSecondaryCtaClass} aria-label={tradeAriaLabel}>
          {tradeLabel}
        </Link>
      </div>
    </nav>
  );
}
