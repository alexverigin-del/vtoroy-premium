"use client";

import { useEffect, useRef, useState } from "react";
import { secondaryPillCtaClass } from "./ui-classes";

export function CertificateViewer({
  href,
  provider,
  testedAt,
  note,
}: {
  href: string;
  provider: string;
  testedAt: string;
  note?: string;
}) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-carbon">Публичная выписка диагностики</p>
          <p className="mt-1 text-xs text-muted">
            {provider}
            {testedAt ? ` · ${testedAt}` : ""}
          </p>
        </div>
        <button type="button" className={secondaryPillCtaClass} onClick={() => setOpen(true)}>
          Открыть сертификат
        </button>
      </div>
      {note ? <p className="mt-3 text-xs leading-relaxed text-muted">{note}</p> : null}

      {open ? (
        <div
          className="fixed inset-0 z-modal flex items-center justify-center bg-black/70 p-3 md:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Публичная выписка диагностики"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
        >
          <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-card bg-white shadow-soft">
            <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
              <p className="text-sm font-semibold">Публичная выписка диагностики</p>
              <button
                ref={closeRef}
                type="button"
                className="h-10 w-10 text-2xl leading-none text-carbon"
                aria-label="Закрыть"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-surface p-3 md:p-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={href}
                alt="Обезличенная выписка диагностики устройства"
                className="mx-auto h-auto max-w-full"
              />
            </div>
            <div className="border-t border-hairline px-4 py-3 text-right">
              <a className={secondaryPillCtaClass} href={href} download>
                Скачать копию
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
