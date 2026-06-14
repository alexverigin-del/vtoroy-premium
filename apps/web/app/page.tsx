import { directusConfig, fetchDevices } from "@/lib/directus";

export default async function HomePage() {
  // Placeholder: once a Directus instance is configured via
  // NEXT_PUBLIC_DIRECTUS_URL, fetchDevices() will return live catalog data.
  // For now it returns an empty list so the scaffold builds without a backend.
  const devices = await fetchDevices();

  return (
    <main className="mx-auto max-w-content px-6 py-20">
      <p className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">
        Северодвинск · Store / Trade / Club
      </p>
      <h1 className="text-5xl font-bold tracking-tight md:text-6xl">
        Не новый. Проверенный.
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-muted">
        Это будущий публичный сайт на Next.js + Tailwind, который будет получать
        каталог, паспорта устройств и trade-in данные из Directus. Текущий
        опубликованный сайт — статический, лежит в корне репозитория и пока не
        затрагивается.
      </p>

      <div className="mt-10 flex gap-4">
        <a className="btn-pill" href="#">
          Получить подборку
        </a>
      </div>

      <section className="mt-16">
        <h2 className="text-2xl font-semibold">Каталог (из Directus)</h2>
        {devices.length === 0 ? (
          <div className="card mt-6 p-8">
            <p className="text-muted">
              Источник данных Directus ещё не настроен. Укажите{" "}
              <code className="rounded bg-surface px-1.5 py-0.5">
                NEXT_PUBLIC_DIRECTUS_URL
              </code>{" "}
              в <code>.env.local</code> и реализуйте запросы в{" "}
              <code>lib/directus.ts</code>.
            </p>
            <p className="mt-3 text-sm text-muted">
              Текущая цель API:{" "}
              <code>{directusConfig.url ?? "(не задан)"}</code>
            </p>
          </div>
        ) : (
          <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {devices.map((d) => (
              <li key={d.id} className="card p-6">
                <h3 className="font-semibold">{d.title}</h3>
                <p className="mt-1 text-sm text-muted">{d.shortDescription}</p>
                <p className="mt-4 font-medium">{d.priceText}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
