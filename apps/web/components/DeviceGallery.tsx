"use client";

import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { GalleryImage } from "@vtoroy/shared";
import { cn } from "../lib/cn";
import { ProductImage, productImageSrc } from "./ProductImage";
import { ProductImageViewer } from "./ProductImageViewer";
import { productImageLensStyle } from "./product-image-zoom-utils";
import { productImageLensClass, productImageZoomBadgeClass } from "./ui-classes";

const LENS_WIDTH = 176;
const LENS_HEIGHT = 132;
const LENS_ZOOM = 2.25;

type LensPosition = {
  visible: boolean;
  left: number;
  top: number;
  backgroundX: number;
  backgroundY: number;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

export function DeviceGallery({ images }: { images: GalleryImage[] }) {
  const galleryId = useId();
  const normalizedImages = useMemo(
    () =>
      images
        .map((image) => ({
          ...image,
          src: productImageSrc(image.src),
          zoomSrc: productImageSrc(image.zoomSrc || image.src),
          label: image.label || image.role || "Фото",
        }))
        .filter((image) => image.src),
    [images],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [lens, setLens] = useState<LensPosition>({
    visible: false,
    left: 0,
    top: 0,
    backgroundX: 50,
    backgroundY: 50,
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const boundedActiveIndex = Math.min(activeIndex, normalizedImages.length - 1);
  const active = normalizedImages[boundedActiveIndex];
  const activeTabId = `${galleryId}-tab-${boundedActiveIndex}`;
  const panelId = `${galleryId}-panel`;

  const showImage = useCallback(
    (index: number) => {
      const count = normalizedImages.length;
      if (count) setActiveIndex((index + count) % count);
    },
    [normalizedImages.length],
  );

  if (!active) return null;

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

  function updateLens(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const rawX = event.clientX - rect.left;
    const rawY = event.clientY - rect.top;
    setLens({
      visible: true,
      left: clamp(rawX, LENS_WIDTH / 2, rect.width - LENS_WIDTH / 2),
      top: clamp(rawY, LENS_HEIGHT / 2, rect.height - LENS_HEIGHT / 2),
      backgroundX: clamp((rawX / rect.width) * 100, 0, 100),
      backgroundY: clamp((rawY / rect.height) * 100, 0, 100),
    });
  }

  return (
    <section aria-label="Фотографии устройства" data-component="DeviceGallery">
      <figure
        id={panelId}
        role="tabpanel"
        aria-labelledby={normalizedImages.length > 1 ? activeTabId : undefined}
        aria-label={normalizedImages.length === 1 ? active.label : undefined}
        className="overflow-hidden rounded-card border border-hairline bg-white"
      >
        <div className="relative aspect-product w-full">
          <button
            ref={triggerRef}
            type="button"
            className="group relative block h-full w-full cursor-zoom-in overflow-hidden text-left outline-none focus-visible:shadow-focus"
            aria-label={`Увеличить фото: ${active.label}`}
            onPointerEnter={updateLens}
            onPointerMove={updateLens}
            onPointerLeave={() => setLens((current) => ({ ...current, visible: false }))}
            onClick={() => setViewerOpen(true)}
          >
            <ProductImage
              src={active.src}
              alt={active.alt || active.label}
              fill
              sizes="(min-width: 1120px) 680px, 100vw"
              className="pointer-events-none object-cover"
              priority={boundedActiveIndex === 0}
            />
            <span className={productImageZoomBadgeClass}>Увеличить</span>
            {lens.visible ? (
              <span
                aria-hidden="true"
                data-component="ProductImageLens"
                className={productImageLensClass}
                style={productImageLensStyle({
                  left: lens.left,
                  top: lens.top,
                  backgroundImage: active.zoomSrc,
                  backgroundX: lens.backgroundX,
                  backgroundY: lens.backgroundY,
                  zoom: LENS_ZOOM,
                })}
              />
            ) : null}
          </button>
        </div>
        <figcaption
          className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-muted"
          aria-live="polite"
        >
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

      <ProductImageViewer
        images={normalizedImages}
        activeIndex={boundedActiveIndex}
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        onSelect={showImage}
        returnFocusRef={triggerRef}
      />
    </section>
  );
}
