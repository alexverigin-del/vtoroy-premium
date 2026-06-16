import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getDeviceBySlug,
  getPublishedDevices,
} from "@/lib/directus";
import { PassportSummary } from "@/components/PassportSummary";
import { CTAButton } from "@/components/CTAButton";

export const revalidate = 300;

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
        </div>

        <PassportSummary passport={device.passport} />
      </div>
    </main>
  );
}
