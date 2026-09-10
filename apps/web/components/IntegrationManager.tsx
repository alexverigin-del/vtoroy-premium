"use client";

import type {
  IntegrationConsentSettings,
  SiteIntegration,
  YandexMetrikaSettings,
} from "@vtoroy/shared";
import { usePathname, useSearchParams } from "next/navigation";
import { lazy, Suspense } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  allConsentCategories,
  consentAllows,
  emptyConsentCategories,
  INTEGRATION_CONSENT_COOKIE,
  INTEGRATION_SETTINGS_AVAILABILITY_EVENT,
  type IntegrationConsentChoice,
  matchesIntegrationTarget,
  OPEN_INTEGRATION_SETTINGS_EVENT,
  type OptionalConsentCategory,
  parseConsentChoice,
  serializeConsentChoice,
} from "@/lib/site-integrations";

type ActiveAdapter = {
  url: string;
  routeChange: (url: string, previousUrl: string) => void;
  deactivate: () => void;
};

type MetrikaFunction = ((...args: unknown[]) => void) & { a?: unknown[][]; l?: number };
type MetrikaWindow = Window & { ym?: MetrikaFunction };

const ConsentDialog = lazy(() =>
  import("./ConsentDialog").then((module) => ({ default: module.ConsentDialog })),
);
const consentBannerClass =
  "fixed inset-x-3 bottom-3 z-modal mx-auto max-h-dialog max-w-copy overflow-y-auto break-words rounded-card border border-hairline bg-white p-4 sm:bottom-5 sm:flex sm:items-center sm:gap-6";

function readCookie(name: string): string | undefined {
  const prefix = `${name}=`;
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

function writeConsentCookie(choice: IntegrationConsentChoice, retentionDays: number) {
  const hostname = window.location.hostname.toLowerCase();
  const productionDomain = hostname === "isvoi.ru" || hostname.endsWith(".isvoi.ru");
  const attributes = [
    `Max-Age=${Math.round(retentionDays * 86_400)}`,
    "Path=/",
    "SameSite=Lax",
    ...(productionDomain ? ["Domain=.isvoi.ru", "Secure"] : []),
  ];
  document.cookie = `${INTEGRATION_CONSENT_COOKIE}=${serializeConsentChoice(choice)}; ${attributes.join("; ")}`;
}

function executeInlineScript(id: string, kind: "bootstrap" | "cleanup", code: string) {
  const script = document.createElement("script");
  script.dataset.isvoiIntegration = id;
  script.dataset.isvoiIntegrationKind = kind;
  script.text = `${code}\n//# sourceURL=isvoi-integration-${id}-${kind}.js`;
  document.body.appendChild(script);
  script.remove();
}

function scheduleActivation(strategy: SiteIntegration["loadStrategy"], task: () => void) {
  if (strategy !== "lazy_onload") {
    task();
    return () => undefined;
  }
  let cancelled = false;
  const run = () => {
    if (cancelled) return;
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(() => !cancelled && task(), { timeout: 2_000 });
    } else {
      globalThis.setTimeout(() => !cancelled && task(), 1);
    }
  };
  if (document.readyState === "complete") run();
  else window.addEventListener("load", run, { once: true });
  return () => {
    cancelled = true;
    window.removeEventListener("load", run);
  };
}

function ensureMetrikaLoader() {
  const metrikaWindow = window as MetrikaWindow;
  if (!metrikaWindow.ym) {
    const queuedYm = function (...args: unknown[]) {
      (queuedYm.a ??= []).push(args);
    } as MetrikaFunction;
    queuedYm.l = Date.now();
    metrikaWindow.ym = queuedYm;
  }
  if (!document.getElementById("isvoi-yandex-metrika-loader")) {
    const script = document.createElement("script");
    script.id = "isvoi-yandex-metrika-loader";
    script.async = true;
    script.src = "https://mc.yandex.ru/metrika/tag.js";
    script.dataset.isvoiIntegrationRuntime = "yandex-metrika";
    document.head.appendChild(script);
  }
  return metrikaWindow.ym;
}

