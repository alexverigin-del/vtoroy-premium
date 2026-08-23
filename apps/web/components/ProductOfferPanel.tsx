"use client";

import Link from "next/link";
import type { ProductOffer } from "@vtoroy/shared";

import { cityScopedLabel } from "../lib/city-copy";
import { useCity } from "./CityContext";

function offerStatusLabel(offer: ProductOffer): string {
  if (offer.stockStatus === "reserved") return "Бронь";
  if (offer.stockStatus === "sold" || offer.stockQuantity <= 0) return "Нет в наличии";
  return "В наличии";
}

export function ProductOfferPanel({
  fallbackPrice,
  fallbackStatus,
  offers,
}: {
  fallbackPrice: string;
  fallbackStatus: string;
  offers: ProductOffer[];
}) {
  const { locations, selected, selectCity } = useCity();
  const stocked = offers.filter(
    (offer) =>
      offer.stockStatus !== "hidden" && offer.stockStatus !== "sold" && offer.stockQuantity > 0,
  );
  const offer = selected
    ? (stocked.find((item) => item.location.slug === selected.slug) ??
      stocked.find((item) => item.stockStatus === "available" && item.intercityDeliveryEnabled))
    : stocked.sort((a, b) => a.price - b.price)[0];
  const local = Boolean(offer && selected && offer.location.slug === selected.slug);

  return (
    <div className="mt-6" data-component="ProductOfferPanel">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-3xl font-semibold tabular-nums">
          {offer?.priceText || fallbackPrice}
        </span>
      </div>
      <p className="mt-3 text-sm font-medium">
        {offer
          ? selected
            ? local
              ? cityScopedLabel(offer.location.city, offerStatusLabel(offer))
              : `${offer.location.city} · Доставка${offer.deliveryEstimate ? ` · ${offer.deliveryEstimate}` : ""}`
            : cityScopedLabel(offer.location.city, offerStatusLabel(offer))
          : selected
            ? cityScopedLabel(selected.city, "Нет в наличии")
            : fallbackStatus}
      </p>

      {locations.length > 0 ? (
        <label className="mt-5 block">
          <span className="text-xs font-medium text-muted">Город получения</span>
          <select
            value={selected?.slug ?? ""}
            onChange={(event) => selectCity(event.target.value)}
            className="focus-ring mt-2 min-h-11 w-full rounded-card border border-hairline bg-white px-3 text-sm font-medium text-carbon"
          >
            <option value="">Вся сеть</option>
            {locations.map((location) => (
              <option key={location.id} value={location.slug}>
                {location.city}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {offer ? (
        <div className="mt-4 rounded-card bg-surface p-4 text-sm leading-relaxed text-muted">
          {local && offer.pickupEnabled
            ? `Самовывоз: I СВОИ · ${offer.location.city}. После подтверждения резерва.`
            : selected && offer.intercityDeliveryEnabled
              ? `Доставка из магазина I СВОИ · ${offer.location.city}. Срок подтвердим перед оплатой.`
              : !selected
                ? `Товар доступен в магазине I СВОИ · ${offer.location.city}. Выберите город получения, чтобы уточнить способ и срок.`
                : "Для этого предложения доступность получения нужно подтвердить."}
          <Link
            href={`/${offer.location.slug}/delivery`}
            className="mt-2 block font-medium text-accent"
          >
            Условия получения →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
