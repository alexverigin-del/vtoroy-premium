import Link from "next/link";
import type { Device } from "@vtoroy/shared";

function isAbsolute(url: string): boolean {
  return /^https?:\/\//.test(url);
}

function imageSrc(path: string): string {
  if (!path) return "";
  if (isAbsolute(path) || path.startsWith("/")) return path;
  return `/${path}`;
}

export function DeviceCard({ device }: { device: Device }) {
  const src = imageSrc(device.listingImage);

  return (
    <Link
      href={`/device/${device.id}`}
      className="card group flex flex-col overflow-hidden transition hover:shadow-product"
    >
      <div className="flex aspect-[4/3] items-center justify-center bg-surface">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={device.listingAlt}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-sm text-muted">{device.title}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-6">
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
