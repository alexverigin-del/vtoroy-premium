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
import { cn } from "../lib/cn";
import { productImageTransformStyle } from "./product-image-zoom-utils";
import { productImageViewerControlClass, productImageViewerNavClass } from "./ui-classes";

const MAX_ZOOM = 4;

type ViewerImage = GalleryImage & { zoomSrc: string };

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

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
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const dragPointRef = useRef<{ x: number; y: number } | null>(null);
  const pinchDistanceRef = useRef<number | null>(null);
  const activeIndexRef = useRef(activeIndex);
  const onSelectRef = useRef(onSelect);
  const boundedActiveIndex = Math.min(activeIndex, images.length - 1);
  const active = images[boundedActiveIndex];

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

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

  const selectImage = useCallback(
    (index: number) => {
      const count = images.length;
      if (!count) return;
      onSelectRef.current((index + count) % count);
      resetTransform();
    },
    [images.length, resetTransform],
  );

  useEffect(() => {
    if (!open) return;
    resetTransform();
    const returnFocus = returnFocusRef.current;
    document.body.classList.add("overflow-hidden");
    closeRef.current?.focus();

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") selectImage(activeIndexRef.current - 1);
      if (event.key === "ArrowRight") selectImage(activeIndexRef.current + 1);
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
  }, [onClose, open, resetTransform, returnFocusRef, selectImage]);

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
            {boundedActiveIndex + 1} / {images.length}
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
            onClick={onClose}
          >
            ×
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        className={cn(
          "relative min-h-0 flex-1 touch-none select-none overflow-hidden",
          scale > 1 && (dragging ? "cursor-grabbing" : "cursor-grab"),
        )}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={() => updateScale(scale > 1 ? 1 : 2.5)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={active.zoomSrc}
          alt={active.alt || active.label}
          draggable={false}
          className={cn(
            "pointer-events-none absolute inset-0 m-auto max-h-full max-w-full object-contain",
            !dragging && "transition-transform duration-150",
          )}
          style={productImageTransformStyle({ x: offset.x, y: offset.y, scale })}
        />

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
                selectImage(boundedActiveIndex - 1);
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
                selectImage(boundedActiveIndex + 1);
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
