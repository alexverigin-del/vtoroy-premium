import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/SiteShell";
import { notFoundPrimaryLinkClass, notFoundSecondaryLinkClass } from "@/components/ui-classes";
import { getNavigationItems, getSiteSettings } from "@/lib/directus";
import { siteChrome } from "@/lib/site-content";

export const metadata: Metadata = {
  title: "Страница не найдена — ISVOI",
  description: "Страница не найдена. Вернитесь в Store ISVOI или на главную страницу.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function NotFoundPage() {
  const [settings, navigation] = await Promise.all([getSiteSettings(), getNavigationItems()]);
  const chrome = siteChrome(settings, navigation);

  return (
    <SiteShell settings={chrome.settings} navigation={chrome.navigation}>
      <main id="top" className="bg-frost">
        <section className="mx-auto grid min-h-section-visual max-w-page content-center px-4 py-20 md:px-6">
          <div className="mx-auto max-w-copy-wide text-center">
            <p className="text-sm font-semibold leading-snug text-link-blue">404</p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-normal text-carbon md:text-6xl">
              Такой вещи в кругу нет.
            </h1>
            <p className="mx-auto mt-5 max-w-body-copy text-copy leading-relaxed text-graphite md:text-lg">
              Страница могла переехать, карточку могли снять с витрины или ссылка оказалась старой.
              Вернитесь в Store: там видны вещи, которые сейчас проходят через ISVOI.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/catalog" className={notFoundPrimaryLinkClass}>
                Смотреть Store
              </Link>
              <Link href="/" className={notFoundSecondaryLinkClass}>
                На главную
              </Link>
            </div>
          </div>
        </section>
      </main>
    </SiteShell>
  );
}
