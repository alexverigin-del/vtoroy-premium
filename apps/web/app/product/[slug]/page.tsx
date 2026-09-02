import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type {
  CatalogProduct,
  DevicePageSettings,
  DeviceStoryInfo,
  ProductOffer,
} from "@vtoroy/shared";

import { DeviceGallery } from "@/components/DeviceGallery";
import { PassportSummary } from "@/components/PassportSummary";
import { ProductCard } from "@/components/ProductCard";
import { ProductLeadForm } from "@/components/ProductLeadForm";
import { ProductOfferPanel } from "@/components/ProductOfferPanel";
import {
  brandZoneEyebrowClass,
  detailBackLinkClass,
  homeSectionLabelClass,
} from "@/components/ui-classes";
import { SiteShell } from "@/components/SiteShell";
import { getDevicePageSettings, getNavigationItems, getSiteSettings } from "@/lib/directus";
import { getProductBySlug, getRelatedProducts } from "@/lib/product-catalog";
import { siteChrome } from "@/lib/site-content";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/structured-data";
import { productSeoDescription } from "@/lib/seo-metadata";

export const revalidate = 300;

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Товар не найден — I СВОИ" };
  const description = productSeoDescription(product);
  return {
    title: `${product.title} — I СВОИ`,
    description,
    alternates: { canonical: `/product/${product.id}` },
    openGraph: {
      title: `${product.title} — I СВОИ`,
      description,
      url: `/product/${product.id}`,
      images: product.listingImage ? [{ url: product.listingImage }] : undefined,
    },
  };
}

function itemCondition(product: CatalogProduct) {
  return product.condition === "new"
    ? "https://schema.org/NewCondition"
    : "https://schema.org/UsedCondition";
}

function availability(product: CatalogProduct) {
  if (product.stockQuantity <= 0 || product.stockStatus === "sold") {
    return "https://schema.org/OutOfStock";
  }
  if (product.stockStatus === "reserved") return "https://schema.org/LimitedAvailability";
  return "https://schema.org/InStock";
}

function offerAvailability(offer: ProductOffer) {
  if (offer.stockQuantity <= 0 || offer.stockStatus === "sold") {
    return "https://schema.org/OutOfStock";
  }
  if (offer.stockStatus === "reserved") return "https://schema.org/LimitedAvailability";
  return "https://schema.org/InStock";
}

function productJsonLd(product: CatalogProduct, sellerName: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.shortDescription || product.headline,
    sku: product.sku,
    brand: { "@type": "Brand", name: product.brand.name },
    category: product.category.name,
    color: product.color || undefined,
    image: [product.listingImage, ...product.gallery.map((image) => image.src)].filter(Boolean),
    itemCondition: itemCondition(product),
    offers:
      product.offers.length > 0
        ? product.offers.map((offer) => ({
            "@type": "Offer",
            priceCurrency: "RUB",
            price: offer.price,
            availability: offerAvailability(offer),
            itemCondition: itemCondition(product),
            url: `https://isvoi.ru/product/${product.id}`,
            availableAtOrFrom: {
              "@type": "Store",
              "@id": `https://isvoi.ru/${offer.location.slug}#store`,
              name: offer.location.name,
            },
            seller: {
              "@type": "Organization",
              "@id": "https://isvoi.ru/#organization",
              name: sellerName,
            },
          }))
        : {
            "@type": "Offer",
            priceCurrency: "RUB",
            price: product.price,
            availability: availability(product),
            itemCondition: itemCondition(product),
            url: `https://isvoi.ru/product/${product.id}`,
            seller: {
              "@type": "Organization",
              "@id": "https://isvoi.ru/#organization",
              name: sellerName,
            },
          },
  };
}

