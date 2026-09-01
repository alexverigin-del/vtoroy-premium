import type {
  ConsentCategory,
  IntegrationConsentSettings,
  IntegrationLoadStrategy,
  IntegrationProvider,
  SiteIntegration,
  YandexMetrikaSettings,
} from "@vtoroy/shared";

export const INTEGRATION_CONSENT_COOKIE = "isvoi_integrations_consent_v1";
export const OPEN_INTEGRATION_SETTINGS_EVENT = "isvoi:open-integration-settings";
export const INTEGRATION_SETTINGS_AVAILABILITY_EVENT = "isvoi:integration-settings-availability";

export const DEFAULT_INTEGRATION_CONSENT_SETTINGS: IntegrationConsentSettings = {
  version: "integrations-consent-v1",
  retentionDays: 180,
  bannerTitle: "Настройки приватности",
  bannerBody:
    "Мы используем необязательные сервисы только с вашего разрешения. Вы можете изменить выбор в любое время.",
  acceptAllLabel: "Принять все",
  rejectOptionalLabel: "Только необходимые",
  customizeLabel: "Настроить",
  settingsTitle: "Какие сервисы можно включить",
  settingsBody:
    "Необходимые функции работают всегда. Остальные категории можно включать независимо друг от друга.",
  saveLabel: "Сохранить выбор",
  closeLabel: "Закрыть",
  footerLinkLabel: "Настройки cookies",
  privacyLinkLabel: "Подробнее о данных",
  necessaryLabel: "Необходимые",
  necessaryDescription: "Нужны для базовой работы и безопасности сайта.",
  analyticsLabel: "Аналитика",
  analyticsDescription: "Помогает понять, какие страницы полезны и где сайт можно улучшить.",
  marketingLabel: "Маркетинг",
  marketingDescription: "Используется для оценки рекламных кампаний и релевантности предложений.",
  supportLabel: "Поддержка и чаты",
  supportDescription: "Позволяет подключать онлайн-чат и другие сервисы помощи.",
};

export type OptionalConsentCategory = Exclude<ConsentCategory, "necessary">;

export interface IntegrationConsentChoice {
  version: string;
  updatedAt: string;
  categories: Record<OptionalConsentCategory, boolean>;
}

export type IntegrationNormalizationResult =
  { integration: SiteIntegration; reason?: never } | { integration?: never; reason: string };

const CONSENT_CATEGORIES = new Set<ConsentCategory>([
  "necessary",
  "analytics",
  "marketing",
  "support",
]);
const PROVIDERS = new Set<IntegrationProvider>(["yandex_metrika", "custom"]);
const LOAD_STRATEGIES = new Set<IntegrationLoadStrategy>(["after_interactive", "lazy_onload"]);

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function number(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function object(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function stringList(value: unknown): string[] {
  let source: unknown = value;
  if (typeof value === "string") {
    try {
      source = JSON.parse(value) as unknown;
    } catch {
      source = value.split(/[\n,]/);
    }
  }
  if (!Array.isArray(source)) return [];
  return [...new Set(source.map((item) => text(item)).filter(Boolean))];
}

function normalizeHostname(value: string): string {
  const withoutProtocol = value
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0];
  return withoutProtocol.replace(/:\d+$/, "").replace(/^\.+|\.+$/g, "");
}

function validHostname(value: string): boolean {
  return (
    value === "localhost" ||
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
      value,
    )
  );
}

