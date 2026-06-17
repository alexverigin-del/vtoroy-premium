import fs from "node:fs";
import path from "node:path";
import Script from "next/script";
import type { PageSection } from "@vtoroy/shared";
import { getSitePage } from "@/lib/directus";

export const dynamic = "force-dynamic";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function replaceText(markup: string, currentText: string, nextText?: string): string {
  if (!nextText) return markup;
  return markup.replace(currentText, escapeHtml(nextText));
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function applySectionText(markup: string, sections: PageSection[]): string {
  const byKey = new Map(sections.map((section) => [section.sectionKey, section]));
  const hero = byKey.get("hero");
  const finalCta = byKey.get("final_cta");

  let nextMarkup = markup;

  if (hero) {
    nextMarkup = replaceText(
      nextMarkup,
      "ISVOI · клуб разумного владения · Северодвинск",
      hero.eyebrow,
    );
    nextMarkup = replaceText(
      nextMarkup,
      "Хорошие вещи проходят через своих.",
      hero.headline,
    );
    nextMarkup = replaceText(
      nextMarkup,
      "ISVOI — клуб разумного владения. Здесь ценная вещь не теряется после первого владельца, а переходит дальше — с понятной историей, проверенным состоянием и честной ценой выхода. Не рынок, а круг, где вещам доверяют.",
      hero.body,
    );
  }

  if (finalCta) {
    nextMarkup = replaceText(nextMarkup, "Следующий шаг", finalCta.eyebrow);
    nextMarkup = replaceText(nextMarkup, "Войдите в круг ISVOI.", finalCta.headline);
    nextMarkup = replaceText(
      nextMarkup,
      "Оставьте сценарий — найти вещь, передать свою дальше или войти в Club. В ответ вы получите понятные варианты: история, состояние, Passport и цена выхода.",
      finalCta.body,
    );

    const proof = stringList(finalCta.content.proof);
    if (proof[0]) nextMarkup = replaceText(nextMarkup, "варианты под задачу", proof[0]);
    if (proof[1]) nextMarkup = replaceText(nextMarkup, "без агрессивных продаж", proof[1]);
    if (proof[2]) nextMarkup = replaceText(nextMarkup, "сначала проверка — потом решение", proof[2]);
  }

  return nextMarkup;
}

function legacyHomeMarkup(sections: PageSection[] = []): string {
  const candidates = [
    path.join(process.cwd(), "apps", "web", "public", "index.html"),
    path.join(process.cwd(), "public", "index.html"),
    path.join(process.cwd(), "index.html"),
    path.join(process.cwd(), "..", "..", "index.html"),
  ];
  const source = candidates.find((candidate) => fs.existsSync(candidate));
  if (!source) {
    throw new Error("Legacy homepage index.html was not found.");
  }

  const html = fs.readFileSync(source, "utf8");
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? "";

  const normalized = body
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/href="catalog\/index\.html"/g, 'href="/catalog/index.html"')
    .replace(/href="store\/index\.html"/g, 'href="/store/index.html"')
    .replace(/href="passport\/index\.html"/g, 'href="/passport/index.html"')
    .replace(/href="trade\/index\.html"/g, 'href="/trade/index.html"')
    .replace(/href="club\/index\.html"/g, 'href="/club/index.html"')
    .replace(/href="index\.html#/g, 'href="/#')
    .replace(/src="assets\//g, 'src="/assets/')
    .replace(/href="assets\//g, 'href="/assets/');

  return applySectionText(normalized, sections);
}

export default async function HomePage() {
  const page = await getSitePage("home");

  return (
    <>
      <link rel="stylesheet" href="/styles.css?v=20260616a" />
      <div dangerouslySetInnerHTML={{ __html: legacyHomeMarkup(page?.sections) }} />
      <Script src="/data/devices.js?v=20260616a" strategy="afterInteractive" />
      <Script src="/script.js?v=20260617intake" strategy="afterInteractive" />
    </>
  );
}
