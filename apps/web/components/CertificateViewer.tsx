"use client";

import { useState } from "react";
import { lazy, Suspense } from "react";
import { secondaryPillCtaClass } from "./ui-classes";
const CertificateDialog = lazy(() =>
  import("./CertificateDialog").then((module) => ({ default: module.CertificateDialog })),
);

export function CertificateViewer({
  href,
  downloadHref,
  provider,
  testedAt,
  note,
  storeNote,
}: {
  href: string;
  downloadHref?: string;
  provider: string;
  testedAt: string;
  note?: string;
  storeNote?: string;
}) {
  const [open, setOpen] = useState(false);
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
      {storeNote ? <p className="mt-2 text-xs font-medium text-carbon">{storeNote}</p> : null}

      {open ? (
        <Suspense
          fallback={
            <p role="status" data-modal-pending>
              Загрузка…
            </p>
          }
        >
          <CertificateDialog
            href={href}
            downloadHref={downloadHref}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      ) : null}
    </>
  );
}
