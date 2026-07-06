import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import type { Device, DeviceStoryInfo, PassportState } from "@vtoroy/shared";
import {
  getDeviceBySlug,
  getNavigationItems,
  getPublishedDeviceCards,
  getSiteSettings,
} from "@/lib/directus";
import type { DeviceCardData } from "@/lib/device-card-data";
import { PassportSummary } from "@/components/PassportSummary";
import { CTAButton } from "@/components/CTAButton";
import { DeviceGallery } from "@/components/DeviceGallery";
import { DeviceCard } from "@/components/DeviceCard";
import { ProductLeadForm } from "@/components/ProductLeadForm";
import { MobileProductActionBar } from "@/components/MobileProductActionBar";
import { SiteShell } from "@/components/SiteShell";
import { deviceBackLinkClass } from "@/components/ui-classes";
import { cn } from "@/lib/cn";
import { siteChrome } from "@/lib/site-content";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/structured-data";

// Public device content is ISR-cached; Directus Studio edits refresh on the next 5-minute revalidation.
export const revalidate = 300;

// Pre-render known device pages at build time; others render on demand.
export async function generateStaticParams() {
  const devices = await getPublishedDeviceCards();
  return devices.map((d) => ({ slug: d.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const device = await getDeviceBySlug(slug);
  if (!device) return { title: "Вещь не найдена — I СВОИ" };
  return {
    title: `${device.title} — I СВОИ`,
    description: device.shortDescription,
    alternates: {
      canonical: `/device/${slug}`,
    },
    openGraph: {
      title: `${device.title} — I СВОИ`,
      description: device.shortDescription,
      url: `/device/${slug}`,
      images: device.listingImage ? [{ url: device.listingImage }] : undefined,
    },
  };
}

function compact<T>(values: Array<T | undefined | null | false>): T[] {
  return values.filter(Boolean) as T[];
}

type TrustFact = {
  label: string;
  value: string;
  state?: PassportState;
};

const trustFactTone: Record<PassportState, string> = {
  ok: "border-emerald-100 bg-emerald-50 text-emerald-800",
  warn: "border-amber-100 bg-amber-50 text-amber-800",
  bad: "border-red-100 bg-red-50 text-red-800",
};

function passportRow(device: Device, patterns: RegExp[]): TrustFact | null {
  const row = device.passport.summaryRows.find((item) =>
    patterns.some((pattern) => pattern.test(item.label)),
  );
  return row ? { label: row.label, value: row.value, state: row.state } : null;
}

function conditionTrustFacts(device: Device): TrustFact[] {
  const biometric = passportRow(device, [/face id/i, /touch id/i, /биометр/i]);
  const repair = passportRow(device, [/ремонт/i, /вскры/i]);
  const water = passportRow(device, [/влаг/i, /water/i]);
  const facts: Array<TrustFact | null> = [
    device.passport.condition.gradeText
      ? { label: "Грейд", value: device.passport.condition.gradeText }
      : null,
    device.batteryText ? { label: "Батарея", value: device.batteryText, state: "ok" } : null,
    repair ??
      (device.passport.repair ? { label: "Вскрытие", value: device.passport.repair } : null),
    biometric,
    water ?? (device.passport.water ? { label: "Влага", value: device.passport.water } : null),
  ];

  return compact(facts).slice(0, 5);
}

function normalizedStockStatus(device: Pick<DeviceCardData, "stockStatus">): string {
  const raw = (device.stockStatus || "available").toLowerCase();
  if (!raw || raw === "in_stock") return "available";
  if (raw === "service") return "hidden";
  return raw;
}

function isActionableDevice(device: DeviceCardData): boolean {
  const status = normalizedStockStatus(device);
  return status !== "hidden" && status !== "sold";
}

function stockStatusLabel(device: Device): string {
  if (device.stockStatusLabel) return device.stockStatusLabel;
  switch (normalizedStockStatus(device)) {
    case "reserved":
      return "Бронь";
    case "sold":
      return "Продано";
    default:
      return "В наличии";
  }
}

function mobileLeadCta(device: Device): { label: string; ariaLabel: string } {
  switch (normalizedStockStatus(device)) {
    case "reserved":
      return {
        label: "Очередь",
        ariaLabel: `Встать в лист ожидания по ${device.title}`,
      };
    case "sold":
      return {
        label: "Подобрать",
        ariaLabel: `Подобрать похожее устройство вместо ${device.title}`,
      };
    default:
      return {
        label: "Просмотр",
        ariaLabel: `Записаться на просмотр ${device.title}`,
      };
  }
}

function updatedText(device: Device): string {
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

function relatedDevices(device: Device, devices: DeviceCardData[]): DeviceCardData[] {
  const candidates = devices
    .filter((item) => item.id !== device.id && normalizedStockStatus(item) !== "hidden")
    .sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
  const actionable = candidates.filter(isActionableDevice);
  const pool = actionable.length > 0 ? actionable : candidates;
  const sameCategory = pool.filter((item) => item.category === device.category);
  const sameModel = pool.filter((item) => item.model && item.model === device.model);
  const fallback = sameModel.length > 0 ? sameModel : sameCategory.length > 0 ? sameCategory : pool;
  return fallback.slice(0, 3);
}

function productJsonLd(device: Device) {
  const status = normalizedStockStatus(device);
  const availability =
    status === "sold"
      ? "https://schema.org/SoldOut"
      : status === "reserved"
        ? "https://schema.org/LimitedAvailability"
        : "https://schema.org/InStock";

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: device.title,
    description: device.shortDescription || device.headline,
    sku: device.id,
    brand: {
      "@type": "Brand",
      name: device.model || device.category || "I СВОИ",
    },
    image: [device.listingImage, ...device.gallery.map((image) => image.src)].filter(Boolean),
    offers: {
      "@type": "Offer",
      priceCurrency: "RUB",
      price: device.price || undefined,
      availability,
      url: `https://isvoi.ru/device/${device.id}`,
      itemCondition: "https://schema.org/UsedCondition",
    },
  };
}

function DetailCard({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("card p-6", className)}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DeviceStoryCard({ story }: { story: DeviceStoryInfo }) {
  const facts = story.facts ?? [];

  return (
    <section className="rounded-card bg-ink p-6 text-white shadow-soft">
      <p className="text-xs font-medium uppercase tracking-eyebrow text-white/55">История вещи</p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight">{story.title || "Путь вещи"}</h2>
      <p className="mt-4 text-sm leading-relaxed text-white/70">{story.body}</p>
      {facts.length > 0 ? (
        <ul className="mt-5 grid gap-2 sm:grid-cols-3">
          {facts.slice(0, 3).map((fact) => (
            <li key={fact} className="rounded-card border border-white/15 px-3 py-2 text-sm">
              {fact}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function TradeUpdateCard({ options }: { options: Device["trade"]["options"] }) {
  if (options.length === 0) return null;

  return (
    <DetailCard title="Обновление через Trade">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {options.slice(0, 4).map((option) => (
          <div key={option.label} className="rounded-card border border-hairline p-4">
            <p className="text-sm text-muted">{option.label}</p>
            <p className="mt-1 font-semibold">зачет до {option.value.toLocaleString("ru-RU")} ₽</p>
          </div>
        ))}
      </div>
    </DetailCard>
  );
}

export default async function DevicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [device, devices, settings, navigation] = await Promise.all([
    getDeviceBySlug(slug),
    getPublishedDeviceCards(),
    getSiteSettings(),
    getNavigationItems(),
  ]);
  if (!device) notFound();

  const chrome = siteChrome(settings, navigation);
  const facts = compact([
    device.specs,
    device.color,
    device.batteryText,
    device.warrantyText,
    device.exitText,
  ]);
  const related = relatedDevices(device, devices);
  const conditionNotes = device.passport.condition.notes ?? [];
  const trustFacts = conditionTrustFacts(device);
  const story = device.passport.story;
  const tradeOptions = device.trade.options ?? [];
  const lastUpdated = updatedText(device);
  const leadFormId = "product-lead";
  const mobileCta = mobileLeadCta(device);
  const showRelatedPrompt = related.length > 0 && related.length < 3;

  return (
    <SiteShell
      settings={chrome.settings}
      navigation={chrome.navigation}
      footerClassName="pb-28 lg:pb-12"
    >
      <main id="top" className="bg-surface">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(productJsonLd(device)) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript(
              breadcrumbJsonLd([
                { name: "Главная", path: "/" },
                { name: "Каталог", path: "/catalog" },
                { name: device.title, path: `/device/${device.id}` },
              ]),
            ),
          }}
        />
        <section className="mx-auto max-w-content px-6 py-10 md:py-14">
          <Link href="/catalog" className={deviceBackLinkClass}>
            ← Store
          </Link>

          <div className="mt-6 grid gap-6 lg:grid-cols-product lg:items-start lg:gap-8">
            <div className="contents lg:col-start-2 lg:row-start-1 lg:grid lg:gap-6 lg:self-start">
              <aside className="card order-1 p-6 lg:order-none">
                <p className="text-xs font-medium uppercase tracking-eyebrow text-muted">
                  {device.category}
                </p>
                <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">
                  {device.headline || device.title}
                </h1>
                <p className="mt-4 text-muted">{device.shortDescription}</p>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <span className="text-3xl font-semibold">{device.priceText}</span>
                  <span className="rounded-pill bg-surface px-3 py-1 text-sm font-medium text-muted">
                    грейд {device.grade}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted">{device.availability}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
                  <span className="rounded-pill bg-surface px-3 py-1 font-medium">
                    {stockStatusLabel(device)}
                  </span>
                  {lastUpdated ? (
                    <span className="rounded-pill bg-surface px-3 py-1">{lastUpdated}</span>
                  ) : null}
                </div>

                <div className="mt-6 grid gap-2">
                  {facts.map((fact) => (
                    <div key={fact} className="flex items-center gap-2 text-sm text-muted">
                      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                      {fact}
                    </div>
                  ))}
                </div>

                <ProductLeadForm
                  deviceId={device.id}
                  deviceTitle={device.title}
                  formId={leadFormId}
                  stockStatus={device.stockStatus}
                  stockStatusLabel={stockStatusLabel(device)}
                />

                <div className="mt-3">
                  <CTAButton href="/trade" label="Рассчитать Trade" variant="secondary" />
                </div>

                <p className="mt-5 text-xs leading-relaxed text-muted">
                  Цена и условия действуют после подтверждения наличия и финальной проверки в Store.
                </p>
              </aside>

              <div className="order-5 lg:order-none">
                <PassportSummary passport={device.passport} />
              </div>

              {tradeOptions.length > 0 ? (
                <div className="order-4 lg:order-none">
                  <TradeUpdateCard options={tradeOptions} />
                </div>
              ) : null}
            </div>

            <div className="contents lg:col-start-1 lg:row-start-1 lg:grid lg:gap-6">
              <div className="order-2 lg:order-none">
                <DeviceGallery images={device.gallery} />
              </div>

              <div className="order-3 grid gap-6 lg:order-none">
                <DetailCard title="Состояние и нюансы" className="lg:mt-6">
                  <p className="text-sm leading-relaxed text-muted">
                    {device.passport.condition.note}
                  </p>
                  {trustFacts.length > 0 ? (
                    <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                      {trustFacts.map((fact) => (
                        <div
                          key={`${fact.label}-${fact.value}`}
                          className={cn(
                            "rounded-card border border-hairline bg-surface p-4",
                            fact.state ? trustFactTone[fact.state] : undefined,
                          )}
                        >
                          <dt className="text-xs font-medium uppercase tracking-wide opacity-70">
                            {fact.label}
                          </dt>
                          <dd className="mt-1 text-base font-semibold">{fact.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {conditionNotes.length > 0 ? (
                    <ul className="mt-5 grid gap-2 text-sm text-muted sm:grid-cols-2">
                      {conditionNotes.map((note) => (
                        <li key={note} className="rounded-card border border-hairline px-4 py-3">
                          {note}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </DetailCard>

                {story?.body ? <DeviceStoryCard story={story} /> : null}

                <DetailCard title="Гарантия и ориентир выхода">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-card border border-hairline bg-surface p-4">
                      <p className="text-sm font-medium text-muted">Срок гарантии</p>
                      <p className="mt-1 text-2xl font-semibold">
                        {device.passport.warranty.duration || device.warranty || "90 дней"}
                      </p>
                    </div>
                    <div className="rounded-card border border-hairline bg-surface p-4">
                      <p className="text-sm font-medium text-muted">Ориентир выхода</p>
                      <p className="mt-1 text-2xl font-semibold text-accent">
                        {device.passport.exitPrice.headline || device.exitText}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="mt-5 text-sm font-medium">Покрывается</p>
                      <p className="mt-1 text-sm text-muted">
                        {device.passport.warranty.covered ||
                          "Функциональные неисправности в рамках условий Store."}
                      </p>
                    </div>
                    <div>
                      <p className="mt-5 text-sm font-medium">Не покрывается</p>
                      <p className="mt-1 text-sm text-muted">
                        {device.passport.warranty.notCovered ||
                          "Механические повреждения после покупки и следы влаги."}
                      </p>
                    </div>
                  </div>
                  <p className="mt-5 rounded-card bg-surface p-4 text-sm text-muted">
                    {device.passport.exitPrice.note}
                  </p>
                </DetailCard>
              </div>
            </div>
          </div>
        </section>

        {related.length > 0 ? (
          <section className="mx-auto max-w-content px-6 pb-16">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-eyebrow text-muted">
                  Еще в Store
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight">Похожие устройства</h2>
              </div>
              {!showRelatedPrompt ? (
                <CTAButton href="/catalog" label="Весь каталог" variant="secondary" />
              ) : null}
            </div>
            <ul
              className={cn(
                "mt-6 gap-6",
                showRelatedPrompt
                  ? "grid sm:grid-cols-2 lg:flex lg:items-start"
                  : "grid sm:grid-cols-2 lg:grid-cols-3",
              )}
            >
              {related.map((item) => (
                <li key={item.id} className={showRelatedPrompt ? "lg:w-80 lg:shrink-0" : undefined}>
                  <DeviceCard device={item} />
                </li>
              ))}
              {showRelatedPrompt ? (
                <li className="rounded-card border border-hairline bg-white p-5 sm:col-span-2 lg:flex-1 lg:p-6">
                  <div className="grid h-full gap-5 lg:grid-cols-2 lg:items-center">
                    <div>
                      <h3 className="text-xl font-semibold leading-tight text-carbon">
                        Больше вариантов в Store
                      </h3>
                      <p className="mt-3 max-w-body-copy text-sm leading-relaxed text-graphite">
                        Если эта вещь не подходит, проверьте соседние варианты по практичным
                        параметрам.
                      </p>
                      <div className="mt-5">
                        <CTAButton href="/catalog" label="Открыть каталог" variant="secondary" />
                      </div>
                    </div>
                    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                      {["Память", "Цвет", "Бюджет", "Trade"].map((cue) => (
                        <li
                          key={cue}
                          className="rounded-card border border-hairline bg-surface px-3 py-2 text-sm font-medium text-graphite"
                        >
                          {cue}
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              ) : null}
            </ul>
          </section>
        ) : null}

        <MobileProductActionBar
          leadFormId={leadFormId}
          primaryAriaLabel={mobileCta.ariaLabel}
          primaryLabel={mobileCta.label}
          tradeAriaLabel={`Рассчитать Trade для ${device.title}`}
        />
      </main>
    </SiteShell>
  );
}
