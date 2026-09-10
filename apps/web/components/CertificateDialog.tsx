"use client";

import { keepDialogFocus, lockBodyScroll } from "../lib/body-scroll-lock";
import { useEffect, useRef, useState } from "react";
import { secondaryPillCtaClass } from "./ui-classes";

export function CertificateDialog({
  href,
  downloadHref,
  onClose,
}: {
  href: string;
  downloadHref?: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    const unlock = lockBodyScroll();
    dialog?.showModal();

    return () => {
      dialog?.close();
      unlock();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onKeyDown={keepDialogFocus}
      onClose={onClose}
      aria-label="Публичная выписка диагностики"
      className="m-auto max-h-dialog w-dialog max-w-5xl rounded-card bg-white p-0 backdrop:bg-black/70"
    >
      <div className="flex items-center justify-between gap-4 border-b border-hairline px-4 py-3">
        <p className="font-semibold">Публичная выписка диагностики</p>
        <button
          autoFocus
          type="button"
          onClick={onClose}
          aria-label="Закрыть сертификат"
          className="focus-ring min-h-11 min-w-11 text-2xl"
        >
          ×
        </button>
      </div>
      <div className="max-h-certificate overflow-auto bg-surface p-3">
        {failed ? (
          <div className="p-4 text-center">
            <p role="alert">Не удалось загрузить сертификат.</p>
            <button
              type="button"
              className={secondaryPillCtaClass}
              onClick={() => setFailed(false)}
            >
              Повторить
            </button>
          </div>
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={href}
              onError={() => setFailed(true)}
              alt="Обезличенная выписка диагностики устройства"
              className="mx-auto h-auto max-w-full"
            />
          </>
        )}
      </div>
      <div className="border-t border-hairline p-4 text-right">
        <a href={downloadHref || href} download className={secondaryPillCtaClass}>
          Скачать копию
        </a>
      </div>
    </dialog>
  );
}
