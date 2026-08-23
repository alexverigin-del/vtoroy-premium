"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { StoreLocation } from "@vtoroy/shared";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const CITY_COOKIE = "isvoi_city";
const COOKIE_AGE = 60 * 60 * 24 * 180;

type CityContextValue = {
  locations: StoreLocation[];
  selected: StoreLocation | null;
  selectCity: (slug: string) => void;
};

const CityContext = createContext<CityContextValue>({
  locations: [],
  selected: null,
  selectCity: () => undefined,
});

function cookieValue(name: string): string {
  if (typeof document === "undefined") return "";
  const prefix = `${name}=`;
  return (
    document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length) ?? ""
  );
}

function cityFromPath(pathname: string, locations: StoreLocation[]): StoreLocation | null {
  const segment = pathname.split("/").filter(Boolean)[0] || "";
  return locations.find((location) => location.slug === segment) ?? null;
}

export function CityProvider({
  children,
  locations,
}: {
  children: ReactNode;
  locations: StoreLocation[];
}) {
  const pathname = usePathname();
  const explicit = cityFromPath(pathname, locations);
  const [selectedSlug, setSelectedSlug] = useState(explicit?.slug ?? "");
  const [hint, setHint] = useState<StoreLocation | null>(null);
  const [hintDismissed, setHintDismissed] = useState(false);

  useEffect(() => {
    if (explicit) {
      setSelectedSlug(explicit.slug);
      document.cookie = `${CITY_COOKIE}=${encodeURIComponent(explicit.slug)}; Path=/; Max-Age=${COOKIE_AGE}; SameSite=Lax; Secure`;
      return;
    }
    const saved = decodeURIComponent(cookieValue(CITY_COOKIE));
    if (locations.some((location) => location.slug === saved)) setSelectedSlug(saved);
  }, [explicit, locations]);

  useEffect(() => {
    if (explicit || selectedSlug || hintDismissed || locations.length === 0) return;
    const controller = new AbortController();
    fetch("/api/location-hint", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { slug?: string } | null) => {
        const suggested = locations.find((location) => location.slug === payload?.slug);
        if (suggested) setHint(suggested);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [explicit, hintDismissed, locations, selectedSlug]);

  const selected = useMemo(
    () => locations.find((location) => location.slug === selectedSlug) ?? explicit ?? null,
    [explicit, locations, selectedSlug],
  );

  const selectCity = (slug: string) => {
    if (!slug) {
      setSelectedSlug("");
      setHint(null);
      setHintDismissed(true);
      document.cookie = `${CITY_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; Secure`;
      return;
    }
    if (!locations.some((location) => location.slug === slug)) return;
    setSelectedSlug(slug);
    setHint(null);
    document.cookie = `${CITY_COOKIE}=${encodeURIComponent(slug)}; Path=/; Max-Age=${COOKIE_AGE}; SameSite=Lax; Secure`;
  };

  return (
    <CityContext.Provider value={{ locations, selected, selectCity }}>
      {children}
      {hint && !hintDismissed ? (
        <aside
          className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-xl rounded-card border border-hairline bg-white p-4 shadow-product"
          aria-label="Предложение выбрать город"
        >
          <p className="text-sm font-semibold text-carbon">
            Похоже, ваш город — {hint.city}. Показать местный ассортимент?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/${hint.slug}/catalog`}
              onClick={() => selectCity(hint.slug)}
              className="focus-ring inline-flex min-h-10 items-center rounded-pill bg-action-blue px-4 text-sm font-medium text-white"
            >
              Да, выбрать {hint.city}
            </Link>
            <button
              type="button"
              onClick={() => {
                setHint(null);
                setHintDismissed(true);
              }}
              className="focus-ring inline-flex min-h-10 items-center rounded-pill border border-hairline px-4 text-sm font-medium text-carbon"
            >
              Выбрать позже
            </button>
          </div>
        </aside>
      ) : null}
    </CityContext.Provider>
  );
}

export function useCity() {
  return useContext(CityContext);
}

export function CitySwitcher({ mobile = false }: { mobile?: boolean }) {
  const { locations, selected, selectCity } = useCity();
  const pathname = usePathname();
  const router = useRouter();
  if (locations.length === 0) return null;

  const switchCity = (slug: string) => {
    selectCity(slug);
    if (pathname.startsWith("/product/")) return;

    const currentCity = cityFromPath(pathname, locations);
    const suffix = currentCity ? pathname.slice(currentCity.slug.length + 1) || "/" : pathname;
    if (!slug) {
      router.push(suffix === "/contacts" || suffix === "/delivery" ? "/stores" : suffix);
      return;
    }
    if (suffix === "/" || !suffix.startsWith("/catalog")) {
      router.push(`/${slug}`);
      return;
    }
    router.push(`/${slug}${suffix}`);
  };

  return (
    <label
      className={
        mobile
          ? "mb-2 grid gap-1 px-3 text-xs text-muted"
          : "hidden items-center gap-2 text-xs text-muted lg:flex"
      }
    >
      <span>Город</span>
      <select
        aria-label="Выбрать город"
        value={selected?.slug ?? ""}
        onChange={(event) => switchCity(event.target.value)}
        className="focus-ring min-h-10 rounded-pill border border-hairline bg-white px-3 text-sm font-medium text-carbon"
      >
        <option value="">Вся сеть</option>
        {locations.map((location) => (
          <option key={location.id} value={location.slug}>
            {location.city}
          </option>
        ))}
      </select>
    </label>
  );
}