function activateMetrika(integration: SiteIntegration, url: string): ActiveAdapter {
  const settings = integration.providerSettings as YandexMetrikaSettings;
  let initialized = false;
  let latestUrl = url;
  const cancel = scheduleActivation(integration.loadStrategy, () => {
    const ym = ensureMetrikaLoader();
    if (!ym) return;
    ym(Number(settings.counterId), "init", {
      defer: true,
      webvisor: settings.webvisor,
      clickmap: settings.clickmap,
      trackLinks: settings.trackLinks,
      accurateTrackBounce: settings.accurateTrackBounce,
    });
    initialized = true;
    ym(Number(settings.counterId), "hit", latestUrl, { title: document.title });
  });
  return {
    url,
    routeChange(nextUrl, previousUrl) {
      latestUrl = nextUrl;
      const ym = (window as MetrikaWindow).ym;
      if (initialized && ym) {
        ym(Number(settings.counterId), "hit", nextUrl, {
          title: document.title,
          referer: previousUrl,
        });
      }
    },
    deactivate() {
      cancel();
      const ym = (window as MetrikaWindow).ym;
      if (initialized && ym) ym(Number(settings.counterId), "destruct");
      initialized = false;
    },
  };
}

function activateCustom(integration: SiteIntegration, url: string): ActiveAdapter {
  let bootstrapped = false;
  let started = false;
  let externalScript: HTMLScriptElement | null = null;
  const runBootstrap = () => {
    if (!integration.bootstrapCode || bootstrapped) return;
    executeInlineScript(integration.id, "bootstrap", integration.bootstrapCode);
    bootstrapped = true;
  };
  const cancel = scheduleActivation(integration.loadStrategy, () => {
    started = true;
    if (integration.scriptUrl) {
      externalScript = document.createElement("script");
      externalScript.async = true;
      externalScript.src = integration.scriptUrl;
      externalScript.dataset.isvoiIntegration = integration.id;
      externalScript.addEventListener("load", runBootstrap, { once: true });
      document.head.appendChild(externalScript);
    } else {
      runBootstrap();
    }
  });
  return {
    url,
    routeChange(nextUrl, previousUrl) {
      window.dispatchEvent(
        new CustomEvent("isvoi:integration-route-change", {
          detail: { id: integration.id, url: nextUrl, previousUrl },
        }),
      );
    },
    deactivate() {
      cancel();
      externalScript?.removeEventListener("load", runBootstrap);
      if (integration.cleanupCode && started) {
        executeInlineScript(integration.id, "cleanup", integration.cleanupCode);
      }
      externalScript?.remove();
      externalScript = null;
      bootstrapped = false;
      started = false;
    },
  };
}

function activateIntegration(integration: SiteIntegration, url: string): ActiveAdapter {
  return integration.provider === "yandex_metrika"
    ? activateMetrika(integration, url)
    : activateCustom(integration, url);
}