function deviceFacts(product: CatalogProduct) {
  const details = product.deviceDetails;
  if (!details) return [];
  return [
    ["Память", details.storage],
    ["Серийный номер", details.serial],
    ["IMEI", details.imeiPrimaryLast4 ? `•••• ${details.imeiPrimaryLast4}` : ""],
    ["Модель", details.modelIdentifier || product.model],
    ["Год / поколение", details.year ? String(details.year) : ""],
    ["Регион", details.region],
    ["SIM / eSIM", details.sim],
    ["Батарея", details.batteryText || details.battery],
    ["Циклы батареи", details.batteryCycles ? String(details.batteryCycles) : ""],
    ["Дата диагностики", details.diagnosticDate],
    ["Activation Lock", details.activationLock],
    ["MDM", details.mdm],
    ["Комплект", product.completeness],
    ["Проверил", details.diagnosticBy],
  ].filter((item): item is [string, string] => Boolean(item[1]));
}

function accessoryFacts(product: CatalogProduct) {
  const details = product.accessoryDetails;
  if (!details) return [];
  const compatibility =
    details.compatibilityMode === "universal"
      ? "Универсальный аксессуар"
      : product.compatibleModels.map((model) => `${model.brand.name} ${model.name}`).join(", ");
  return [
    ["Совместимость", compatibility],
    ["Материал", details.material],
    ["Подключение", details.connectionType],
    ["Комплект", details.packageContents || product.completeness],
    ...Object.entries(details.specifications),
  ].filter((item): item is [string, string] => Boolean(item[1]));
}

