import { getPublishedDevices, directusConfig } from "@/lib/directus";
import { DeviceCard } from "@/components/DeviceCard";

export const metadata = {
  title: "Каталог — Второй Премиум",
  description:
    "Проверенная техника Apple с Паспортом Премиума, гарантией и понятной ценой выхода.",
};

// Re-render at most every 5 minutes (ISR) when backed by Directus.
export const revalidate = 300;

export default async function CatalogPage() {
  const devices = await getPublishedDevices();

  return (
    <main className="mx-auto max-w-content px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-wide text-muted">
        Каталог
      </p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight md:text-5xl">
        Не новый. Проверенный.
      </h1>
      <p className="mt-4 max-w-2xl text-muted">
        {directusConfig.enabled
          ? "Данные каталога загружаются из Directus."
          : "Directus не настроен — показаны демо-данные из data/devices.json."}
      </p>

      {devices.length === 0 ? (
        <div className="card mt-10 p-8 text-muted">
          Каталог пуст. Добавьте устройства в Directus или проверьте данные.
        </div>
      ) : (
        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {devices.map((device) => (
            <li key={device.id}>
              <DeviceCard device={device} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
