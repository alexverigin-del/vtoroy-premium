"use client";

import { keepDialogFocus, lockBodyScroll } from "../lib/body-scroll-lock";
import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";

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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    const trigger = triggerRef.current;
    if (!dialog) return;
    const unlock = lockBodyScroll();
    dialog.showModal();

    const desktop = window.matchMedia("(min-width: 768px)");
    const onResize = () => {
      if (desktop.matches) setIsOpen(false);
    };
    desktop.addEventListener("change", onResize);
    onResize();
    return () => {
      desktop.removeEventListener("change", onResize);
      dialog.close();
      unlock();
      trigger?.focus();
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={triggerClassName}
        onClick={() => setIsOpen(true)}
      >
        <span>{title}</span>
        {activeCount > 0 ? (
          <span className="ml-2 rounded-pill bg-frost px-2 py-0.5 text-xs text-muted">
            {activeCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <dialog
          ref={dialogRef}
          aria-labelledby={titleId}
          onCancel={() => setIsOpen(false)}
          onKeyDown={keepDialogFocus}
          onClose={() => setIsOpen(false)}
          onClick={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false);
          }}
          className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-carbon/35"
        >
          <div className="absolute inset-x-0 bottom-0 max-h-dialog overflow-y-auto rounded-t-card bg-white p-5 pb-safe-sticky">
            <div className="flex items-center justify-between gap-4">
              <h2 id={titleId} className="text-lg font-semibold text-carbon">
                {title}
              </h2>
              <button
                type="button"
                className="focus-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-pill border border-hairline bg-white text-xl text-carbon"
                autoFocus
                aria-label="Закрыть фильтры"
                onClick={() => setIsOpen(false)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <div className="mt-4" aria-labelledby={titleId}>
              {children}
            </div>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