export function IntegrationManager({
  integrations,
  settings,
  privacyUrl,
}: {
  integrations: SiteIntegration[];
  settings: IntegrationConsentSettings;
  privacyUrl?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [choice, setChoice] = useState<IntegrationConsentChoice | null | undefined>(undefined);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftCategories, setDraftCategories] = useState(emptyConsentCategories);
  const activeRef = useRef(new Map<string, ActiveAdapter>());
  const query = searchParams.toString();
  const currentPath = pathname || "/";
  const currentUrl = query ? `${currentPath}?${query}` : currentPath;
  const optionalAvailable = integrations.some(
    (integration) => integration.consentCategory !== "necessary",
  );

  useEffect(() => {
    setChoice(parseConsentChoice(readCookie(INTEGRATION_CONSENT_COOKIE), settings, new Date()));
  }, [settings]);

  const openSettings = useCallback(() => {
    setDraftCategories(choice?.categories ?? emptyConsentCategories());
    setSettingsOpen(true);
  }, [choice]);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  useEffect(() => {
    document.documentElement.dataset.integrationSettingsAvailable = String(optionalAvailable);
    document.documentElement.dataset.integrationSettingsLabel = settings.footerLinkLabel;
    window.dispatchEvent(
      new CustomEvent(INTEGRATION_SETTINGS_AVAILABILITY_EVENT, {
        detail: { available: optionalAvailable, label: settings.footerLinkLabel },
      }),
    );
    const onOpen = () => openSettings();
    window.addEventListener(OPEN_INTEGRATION_SETTINGS_EVENT, onOpen);
    return () => {
      window.removeEventListener(OPEN_INTEGRATION_SETTINGS_EVENT, onOpen);
      delete document.documentElement.dataset.integrationSettingsAvailable;
      delete document.documentElement.dataset.integrationSettingsLabel;
    };
  }, [openSettings, optionalAvailable, settings.footerLinkLabel]);

  useEffect(() => {
    if (choice === undefined) return;
    const hostname = window.location.hostname;
    const active = activeRef.current;
    for (const integration of integrations) {
      const shouldRun =
        matchesIntegrationTarget(integration, hostname, currentPath) &&
        consentAllows(integration.consentCategory, choice);
      const adapter = active.get(integration.id);
      if (!shouldRun && adapter) {
        adapter.deactivate();
        active.delete(integration.id);
      } else if (shouldRun && !adapter) {
        active.set(integration.id, activateIntegration(integration, currentUrl));
      } else if (shouldRun && adapter && adapter.url !== currentUrl) {
        const previousUrl = adapter.url;
        adapter.url = currentUrl;
        adapter.routeChange(currentUrl, previousUrl);
      }
    }
    const configuredIds = new Set(integrations.map((integration) => integration.id));
    for (const [id, adapter] of active) {
      if (!configuredIds.has(id)) {
        adapter.deactivate();
        active.delete(id);
      }
    }
  }, [choice, currentPath, currentUrl, integrations]);

  useEffect(
    () => () => {
      for (const adapter of activeRef.current.values()) adapter.deactivate();
      activeRef.current.clear();
    },
    [],
  );

  const matchingOptional = useMemo(() => {
    if (typeof window === "undefined") return false;
    return integrations.some(
      (integration) =>
        integration.consentCategory !== "necessary" &&
        matchesIntegrationTarget(integration, window.location.hostname, currentPath),
    );
  }, [currentPath, integrations]);

  const commitChoice = useCallback(
    (categories: Record<OptionalConsentCategory, boolean>) => {
      const nextChoice: IntegrationConsentChoice = {
        version: settings.version,
        updatedAt: new Date().toISOString(),
        categories,
      };
      const revoked = choice
        ? (Object.keys(categories) as OptionalConsentCategory[]).some(
            (category) => choice.categories[category] && !categories[category],
          )
        : false;
      writeConsentCookie(nextChoice, settings.retentionDays);
      setChoice(nextChoice);
      setSettingsOpen(false);
      if (revoked) window.location.reload();
    },
    [choice, settings.retentionDays, settings.version],
  );

  if (integrations.length === 0 || choice === undefined) return null;

  return (
    <>
      {choice === null && matchingOptional && !settingsOpen ? (
        <section
          data-consent-banner
          aria-label={settings.bannerTitle}
          className={consentBannerClass}
        >
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-carbon">{settings.bannerTitle}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ash">{settings.bannerBody}</p>
            {privacyUrl ? (
              <a
                href={privacyUrl}
                className="mt-2 inline-flex min-h-11 items-center text-sm text-link-blue underline-offset-4 outline-none hover:underline focus-visible:shadow-focus"
              >
                {settings.privacyLinkLabel}
              </a>
            ) : null}
          </div>
          <div className="mt-3 grid shrink-0 grid-cols-2 gap-2 sm:mt-0 sm:w-52">
            <button
              type="button"
              className="btn-pill min-h-11 min-w-0 break-words px-3 text-sm"
              onClick={() => commitChoice(allConsentCategories())}
            >
              {settings.acceptAllLabel}
            </button>
            <button
              type="button"
              className="min-h-11 min-w-0 break-words rounded-pill border border-hairline px-3 text-sm font-medium outline-none transition hover:bg-frost focus-visible:shadow-focus"
              onClick={() => commitChoice(emptyConsentCategories())}
            >
              {settings.rejectOptionalLabel}
            </button>
            <button
              type="button"
              className="col-span-2 min-h-11 text-sm font-medium text-link-blue underline-offset-4 outline-none hover:underline focus-visible:shadow-focus"
              onClick={openSettings}
            >
              {settings.customizeLabel}
            </button>
          </div>
        </section>
      ) : null}
      {settingsOpen ? (
        <Suspense
          fallback={
            <p role="status" data-modal-pending>
              Загрузка…
            </p>
          }
        >
          <ConsentDialog
            settings={settings}
            privacyUrl={privacyUrl}
            categories={draftCategories}
            onChange={(category, checked) =>
              setDraftCategories((current) => ({ ...current, [category]: checked }))
            }
            onSave={() => commitChoice(draftCategories)}
            onClose={closeSettings}
          />
        </Suspense>
      ) : null}
    </>
  );
}