function DeviceStoryCard({
  settings,
  story,
}: {
  settings: DevicePageSettings;
  story: DeviceStoryInfo;
}) {
  return (
    <section
      className="rounded-card bg-ink p-6 text-white shadow-soft"
      data-component="DeviceStoryCard"
    >
      <p className="text-xs font-medium uppercase tracking-eyebrow text-white/55">
        {settings.sections.storyEyebrow}
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight">
        {story.title || settings.sections.storyFallbackTitle}
      </h2>
      <p className="mt-4 text-sm leading-relaxed text-white/70">{story.body}</p>
      {story.facts.length > 0 ? (
        <ul className="mt-5 grid gap-2 sm:grid-cols-3">
          {story.facts.slice(0, 3).map((fact) => (
            <li key={fact} className="rounded-card border border-white/15 px-3 py-2 text-sm">
              {fact}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const [product, settings, navigation, devicePageSettings] = await Promise.all([
    getProductBySlug(slug),
    getSiteSettings(),
    getNavigationItems(),
    getDevicePageSettings(),
  ]);
  if (!product) notFound();

  const chrome = siteChrome(settings, navigation);
  const related = await getRelatedProducts(product);
  const relatedProducts = product.productType === "device" ? related.accessories : related.devices;
  const gallery =
    product.gallery.length > 0
      ? product.gallery
      : product.listingImage
        ? [
            {
              src: product.listingImage,
              alt: product.listingAlt || product.title,
              label: product.title,
              role: "listing",
            },
          ]
        : [];
  const facts =
    product.productType === "accessory" ? accessoryFacts(product) : deviceFacts(product);
  const usedDevice = product.productType === "device" && product.condition === "used";
  const conditionLabel =
    product.productType === "accessory"
      ? "Новый аксессуар"
      : product.condition === "new"
        ? "Новая техника"
        : "С пробегом · Проверено";

  return (
    <SiteShell settings={chrome.settings} navigation={chrome.navigation}>
      <main id="top" className="bg-surface">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript(
              productJsonLd(
                product,
                chrome.settings.legalName || chrome.settings.brandName || "I СВОИ",
              ),
            ),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript(
              breadcrumbJsonLd([
                { name: "Главная", path: "/" },
                { name: "Каталог", path: "/catalog" },
                { name: product.title, path: `/product/${product.id}` },
              ]),
            ),
          }}
        />

        <section className="mx-auto max-w-content px-6 py-10 md:py-14">
          <Link href="/catalog" className={detailBackLinkClass}>
            ← Назад в каталог
          </Link>

          <div className="mt-6 max-w-4xl">
            <p className={brandZoneEyebrowClass}>
              {product.brand.name} · {product.category.name}
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">{product.title}</h1>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-product lg:items-start lg:gap-8">
            <div className="grid gap-6">
              <DeviceGallery images={gallery} />

              {facts.length > 0 ? (
                <section className="card p-6">
                  <h2 className="text-xl font-semibold">О конкретном устройстве</h2>
                  <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                    {facts.map(([label, value]) => (
                      <div key={label} className="rounded-card border border-hairline p-4">
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                          {label}
                        </dt>
                        <dd className="mt-1 text-sm font-semibold text-carbon">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ) : null}

              {product.productType === "device" && product.passport?.story.body ? (
                <DeviceStoryCard settings={devicePageSettings} story={product.passport.story} />
              ) : null}

              {usedDevice && product.passport ? (
                <PassportSummary
                  copy={devicePageSettings.passport}
                  conditionTitle={devicePageSettings.sections.conditionTitle}
                  passport={product.passport}
                />
              ) : null}

              {product.productType === "device" && product.deviceModel?.specifications?.length ? (
                <section className="card p-6">
                  <p className={homeSectionLabelClass}>Модель</p>
                  <h2 className="mt-2 text-xl font-semibold">Технические характеристики модели</h2>
                  <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                    {product.deviceModel.specifications.map((specification) => (
                      <div
                        key={specification.id}
                        className="rounded-card border border-hairline p-4"
                      >
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                          {specification.label}
                        </dt>
                        <dd className="mt-1 text-sm font-semibold leading-relaxed text-carbon">
                          {specification.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-5 text-xs leading-relaxed text-muted">
                    IP68 — заводская характеристика модели. Она не является гарантией влагозащиты
                    конкретного устройства с пробегом.
                  </p>
                </section>
              ) : null}
            </div>

            <aside className="card p-6 lg:sticky lg:top-24">
              <p className="text-muted">{product.shortDescription}</p>
              <span className="mt-5 inline-flex rounded-pill bg-surface px-3 py-1 text-sm font-medium text-muted">
                {conditionLabel}
              </span>
              <ProductOfferPanel
                offers={product.offers}
                fallbackPrice={product.priceText}
                fallbackStatus={product.stockStatusLabel}
              />

              {usedDevice ? (
                <p className="mt-5 rounded-card bg-surface p-4 text-sm text-muted">
                  Для этой техники с пробегом опубликованы диагностика и Passport. Состояние можно
                  перепроверить при просмотре.
                </p>
              ) : (
                <p className="mt-5 rounded-card bg-surface p-4 text-sm text-muted">
                  До покупки можно уточнить точные характеристики, комплектность, совместимость и
                  условия гарантии.
                </p>
              )}

              <ProductLeadForm
                productId={product.id}
                productTitle={product.title}
                productType={product.productType}
                stockStatus={product.stockStatus}
                stockStatusLabel={product.stockStatusLabel}
                leadCopy={devicePageSettings.leadForm}
              />

              <div className="mt-6 border-t border-hairline pt-5">
                <h2 className="font-semibold">Гарантия и комплект</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {product.warrantyText || product.warranty}
                </p>
                {product.completeness ? (
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    Комплект: {product.completeness}
                  </p>
                ) : null}
                <Link href="/belgorod" className="mt-3 inline-flex text-sm font-medium text-accent">
                  Уточнить условия в магазине →
                </Link>
              </div>
            </aside>
          </div>
        </section>

        {relatedProducts.length > 0 ? (
          <section className="mx-auto max-w-content px-6 pb-16">
            <p className={homeSectionLabelClass}>
              {product.productType === "device" ? "Подойдут к этой модели" : "Есть в наличии"}
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              {product.productType === "device" ? "Совместимые аксессуары" : "Подходящая техника"}
            </h2>
            <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {relatedProducts.map((item) => (
                <li key={item.id}>
                  <ProductCard product={item} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </SiteShell>
  );
}
