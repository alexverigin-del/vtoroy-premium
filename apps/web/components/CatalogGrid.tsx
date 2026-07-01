"use client";

import type { DeviceCardData } from "@/lib/device-card-data";
import {
  CatalogDeviceList,
  CatalogToolbar,
  DEFAULT_CATEGORY_FILTERS,
  DEFAULT_STATUS_FILTERS,
  useCatalogControls,
  useVisibleCatalogDevices,
} from "./CatalogClientControls";

export function CatalogGrid({
  devices,
  directusEnabled,
}: {
  devices: DeviceCardData[];
  directusEnabled: boolean;
}) {
  const controls = useCatalogControls();
  const visibleDevices = useVisibleCatalogDevices({ devices, ...controls });

  return (
    <section className="bg-white py-16" id="catalog" data-component="CatalogGrid">
      <div className="mx-auto max-w-shell px-5">
        <div className="mx-auto max-w-copy-wide text-center">
          <div className="text-xs font-semibold uppercase tracking-eyebrow text-ash">Store</div>
          <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-normal text-carbon md:text-5xl">
            Вещи в кругу — сейчас в наличии.
          </h1>
          <p className="mx-auto mt-4 max-w-prose text-copy leading-relaxed text-graphite">
            {directusEnabled
              ? "Карточки загружаются из Directus: фото, грейд, цена, Passport и цена выхода обновляются без правки кода."
              : "Directus не настроен — показаны демо-данные из data/devices.json."}
          </p>
        </div>

        <CatalogToolbar
          categories={DEFAULT_CATEGORY_FILTERS}
          statuses={DEFAULT_STATUS_FILTERS}
          controls={controls}
          inactiveSurface="transparent"
        />

        <CatalogDeviceList
          devices={visibleDevices}
          emptyMessage="Подходящих устройств пока нет. Измените фильтры или добавьте опубликованные устройства в Directus."
        />
      </div>
    </section>
  );
}
