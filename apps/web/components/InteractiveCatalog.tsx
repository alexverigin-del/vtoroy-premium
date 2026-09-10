"use client";

import type { ComponentProps, ReactNode } from "react";
import type { DeviceCardData } from "../lib/device-card-data";
import {
  CatalogToolbar,
  CatalogDeviceList,
  useCatalogControls,
  useVisibleCatalogDevices,
} from "./CatalogClientControls";

export function InteractiveCatalog({
  devices,
  cards,
  toolbar,
  list,
  limit,
}: {
  devices: DeviceCardData[];
  cards: Record<string, ReactNode>;
  toolbar?: Omit<ComponentProps<typeof CatalogToolbar>, "controls">;
  list: Omit<ComponentProps<typeof CatalogDeviceList>, "devices" | "cards">;
  limit?: number;
}) {
  const controls = useCatalogControls();
  const visible = useVisibleCatalogDevices({ devices, limit, ...controls });
  return (
    <>
      {toolbar ? <CatalogToolbar {...toolbar} controls={controls} /> : null}
      <CatalogDeviceList {...list} devices={visible} cards={cards} />
    </>
  );
}
