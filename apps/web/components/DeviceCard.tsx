import Link from "next/link";
import type { DeviceCardData } from "@/lib/device-card-data";
import { ProductImage, productImageSrc } from "./ProductImage";

function stockStatusLabel(device: DeviceCardData): string {
  if (device.stockStatusLabel) return device.stockStatusLabel;
  switch ((device.stockStatus || "available").toLowerCase()) {
    case "reserved":
      return "Бронь";
    case "sold":
      return "Продано";
    default:
      return "В наличии";
  }
}

function updatedText(device: DeviceCardData): string {
  if (device.updatedText) return device.updatedText;
  if (!device.updatedAt) return "";
  const date = new Date(device.updatedAt);
  if (Number.isNaN(date.getTime())) return "";
  return `Обновлено ${new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date)}`;
}

export function DeviceCard({ device }: { device: DeviceCardData }) {
  const src = productImageSrc(device.listingImage);
  const update = updatedText(device);
  const href = device.detailHref || `/device/${device.id}`;

  return (
    <Link
      href={href}
      className="card group flex h-full flex-col overflow-hidden outline-none transition hover:-translate-y-0.5 hover:shadow-product focus-visible:shadow-focus"
    >
      <div className="relative flex aspect-product items-center justify-center bg-surface">
        {src ? (
          <ProductImage
            src={src}
            alt={device.listingAlt || device.title}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <span className="text-sm text-muted">{device.title}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-6">
        <div className="mb-3 flex items-center justify-between gap-2 text-xs">
          <span className="rounded-pill bg-surface px-3 py-1 font-medium text-muted">
            {stockStatusLabel(device)}
          </span>
          {update ? <span className="text-muted">{update}</span> : null}
        </div>
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold">{device.title}</h3>
          <span className="rounded bg-surface px-2 py-1 text-xs font-medium text-muted">
            {device.grade}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted">
          {device.specs} · {device.color}
        </p>
        <p className="mt-4 font-medium">{device.priceText}</p>
        <p className="mt-1 text-xs text-muted">{device.exitText}</p>
        <span className="mt-4 text-sm font-medium text-accent group-hover:underline">
          {device.ctaLabel} →
        </span>
      </div>
    </Link>
  );
}