export function normalizePathPrefix(value: string): string {
  const withoutQuery = value.trim().split(/[?#]/)[0];
  if (!withoutQuery || withoutQuery === "/") return "/";
  const rooted = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  return rooted.replace(/\/{2,}/g, "/").replace(/\/$/, "");
}

function pathPrefixes(value: unknown): string[] {
  return [...new Set(stringList(value).map(normalizePathPrefix))];
}

export function isSafeIntegrationScriptUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function yandexSettings(value: unknown): YandexMetrikaSettings | null {
  const settings = object(value);
  const counterId = text(settings.counterId ?? settings.counter_id);
  if (!/^\d+$/.test(counterId) || Number(counterId) <= 0) return null;
  const accurateRaw = settings.accurateTrackBounce ?? settings.accurate_track_bounce;
  const accurateTrackBounce =
    typeof accurateRaw === "number" && Number.isFinite(accurateRaw) && accurateRaw >= 0
      ? accurateRaw
      : bool(accurateRaw, true);
  return {
    counterId,
    webvisor: bool(settings.webvisor, false),
    clickmap: bool(settings.clickmap, true),
    trackLinks: bool(settings.trackLinks ?? settings.track_links, true),
    accurateTrackBounce,
  };
}

export function normalizeSiteIntegration(
  row: Record<string, unknown>,
): IntegrationNormalizationResult {
  const id = text(row.id);
  const name = text(row.name);
  const provider = text(row.provider) as IntegrationProvider;
  const consentCategory = text(row.consent_category) as ConsentCategory;
  const loadStrategyValue = text(row.load_strategy, "after_interactive");
  const loadStrategy = LOAD_STRATEGIES.has(loadStrategyValue as IntegrationLoadStrategy)
    ? (loadStrategyValue as IntegrationLoadStrategy)
    : "after_interactive";
  if (!id || !name) return { reason: "missing id or name" };
  if (!PROVIDERS.has(provider)) return { reason: `unsupported provider: ${provider || "empty"}` };
  if (!CONSENT_CATEGORIES.has(consentCategory)) {
    return { reason: `unsupported consent category: ${consentCategory || "empty"}` };
  }

  const hostnames = stringList(row.hostnames).map(normalizeHostname);
  if (hostnames.some((hostname) => !validHostname(hostname))) {
    return { reason: "invalid hostname targeting" };
  }
  const includePaths = pathPrefixes(row.include_paths);
  const excludePaths = pathPrefixes(row.exclude_paths);
  const scriptUrl = text(row.script_url);
  const bootstrapCode = text(row.bootstrap_code);
  const cleanupCode = text(row.cleanup_code);

  if (provider === "yandex_metrika") {
    const settings = yandexSettings(row.provider_settings);
    if (!settings) return { reason: "invalid Yandex Metrika counter settings" };
    return {
      integration: {
        id,
        name,
        provider,
        consentCategory,
        loadStrategy,
        providerSettings: settings,
        hostnames,
        includePaths,
        excludePaths,
        sort: number(row.sort, 0),
      },
    };
  }

  if (!scriptUrl && !bootstrapCode) return { reason: "custom integration has no script" };
  if (scriptUrl && !isSafeIntegrationScriptUrl(scriptUrl)) {
    return { reason: "custom script URL must use HTTPS" };
  }
  if ((includePaths.length > 0 || excludePaths.length > 0) && !cleanupCode) {
    return { reason: "path-targeted custom integration requires cleanup code" };
  }
  return {
    integration: {
      id,
      name,
      provider,
      consentCategory,
      loadStrategy,
      providerSettings: object(row.provider_settings),
      scriptUrl: scriptUrl || undefined,
      bootstrapCode: bootstrapCode || undefined,
      cleanupCode: cleanupCode || undefined,
      hostnames,
      includePaths,
      excludePaths,
      sort: number(row.sort, 0),
    },
  };
}

function settingText(row: Record<string, unknown>, key: string, fallback: string): string {
  return text(row[key], fallback);
}

export function normalizeIntegrationConsentSettings(
  row?: Record<string, unknown> | null,
): IntegrationConsentSettings {
  const source = row ?? {};
  const defaults = DEFAULT_INTEGRATION_CONSENT_SETTINGS;
  return {
    version: settingText(source, "version", defaults.version),
    retentionDays: Math.min(
      365,
      Math.max(1, number(source.retention_days, defaults.retentionDays)),
    ),
    bannerTitle: settingText(source, "banner_title", defaults.bannerTitle),
    bannerBody: settingText(source, "banner_body", defaults.bannerBody),
    acceptAllLabel: settingText(source, "accept_all_label", defaults.acceptAllLabel),
    rejectOptionalLabel: settingText(source, "reject_optional_label", defaults.rejectOptionalLabel),
    customizeLabel: settingText(source, "customize_label", defaults.customizeLabel),
    settingsTitle: settingText(source, "settings_title", defaults.settingsTitle),
    settingsBody: settingText(source, "settings_body", defaults.settingsBody),
    saveLabel: settingText(source, "save_label", defaults.saveLabel),
    closeLabel: settingText(source, "close_label", defaults.closeLabel),
    footerLinkLabel: settingText(source, "footer_link_label", defaults.footerLinkLabel),
    privacyLinkLabel: settingText(source, "privacy_link_label", defaults.privacyLinkLabel),
    necessaryLabel: settingText(source, "necessary_label", defaults.necessaryLabel),
    necessaryDescription: settingText(
      source,
      "necessary_description",
      defaults.necessaryDescription,
    ),
    analyticsLabel: settingText(source, "analytics_label", defaults.analyticsLabel),
    analyticsDescription: settingText(
      source,
      "analytics_description",
      defaults.analyticsDescription,
    ),
    marketingLabel: settingText(source, "marketing_label", defaults.marketingLabel),
    marketingDescription: settingText(
      source,
      "marketing_description",
      defaults.marketingDescription,
    ),
    supportLabel: settingText(source, "support_label", defaults.supportLabel),
    supportDescription: settingText(source, "support_description", defaults.supportDescription),
  };
}

export function pathMatchesPrefix(pathname: string, prefix: string): boolean {
  const normalizedPath = normalizePathPrefix(pathname);
  const normalizedPrefix = normalizePathPrefix(prefix);
  return (
    normalizedPrefix === "/" ||
    normalizedPath === normalizedPrefix ||
    normalizedPath.startsWith(`${normalizedPrefix}/`)
  );
}

export function matchesIntegrationTarget(
  integration: SiteIntegration,
  hostname: string,
  pathname: string,
): boolean {
  const normalizedHost = normalizeHostname(hostname);
  if (integration.hostnames.length > 0 && !integration.hostnames.includes(normalizedHost)) {
    return false;
  }
  if (integration.excludePaths.some((prefix) => pathMatchesPrefix(pathname, prefix))) {
    return false;
  }
  return (
    integration.includePaths.length === 0 ||
    integration.includePaths.some((prefix) => pathMatchesPrefix(pathname, prefix))
  );
}

export function emptyConsentCategories(): Record<OptionalConsentCategory, boolean> {
  return { analytics: false, marketing: false, support: false };
}

export function allConsentCategories(): Record<OptionalConsentCategory, boolean> {
  return { analytics: true, marketing: true, support: true };
}

export function serializeConsentChoice(choice: IntegrationConsentChoice): string {
  return encodeURIComponent(JSON.stringify(choice));
}

export function parseConsentChoice(
  value: string | undefined,
  settings: IntegrationConsentSettings,
  now = new Date(),
): IntegrationConsentChoice | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<IntegrationConsentChoice>;
    if (parsed.version !== settings.version || !parsed.updatedAt || !parsed.categories) return null;
    const updatedAt = new Date(parsed.updatedAt);
    if (!Number.isFinite(updatedAt.getTime())) return null;
    if (updatedAt.getTime() > now.getTime() + 300_000) return null;
    if (now.getTime() - updatedAt.getTime() > settings.retentionDays * 86_400_000) return null;
    return {
      version: settings.version,
      updatedAt: updatedAt.toISOString(),
      categories: {
        analytics: parsed.categories.analytics === true,
        marketing: parsed.categories.marketing === true,
        support: parsed.categories.support === true,
      },
    };
  } catch {
    return null;
  }
}

export function consentAllows(
  category: ConsentCategory,
  choice: IntegrationConsentChoice | null,
): boolean {
  return category === "necessary" || choice?.categories[category] === true;
}
