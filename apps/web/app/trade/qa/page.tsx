import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/SiteShell";
import { TradeInWizard } from "@/components/TradeInWizard";
import { getNavigationItems, getSiteSettings } from "@/lib/directus";
import { siteChrome } from "@/lib/site-content";
import { TRADE_QA_COOKIE, tradeQaEnabled, validateTradeQaSession } from "@/lib/trade-qa";
import { getTradePublicConfig } from "@/lib/trade-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trade-in QA — I СВОИ",
  description: "Закрытый контур приёмки Trade-in.",
  robots: { index: false, follow: false, nocache: true },
};

const qaSubmitClass =
  "focus-ring mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-pill bg-action-blue px-6 py-3 text-base font-semibold text-white transition hover:bg-action-hover";

export default async function TradeQaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!tradeQaEnabled()) notFound();
  const query = await searchParams;
  const cookieStore = await cookies();
  const authenticated = validateTradeQaSession(cookieStore.get(TRADE_QA_COOKIE)?.value);
  const [settings, navigation] = await Promise.all([getSiteSettings(), getNavigationItems()]);
  const chrome = siteChrome(settings, navigation);

  if (!authenticated) {
    return (
      <SiteShell settings={chrome.settings} navigation={chrome.navigation}>
        <main id="top">
          <section className="bg-frost px-6 py-16 md:py-24">
            <div className="mx-auto max-w-overlay rounded-card border border-hairline bg-white p-6 shadow-soft md:p-8">
              <p className="text-xs font-semibold uppercase tracking-label text-muted">
                Trade-in QA
              </p>
              <h1 className="mt-3 text-3xl font-bold leading-tight text-carbon">
                Внутренняя приёмка
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted">
                Введите отдельный QA-код. Клиентский калькулятор останется выключенным.
              </p>
              <form className="mt-6" method="post" action="/api/trade/config">
                <label className="block">
                  <span className="text-xs font-medium text-muted">Код доступа</span>
                  <input
                    type="password"
                    name="secret"
                    autoComplete="current-password"
                    required
                    minLength={32}
                    className="focus-ring mt-2 h-12 w-full rounded-input border border-hairline bg-white px-3 text-base text-carbon"
                  />
                </label>
                {query.error ? (
                  <p className="mt-3 text-sm text-red-600" role="alert">
                    {query.error === "rate_limited"
                      ? "Слишком много попыток. Попробуйте позже."
                      : "Неверный код доступа."}
                  </p>
                ) : null}
                <button type="submit" className={qaSubmitClass}>
                  Открыть QA
                </button>
              </form>
            </div>
          </section>
        </main>
      </SiteShell>
    );
  }

  const config = await getTradePublicConfig({ allowDraft: true });
  return (
    <SiteShell settings={chrome.settings} navigation={chrome.navigation}>
      <main id="top" className="bg-white">
        <div className="border-b border-warning/30 bg-warning/10 px-6 py-3">
          <div className="mx-auto flex max-w-form items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-label text-carbon">QA · Draft</p>
              <p className="mt-1 text-xs leading-5 text-muted">
                Тестовые оценки и заявки отделены от клиентских данных.
              </p>
            </div>
            <form method="post" action="/api/trade/config">
              <input type="hidden" name="intent" value="logout" />
              <button
                type="submit"
                className="focus-ring rounded-pill border border-hairline bg-white px-4 py-2 text-sm font-semibold text-carbon"
              >
                Завершить QA
              </button>
            </form>
          </div>
        </div>
        {config.active ? (
          <TradeInWizard config={config} mode="qa" />
        ) : (
          <section className="px-6 py-20 text-center">
            <h1 className="text-3xl font-bold text-carbon">Draft пока недоступен</h1>
            <p className="mx-auto mt-3 max-w-copy text-sm leading-6 text-muted">
              Проверьте активную draft-версию, 19 конфигураций и 21 правило в Directus.
            </p>
          </section>
        )}
      </main>
    </SiteShell>
  );
}
