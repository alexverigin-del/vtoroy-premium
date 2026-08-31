"use client";

import {
  type PointerEvent,
  type RefObject,
  type WheelEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { GalleryImage } from "@vtoroy/shared";
import { cn } from "../lib/cn-client";
import { productImageTransformStyle } from "./product-image-zoom-utils";
import {
  productImageViewerControlClass,
  productImageViewerLoadingClass,
  productImageViewerNavClass,
} from "./ui-classes";

const MAX_ZOOM = 4;
const IMAGE_LOAD_TIMEOUT_MS = 15_000;

type ViewerImage = GalleryImage & { zoomSrc: string };

type DisplayedImage = {
  index: number;
  baseReady: boolean;
  zoomReady: boolean;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

function loadAndDecodeImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error("Image source is empty"));
      return;
    }

    const image = new Image();
    let settled = false;
    const timeout = window.setTimeout(
      () => finish(new Error("Image loading timed out")),
      IMAGE_LOAD_TIMEOUT_MS,
    );

    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      if (error) reject(error);
      else resolve();
    }

    image.onload = () => {
      void image
        .decode()
        .catch(() => undefined)
        .then(() => finish());
    };
    image.onerror = () => finish(new Error(`Image failed to load: ${src}`));
    image.src = src;
  });
}

