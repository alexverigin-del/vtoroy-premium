"use client";

import type { ReactNode } from "react";
import { useId, useState } from "react";

type CatalogMobileFilterDrawerProps = {
  activeCount: number;
  children: ReactNode;
  title: ReactNode;
  triggerClassName: string;
};

export function CatalogMobileFilterDrawer({
  activeCount,
  children,
  title,
  triggerClassName,
}: CatalogMobileFilterDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setIsOpen(true)}>
        <span>{title}</span>
        {activeCount > 0 ? (
          <span className="ml-2 rounded-pill bg-frost px-2 py-0.5 text-xs text-muted">
            {activeCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-carbon/35"
            aria-label="close"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-screen overflow-y-auto rounded-t-card bg-white p-5 shadow-soft">
            <div className="flex items-center justify-between gap-4">
              <h2 id={titleId} className="text-lg font-semibold text-carbon">
                {title}
              </h2>
              <button
                type="button"
                className="focus-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-pill border border-hairline bg-white text-xl text-carbon"
                aria-label="close"
                onClick={() => setIsOpen(false)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <div className="mt-4" aria-labelledby={titleId}>
              {children}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
