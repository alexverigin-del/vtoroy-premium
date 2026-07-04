"use client";

import { type KeyboardEvent, useId, useMemo, useState } from "react";
import type { GalleryImage } from "@vtoroy/shared";
import { cn } from "../lib/cn";
import { ProductImage, productImageSrc } from "./ProductImage";

export function DeviceGallery({ images }: { images: GalleryImage[] }) {
  const galleryId = useId();
  const normalizedImages = useMemo(
    () =>
      images
        .map((image) => ({
          ...image,
          src: productImageSrc(image.src),
          label: image.label || image.role || "Фото",
        }))
        .filter((image) => image.src),
    [images],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const boundedActiveIndex = Math.min(activeIndex, normalizedImages.length - 1);
  const active = normalizedImages[boundedActiveIndex];

  if (!active) return null;

  const activeTabId = `${galleryId}-tab-${boundedActiveIndex}`;
  const panelId = `${galleryId}-panel`;

  function focusTab(tablist: HTMLElement | null, index: number) {
    const tab = tablist?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index];
    tab?.focus();
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const lastIndex = normalizedImages.length - 1;
    const tablist = event.currentTarget.parentElement;
    const nextIndex =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? index === lastIndex
          ? 0
          : index + 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? index === 0
            ? lastIndex
            : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? lastIndex
              : null;

    if (nextIndex === null) return;
    event.preventDefault();
    setActiveIndex(nextIndex);
    window.requestAnimationFrame(() => focusTab(tablist, nextIndex));
  }

  return (
    <section aria-label="Фотографии устройства" data-component="DeviceGallery">
      <figure
        id={panelId}
        role="tabpanel"
        aria-labelledby={activeTabId}
        className="overflow-hidden rounded-card border border-hairline bg-white"
      >
        <div className="relative aspect-product w-full">
          <ProductImage
            src={active.src}
            alt={active.alt || active.label}
            fill
            sizes="(min-width: 1120px) 680px, 100vw"
            className="object-cover"
            priority={boundedActiveIndex === 0}
          />
        </div>
        <figcaption className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-muted">
          <span>{active.label}</span>
          <span>
            {boundedActiveIndex + 1} / {normalizedImages.length}
          </span>
        </figcaption>
      </figure>

      {normalizedImages.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Ракурсы устройства">
          {normalizedImages.map((image, index) => {
            const isActive = index === boundedActiveIndex;
            return (
              <button
                key={`${image.src}-${image.label}`}
                id={`${galleryId}-tab-${index}`}
                type="button"
                role="tab"
                aria-controls={panelId}
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveIndex(index)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                className={cn(
                  "min-h-touch rounded-pill border px-4 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  isActive
                    ? "border-accent bg-accent text-white"
                    : "border-hairline bg-white text-muted hover:border-accent/50 hover:text-accent",
                )}
              >
                {image.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
