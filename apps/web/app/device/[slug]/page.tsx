import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getDeviceBySlug,
  getPublishedDevices,
} from "@/lib/directus";
import { PassportSummary } from "@/components/PassportSummary";
import { CTAButton } from "@/components/CTAButton";

// Keep Directus device edits visible immediately while inventory is being filled.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Pre-render known device pages at build time; others render on demand.
export async function generateStaticParams() {
  const devices = await getPublishedDevices();
  return devices.map((d) => ({ slug: d.id }));
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const device = await getDeviceBySlug(params.slug);
  if (!device) return { title: "Вещь не найдена — ISVOI" };
  return {
    title: `${device.title} — ISVOI`,
    description: device.shortDescription,
  };
}

function imageSrc(path: string): string {
  if (!path) return "";
  if (/^https?:\/\//.test(path) || path.startsWith("/")) return path;
  return `/${path}`;
}

export default async function DevicePage({
  params,
}: {
  params: { slug: string };
}) {
  const device = await getDeviceBySlug(params.slug);
  if (!device) notFound();

  return (
    <main className="mx-auto max-w-content px-6 py-16">
      <a href="/catalog" className="text-sm text-accent hover:underline">
        ← Store
      </a>

      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-muted">
            {device.category}
          </p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">
            {device.headline}
          </h1>
          <p className="mt-4 text-muted">{device.shortDescription}</p>

          <div className="mt-6 flex items-baseline gap-3">
            <span className="text-2xl font-semibold">{device.priceText}</span>
            <span className="rounded bg-surface px-2 py-1 text-xs font-medium text-muted">
              грейд {device.grade}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">{device.exitText}</p>

          <div className="mt-8 flex flex-wrap gap-4">
            <CTAButton href="/#final" label="Получить подборку" />
            <CTAButton href="/trade" label="Оценить свою вещь" variant="secondary" />
          </div>

          <p className="mt-6 text-sm text-muted">{device.availability}</p>

          {device.gallery.length > 0 ? (
            <div className="mt-10 grid gap-3 sm:grid-cols-2">
              {device.gallery.map((image) => {
                const src = imageSrc(image.src);
                if (!src) return null;
                return (
                  <figure
                    key={`${image.src}-${image.label}`}
                    className="overflow-hidden rounded-card border border-hairline bg-white"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={image.alt}
                      className="aspect-[4/3] w-full object-cover"
                    />
                    <figcaption className="px-3 py-2 text-xs text-muted">
                      {image.label}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          ) : null}
        </div>

        <PassportSummary passport={device.passport} />
      </div>
    </main>
  );
}
