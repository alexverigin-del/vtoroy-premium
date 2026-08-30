import type { TradeDeviceConfiguration } from "@vtoroy/shared";

export function tradeDeviceGroups(devices: TradeDeviceConfiguration[]) {
  const brands = new Map<string, Map<string, { id: string; name: string }>>();
  for (const device of devices) {
    const brand = device.modelSlug.startsWith("iphone-")
      ? "Apple"
      : device.modelSlug.startsWith("samsung-")
        ? "Samsung"
        : "Другие модели";
    const models = brands.get(brand) ?? new Map();
    models.set(device.deviceModelId, { id: device.deviceModelId, name: device.modelName });
    brands.set(brand, models);
  }
  return [...brands].map(([brand, models]) => ({ brand, models: [...models.values()] }));
}
