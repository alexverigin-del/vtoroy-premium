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
import { brandZoneEyebrowClass } from "./ui-classes";

export function CatalogGrid({
  devices,
  directusEnabled,
  headingLevel = "h1",
}: {
  devices: DeviceCardData[];
  directusEnabled: boolean;
  headingLevel?: "h1" | "h2";
}) {
  const controls = useCatalogControls();
  const visibleDevices = useVisibleCatalogDevices({ devices, ...controls });
  const Heading = headingLevel;

  return (
    <section className="bg-white py-16" id="catalog" data-component="CatalogGrid">
      <div className="mx-auto max-w-shell px-5">
        <div className="mx-auto max-w-copy-wide text-center">
          <div className={brandZoneEyebrowClass}>I СВОИ · Каталог</div>
          <Heading className="mt-3 text-4xl font-semibold leading-tight tracking-normal text-carbon md:text-5xl">
            Вещи в кругу — сейчас в наличии.
          </Heading>
          <p className="mx-auto mt-4 max-w-prose text-copy leading-relaxed text-graphite">
            {directusEnabled
              ? "В наличии только проверенные вещи: фото, грейд, гарантия и цена выхода обновляются после проверки."
              : "Показаны демонстрационные карточки: они помогают оценить формат Store до подключения живого каталога."}
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
          emptyMessage="Подходящих устройств пока нет. Измените фильтры или вернитесь позже."
          priorityImageCount={1}
          showSelectionCta
        />
      </div>
    </section>
  );
}
