"use client";

import { useMemo, useState } from "react";
import type { GalleryImage } from "@vtoroy/shared";

function imageSrc(path: string): string {
  if (!path) return "";
  if (/^https?:\/\//.test(path) || path.startsWith("/")) return path;
  return `/${path}`;
}

export function DeviceGallery({ images }: { images: GalleryImage[] }) {
  const normalizedImages = useMemo(
    () =>
      images
        .map((image) => ({
          ...image,
          src: imageSrc(image.src),
          label: image.label || image.role || "Фото",
        }))
        .filter((image) => image.src),
    [images],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const active = normalizedImages[activeIndex] ?? normalizedImages[0];

  if (!active) return null;

  return (
    <section className="mt-10" aria-label="Фотографии устройства">
      <figure className="overflow-hidden rounded-card border border-hairline bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={active.src}
          alt={active.alt}
          className="aspect-[4/3] w-full object-cover"
        />
        <figcaption className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-muted">
          <span>{active.label}</span>
          <span>
            {activeIndex + 1} / {normalizedImages.length}
          </span>
        </figcaption>
      </figure>

      {normalizedImages.length > 1 ? (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {normalizedImages.map((image, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={`${image.src}-${image.label}`}
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-pressed={isActive}
                className={[
                  "overflow-hidden rounded-card border bg-white text-left transition",
                  isActive
                    ? "border-accent shadow-product"
                    : "border-hairline hover:border-accent/50",
                ].join(" ")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.src}
                  alt=""
                  className="aspect-[4/3] w-full object-cover"
                />
                <span className="block truncate px-3 py-2 text-xs font-medium text-muted">
                  {image.label}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
