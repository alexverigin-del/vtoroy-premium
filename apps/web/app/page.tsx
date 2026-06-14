import { directusConfig, getPublishedDevices } from "@/lib/directus";
import { DeviceCard } from "@/components/DeviceCard";
import { CTAButton } from "@/components/CTAButton";

export const revalidate = 300;

export default async function HomePage() {
  // Catalog data comes from Directus when configured, otherwise from the
  // bundled fallback (data/devices.ts). The home page shows a short preview;
  // the full grid lives at /catalog.
  const devices = (await getPublishedDevices()).slice(0, 4);

  return (
    <main className="mx-auto max-w-content px-6 py-20">
      <p className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">
        Северодвинск · Store / Trade / Club
      </p>
      <h1 className="text-5xl font-bold tracking-tight md:text-6xl">
        Не новый. Проверенный.
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-muted">
        Премиальная техника Apple с Паспортом Премиума, гарантией и понятной ценой
        выхода. Будущий публичный сайт на Next.js + Tailwind, который читает каталог
        и контент из Directus. Текущий статический сайт в корне репозитория не
        затрагивается.
      </p>

      <div className="mt-10 flex flex-wrap gap-4">
        <CTAButton href="/catalog" label="Смотреть каталог" />
        <CTAButton href="/trade" label="Оценить своё устройство" variant="secondary" />
      </div>

      <section className="mt-16">
        <div className="flex items-end justify-between">
          <h2 className="text-2xl font-semibold">Каталог</h2>
          <a href="/catalog" className="text-sm font-medium text-accent hover:underline">
            Все устройства →
          </a>
        </div>
        <p className="mt-2 text-sm text-muted">
          {directusConfig.enabled
            ? "Данные загружаются из Directus."
            : "Directus не настроен — показаны демо-данные из data/devices.json."}
        </p>

        <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {devices.map((device) => (
            <li key={device.id}>
              <DeviceCard device={device} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
