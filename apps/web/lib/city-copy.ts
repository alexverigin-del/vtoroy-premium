export function applyCityTemplate(value: string, city: string): string {
  return value.replaceAll("{city}", city).trim();
}

export function cityScopedLabel(city: string | undefined, label: string): string {
  return city ? `${city} · ${label}` : label;
}