export function ProductImageViewer({
  images,
  activeIndex,
  open,
  onClose,
  onSelect,
  returnFocusRef,
}: {
  images: ViewerImage[];
  activeIndex: number;
  open: boolean;
  onClose: () => void;
  onSelect: (index: number) => void;
  returnFocusRef: RefObject<HTMLButtonElement>;
}) {
  const initialIndex = clamp(activeIndex, 0, Math.max(images.length - 1, 0));
  const [displayed, setDisplayed] = useState<DisplayedImage>({
    index: initialIndex,
    baseReady: false,
    zoomReady: false,
  });
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const dragPointRef = useRef<{ x: number; y: number } | null>(null);
  const pinchDistanceRef = useRef<number | null>(null);
  const imagesRef = useRef(images);
  const activeIndexRef = useRef(activeIndex);
  const displayedIndexRef = useRef(initialIndex);
  const pendingIndexRef = useRef<number | null>(null);
  const requestRef = useRef(0);
  const openRef = useRef(open);
  const onCloseRef = useRef(onClose);
  const onSelectRef = useRef(onSelect);
  const displayedIndex = clamp(displayed.index, 0, Math.max(images.length - 1, 0));
  const active = images[displayedIndex];

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    displayedIndexRef.current = displayedIndex;
  }, [displayedIndex]);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const resetTransform = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setDragging(false);
    pointersRef.current.clear();
    dragPointRef.current = null;
    pinchDistanceRef.current = null;
  }, []);

  const prepareHighResolution = useCallback((index: number, requestId: number) => {
    const image = imagesRef.current[index];
    if (!image?.zoomSrc || image.zoomSrc === image.src) return;

    void loadAndDecodeImage(image.zoomSrc)
      .then(() => {
        if (!openRef.current || requestRef.current !== requestId) return;
        setDisplayed((current) =>
          current.index === index ? { ...current, zoomReady: true } : current,
        );
      })
      .catch(() => undefined);
  }, []);

  const selectImage = useCallback(
    (index: number) => {
      const currentImages = imagesRef.current;
      const count = currentImages.length;
      if (!count) return;

      const targetIndex = (index + count) % count;
      if (targetIndex === displayedIndexRef.current && pendingIndexRef.current === null) return;

      const target = currentImages[targetIndex];
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      pendingIndexRef.current = targetIndex;
      setPendingIndex(targetIndex);
      setLoadError(false);

      void loadAndDecodeImage(target.src)
        .then(() => {
          if (!openRef.current || requestRef.current !== requestId) return;
          displayedIndexRef.current = targetIndex;
          pendingIndexRef.current = null;
          setDisplayed({ index: targetIndex, baseReady: true, zoomReady: false });
          setPendingIndex(null);
          onSelectRef.current(targetIndex);
          resetTransform();
          prepareHighResolution(targetIndex, requestId);
        })
        .catch(() => {
          if (!openRef.current || requestRef.current !== requestId) return;
          pendingIndexRef.current = null;
          setPendingIndex(null);
          setLoadError(true);
        });
    },
    [prepareHighResolution, resetTransform],
  );

  const selectRelative = useCallback(
    (delta: number) => {
      const fromIndex = pendingIndexRef.current ?? displayedIndexRef.current;
      selectImage(fromIndex + delta);
    },
    [selectImage],
  );

  useEffect(() => {
    if (!open) {
      requestRef.current += 1;
      pendingIndexRef.current = null;
      setPendingIndex(null);
      setLoadError(false);
      return;
    }

    const currentImages = imagesRef.current;
    const index = clamp(activeIndexRef.current, 0, Math.max(currentImages.length - 1, 0));
    const image = currentImages[index];
    if (!image) return;

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    displayedIndexRef.current = index;
    pendingIndexRef.current = null;
    setDisplayed({ index, baseReady: false, zoomReady: false });
    setPendingIndex(null);
    setLoadError(false);
    resetTransform();

    void loadAndDecodeImage(image.src)
      .then(() => {
        if (!openRef.current || requestRef.current !== requestId) return;
        setDisplayed((current) =>
          current.index === index ? { ...current, baseReady: true } : current,
        );
        prepareHighResolution(index, requestId);
      })
      .catch(() => {
        if (!openRef.current || requestRef.current !== requestId) return;
        setLoadError(true);
      });

    const count = currentImages.length;
    if (count > 1) {
      const previous = currentImages[(index - 1 + count) % count];
      const next = currentImages[(index + 1) % count];
      void loadAndDecodeImage(previous.src).catch(() => undefined);
      if (next.src !== previous.src) void loadAndDecodeImage(next.src).catch(() => undefined);
    }
  }, [open, prepareHighResolution, resetTransform]);

  useEffect(() => {
    if (!open) return;
    const returnFocus = returnFocusRef.current;
    document.body.classList.add("overflow-hidden");
    closeRef.current?.focus();

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
      if (event.key === "ArrowLeft") selectRelative(-1);
      if (event.key === "ArrowRight") selectRelative(1);
      if (event.key === "+" || event.key === "=") {
        setScale((current) => clamp(current + 0.25, 1, MAX_ZOOM));
      }
      if (event.key === "-") {
        setScale((current) => clamp(current - 0.25, 1, MAX_ZOOM));
      }
      if (event.key === "Tab") {
        const controls = modalRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
        );
        if (!controls?.length) return;
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("overflow-hidden");
      document.removeEventListener("keydown", onKeyDown);
      returnFocus?.focus();
    };
  }, [open, returnFocusRef, selectRelative]);

  useEffect(() => {
    if (scale === 1) setOffset({ x: 0, y: 0 });
  }, [scale]);

  if (!open || !active) return null;

  function constrainOffset(next: { x: number; y: number }, nextScale = scale) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || nextScale <= 1) return { x: 0, y: 0 };
    return {
      x: clamp(next.x, (-rect.width * (nextScale - 1)) / 2, (rect.width * (nextScale - 1)) / 2),
      y: clamp(next.y, (-rect.height * (nextScale - 1)) / 2, (rect.height * (nextScale - 1)) / 2),
    };
  }

  function updateScale(nextScale: number) {
    const constrainedScale = clamp(nextScale, 1, MAX_ZOOM);
    setScale(constrainedScale);
    setOffset((current) => constrainOffset(current, constrainedScale));
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    updateScale(scale + (event.deltaY < 0 ? 0.25 : -0.25));
  }

  function pointerDistance(points: { x: number; y: number }[]) {
    if (points.length < 2) return 0;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointersRef.current.values()];
    if (points.length === 1) {
      dragPointRef.current = points[0];
      setDragging(scale > 1);
    } else if (points.length === 2) {
      pinchDistanceRef.current = pointerDistance(points);
      setDragging(true);
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointersRef.current.values()];
    if (points.length >= 2) {
      const distance = pointerDistance(points);
      const previousDistance = pinchDistanceRef.current;
      if (previousDistance && distance) updateScale(scale * (distance / previousDistance));
      pinchDistanceRef.current = distance;
      return;
    }
    const previousPoint = dragPointRef.current;
    if (scale > 1 && previousPoint) {
      setOffset((current) =>
        constrainOffset({
          x: current.x + event.clientX - previousPoint.x,
          y: current.y + event.clientY - previousPoint.y,
        }),
      );
    }
    dragPointRef.current = points[0] ?? null;
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(event.pointerId);
    const points = [...pointersRef.current.values()];
    dragPointRef.current = points[0] ?? null;
    pinchDistanceRef.current = points.length === 2 ? pointerDistance(points) : null;
    if (!points.length) setDragging(false);
  }

  const imageIsReady = displayed.baseReady || displayed.zoomReady;

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-modal flex flex-col bg-black text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр фотографий устройства"
      data-component="ProductImageViewer"
    >
      <div className="flex min-h-16 items-center justify-between gap-3 border-b border-white/15 px-3 sm:px-5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{active.label}</p>
          <p className="text-xs text-white/60">
            {displayedIndex + 1} / {images.length}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className={productImageViewerControlClass}
            aria-label="Уменьшить"
            title="Уменьшить"
            onClick={() => updateScale(scale - 0.25)}
            disabled={scale <= 1}
          >
            −
          </button>
          <button
            type="button"
            className="h-11 min-w-12 px-2 text-xs font-semibold text-white outline-none transition hover:bg-white/10 focus-visible:shadow-focus"
            aria-label="Сбросить масштаб"
            title="Сбросить масштаб"
            onClick={resetTransform}
          >
            {scale.toFixed(scale % 1 ? 2 : 0)}×
          </button>
          <button
            type="button"
            className={productImageViewerControlClass}
            aria-label="Увеличить"
            title="Увеличить"
            onClick={() => updateScale(scale + 0.25)}
            disabled={scale >= MAX_ZOOM}
          >
            +
          </button>
          <button
            ref={closeRef}
            type="button"
            className={productImageViewerControlClass}
            aria-label="Закрыть"
            title="Закрыть"
            onClick={() => onCloseRef.current()}
          >
            ×
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        className={cn(
          "relative min-h-0 flex-1 touch-none select-none overflow-hidden bg-carbon",
          scale > 1 && (dragging ? "cursor-grabbing" : "cursor-grab"),
        )}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={() => updateScale(scale > 1 ? 1 : 2.5)}
      >
        {/* The decoded base stays mounted while a new angle or the high-resolution layer loads. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={active.src}
          alt={active.alt || active.label}
          draggable={false}
          data-image-layer="base"
          data-image-index={displayedIndex}
          className={cn(
            "pointer-events-none absolute inset-0 m-auto max-h-full max-w-full object-contain",
            !dragging && "transition-transform duration-150",
            imageIsReady ? "opacity-100" : "opacity-0",
          )}
          style={productImageTransformStyle({ x: offset.x, y: offset.y, scale })}
          onLoad={() =>
            setDisplayed((current) =>
              current.index === displayedIndex ? { ...current, baseReady: true } : current,
            )
          }
          onError={() => setLoadError(true)}
        />

        {displayed.zoomReady && active.zoomSrc !== active.src ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={active.zoomSrc}
            alt=""
            aria-hidden="true"
            draggable={false}
            data-image-layer="zoom"
            data-image-index={displayedIndex}
            className={cn(
              "pointer-events-none absolute inset-0 m-auto max-h-full max-w-full object-contain",
              !dragging && "transition-transform duration-150",
            )}
            style={productImageTransformStyle({ x: offset.x, y: offset.y, scale })}
            onError={() =>
              setDisplayed((current) =>
                current.index === displayedIndex ? { ...current, zoomReady: false } : current,
              )
            }
          />
        ) : null}

        {!imageIsReady || pendingIndex !== null ? (
          <div
            className={productImageViewerLoadingClass}
            role="status"
            aria-live="polite"
            data-component="ProductImageLoading"
          >
            <span className="h-2 w-2 animate-pulse rounded-pill bg-white" aria-hidden="true" />
            <span>
              {pendingIndex === null
                ? "Загружаем фото"
                : `Загружаем ${pendingIndex + 1} / ${images.length}`}
            </span>
          </div>
        ) : null}

        {loadError ? (
          <p
            className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 bg-black/80 px-3 py-2 text-center text-xs text-white"
            role="alert"
          >
            Фото не загрузилось. Попробуйте переключить ещё раз.
          </p>
        ) : null}

        {images.length > 1 ? (
          <>
            <button
              type="button"
              className={cn(productImageViewerNavClass, "left-3 sm:left-5")}
              aria-label="Предыдущее фото"
              title="Предыдущее фото"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                selectRelative(-1);
              }}
            >
              ←
            </button>
            <button
              type="button"
              className={cn(productImageViewerNavClass, "right-3 sm:right-5")}
              aria-label="Следующее фото"
              title="Следующее фото"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                selectRelative(1);
              }}
            >
              →
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
