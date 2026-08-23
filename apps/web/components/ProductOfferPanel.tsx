"use client";

import Link from "next/link";
import type { ProductOffer } from "@vtoroy/shared";

import { useCity } from "./CityContext";

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
  const available = offers.filter(
    (offer) => offer.stockStatus !== "hidden" && offer.stockQuantity > 0,
  );
  const offer = selected
    ? (available.find((item) => item.location.slug === selected.slug) ??
      available.find((item) => item.intercityDeliveryEnabled))
    : available.sort((a, b) => a.price - b.price)[0];
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
          ? local
            ? `${offer.location.city} · В наличии`
            : `Доставка из города ${offer.location.city}${offer.deliveryEstimate ? ` · ${offer.deliveryEstimate}` : ""}`
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
            ? `Можно забрать в магазине в городе ${offer.location.city} после подтверждения резерва.`
            : offer.intercityDeliveryEnabled
              ? `Товар можно доставить из магазина в городе ${offer.location.city}. Срок подтвердим перед оплатой.`
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
