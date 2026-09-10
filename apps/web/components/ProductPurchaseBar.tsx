"use client";

import { useEffect, useState } from "react";
import type { ProductOffer } from "@vtoroy/shared";
import { ProductOfferPanel } from "./ProductOfferPanel";
import { cn } from "../lib/cn-client";

export function ProductPurchaseBar({
  offers,
  price,
  status,
  stockStatus,
  label,
  formId,
}: {
  offers: ProductOffer[];
  price: string;
  status: string;
  stockStatus: string;
  label: string;
  formId: string;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const form = document.getElementById(formId);
    const summary = document.getElementById("product-purchase-summary");
    if (!form || !summary) return;
    let formVisible = false;
    let summaryVisible = true;
    const update = () =>
      setVisible(
        !formVisible &&
          !summaryVisible &&
          !document.querySelector(
            '[role="dialog"], dialog[open], [data-consent-banner], [data-modal-pending]',
          ),
      );
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === form) formVisible = entry.isIntersecting;
        if (entry.target === summary) summaryVisible = entry.isIntersecting;
      }
      update();
    });
    observer.observe(form);
    observer.observe(summary);
    const mutations = new MutationObserver(update);
    mutations.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [formId]);
  if (!visible) return null;
  return (
    <nav
      aria-label="Действия по товару"
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-hairline bg-white px-4 pb-safe-sticky pt-3 lg:hidden"
    >
      <ProductOfferPanel
        offers={offers}
        fallbackPrice={price}
        fallbackStatus={status}
        stockStatus={stockStatus}
        compact
      />
      <a
        href={`#${formId}`}
        className={cn(
          "focus-ring inline-flex min-h-11 min-w-0 basis-3/5 items-center justify-center break-words rounded-pill px-4 py-3",
          "bg-action text-center text-sm font-semibold text-white transition hover:bg-action-blue",
        )}
      >
        {label}
      </a>
    </nav>
  );
}
