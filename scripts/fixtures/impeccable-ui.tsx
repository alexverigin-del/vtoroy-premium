import React from "react";
import { createRoot } from "react-dom/client";
import { SiteHeader } from "../../apps/web/components/SiteHeader";
import { CityProvider } from "../../apps/web/components/CityContext";
import { ProductCatalogView } from "../../apps/web/components/ProductCatalogView";
import { ProductOfferPanel } from "../../apps/web/components/ProductOfferPanel";
import { ProductPurchaseBar } from "../../apps/web/components/ProductPurchaseBar";
import { ProductLeadForm } from "../../apps/web/components/ProductLeadForm";
import { DeviceGallery } from "../../apps/web/components/DeviceGallery";
import { CertificateViewer } from "../../apps/web/components/CertificateViewer";
import { IntegrationManager } from "../../apps/web/components/IntegrationManager";
import { DEFAULT_INTEGRATION_CONSENT_SETTINGS } from "../../apps/web/lib/site-integrations";

const params = new URLSearchParams(location.search);
const sold = params.has("sold");
const max = params.has("max");
const long = params.has("long");
const title = long
  ? "iPhone 15 Pro Max 512 ГБ Blue Titanium с очень длинным названием конкретного экземпляра"
  : "iPhone 15 Pro Max 512 ГБ Blue Titanium";
const locations = ["Белгород", "Москва"].map((city, index) => ({
  id: String(index),
  slug: index ? "moscow" : "belgorod",
  city,
  name: city,
  status: "published",
}));
const settings = {
  brandName: "I СВОИ",
  logoFile: params.has("mark") ? undefined : "/fixture.webp",
  logoWidth: max ? 360 : 120,
  logoHeight: max ? 120 : 40,
  logoCaption: params.has("caption")
    ? long
      ? "Проверенная техника для своих и длинная подпись без сокращения редакторского текста"
      : "Проверенная техника для своих"
    : "",
  showBrandName: params.has("brand"),
  headerCtaLabel: "Подобрать технику",
  headerCtaUrl: "/catalog",
};
const navigation = ["Каталог", "Trade-in", "Passport", "Магазины", "Журнал", "Контакты"].map(
  (label, index) => ({
    id: String(index),
    label: long ? label + " и дополнительная информация" : label,
    url: "/catalog",
    location: "header",
    isActive: true,
    sort: index,
  }),
);
const category = {
  id: "phone",
  name: "Смартфоны",
  slug: "smartphones",
  catalogSection: "device",
  visibleProductCount: 2,
};
const product = {
  id: "fixture",
  productType: "device",
  title,
  brand: { name: "Apple", slug: "apple" },
  category,
  condition: "used",
  color: "Blue Titanium",
  listingImage: "/fixture.webp",
  listingAlt: title,
  priceText: "79 900 ₽",
  stockStatusLabel: sold ? "Продано" : "В наличии",
  trustFacts: ["Батарея 97%", "Grade A"],
  detailHref: "/product/fixture",
  ctaLabel: "Подробнее",
};
const offers = [
  {
    id: "offer",
    price: 79900,
    priceText: "79 900 ₽",
    stockStatus: sold ? "sold" : "available",
    stockQuantity: sold ? 0 : 1,
    location: locations[0],
    pickupEnabled: true,
    intercityDeliveryEnabled: false,
  },
];
const label = sold ? "Подобрать альтернативу" : "Записаться на просмотр";
const panel = {
  offers,
  fallbackPrice: "79 900 ₽",
  fallbackStatus: sold ? "Продано" : "В наличии",
  stockStatus: sold ? "sold" : "available",
};
const integrations = params.has("cookies")
  ? [
      {
        id: "fixture",
        name: "Test analytics",
        provider: "custom",
        consentCategory: "analytics",
        loadStrategy: "after_interactive",
        hostnames: ["127.0.0.1"],
        includePaths: [],
        excludePaths: [],
        bootstrapCode: "window.fixtureAnalytics=true",
        providerSettings: {},
      },
    ]
  : [];
function App() {
  return (
    <CityProvider locations={locations as never}>
      <SiteHeader settings={settings as never} navigation={navigation as never} />
      {location.pathname.startsWith("/catalog") ? (
        <ProductCatalogView
          catalogSource="v3"
          copy={{
            eyebrow: "I СВОИ · Каталог",
            headline: "Техника и аксессуары",
            body: "Новая техника и проверенные устройства с пробегом.",
          }}
          facets={
            {
              categories: [category],
              brands: [product.brand],
              models: [],
              visibleProductCounts: { device: 1, accessory: 1 },
            } as never
          }
          filters={{ q: params.get("q") || "", sort: "default" }}
          result={{ products: [product], total: 1, page: 1, pageCount: 1, pageSize: 24 } as never}
        />
      ) : (
        <main className="max-w-shell mx-auto px-5 pb-28 pt-6">
          <h1 className="break-words text-3xl font-semibold">{title}</h1>
          <section id="product-purchase-summary" className="my-6">
            <ProductOfferPanel {...(panel as never)} />
            <a href="#product-lead-form">{label}</a>
          </section>
          <DeviceGallery
            images={
              [
                { src: "/fixture.webp", label: "Фото", alt: title },
                { src: "/fixture.webp?second", label: "Детали", alt: title },
              ] as never
            }
          />
          <section className="min-h-screen py-10">
            <h2>Характеристики</h2>
            <CertificateViewer
              href={params.has("error") ? "/missing.png" : "/fixture.webp"}
              provider="Fixture"
              testedAt="2026-09-10"
            />
          </section>
          <ProductLeadForm
            productId="fixture"
            productTitle={title}
            formId="product-lead-form"
            stockStatus={panel.stockStatus}
            stockStatusLabel={panel.fallbackStatus}
          />
          <ProductPurchaseBar
            offers={offers as never}
            price="79 900 ₽"
            status={panel.fallbackStatus}
            stockStatus={panel.stockStatus}
            label={label}
            formId="product-lead-form"
          />
        </main>
      )}
      <IntegrationManager
        integrations={integrations as never}
        settings={DEFAULT_INTEGRATION_CONSENT_SETTINGS}
      />
    </CityProvider>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
