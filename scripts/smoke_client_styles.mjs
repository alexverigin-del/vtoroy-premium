// Browser parity for component defaults moved from JS to CSS. No external data.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import { twMerge } from "tailwind-merge";
import { launchChromium } from "./playwright_browser.mjs";

const require = createRequire(import.meta.url);
const { plugins, themeExtend } = require("../tailwind.shared.cjs");
// Frozen pre-optimization defaults: changing them requires a deliberate visual review.
const legacyRichText =
  "[&_a]:font-medium [&_a]:text-link-blue [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:my-8 [&_blockquote]:border-l-2 [&_blockquote]:border-link-blue [&_blockquote]:pl-6 [&_blockquote]:text-xl [&_blockquote]:leading-relaxed [&_h2]:mt-12 [&_h2]:text-3xl [&_h2]:font-semibold [&_h2]:leading-tight [&_h3]:mt-8 [&_h3]:text-2xl [&_h3]:font-semibold [&_h3]:leading-tight [&_li]:pl-1 [&_ol]:mt-5 [&_ol]:list-decimal [&_ol]:pl-6 [&_p+p]:mt-5 [&_strong]:font-semibold [&_ul]:mt-5 [&_ul]:list-disc [&_ul]:pl-6";
const legacyIntro = "mx-auto max-w-copy text-center";
const content =
  '<h2>Заголовок раздела</h2><p>Описание и <a href="#">ссылка</a>.</p><p>Следующий абзац <strong>с акцентом</strong>.</p><h3>Подзаголовок</h3><blockquote>Условия оценки</blockquote><ul><li>Первый пункт</li></ul><ol><li>Второй пункт</li></ol>';
const cases = [
  {
    name: "rich-default",
    old: legacyRichText,
    next: "rich-text",
    extra: "text-base text-graphite leading-relaxed",
  },
  {
    name: "rich-override",
    old: legacyRichText,
    next: "rich-text",
    extra: "[&_a]:text-red-600 [&_h2]:mt-4 [&_p+p]:mt-2 [&_blockquote]:pl-2 [&_ul]:list-none",
  },
  {
    name: "rich-responsive",
    old: legacyRichText,
    next: "rich-text",
    extra: "text-sm md:text-copy [&_h2]:text-xl md:[&_h2]:text-4xl",
  },
  { name: "intro-default", old: legacyIntro, next: "home-intro-centered", extra: "" },
  {
    name: "intro-override",
    old: legacyIntro,
    next: "home-intro-centered",
    extra: "mx-0 max-w-form text-left",
  },
  {
    name: "intro-responsive",
    old: legacyIntro,
    next: "home-intro-centered",
    extra: "md:max-w-copy-wide md:text-left",
  },
];
const markup = cases
  .map(
    (item) => `<section data-case="${item.name}">
  <div data-version="before" class="${twMerge(item.old, item.extra)}">${content}</div>
  <div data-version="after" class="${item.next} ${item.extra}">${content}</div>
</section>`,
  )
  .join("");
const focusClasses =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const html = `${markup}<button class="${focusClasses}" id="focus-test">Фото</button>
  <div class="rich-text text-copy text-graphite" id="brand-copy">Фирменный размер текста</div>`;
const result = await postcss([
  tailwindcss({
    content: [{ raw: html, extension: "html" }],
    theme: { extend: themeExtend },
    plugins,
  }),
]).process(fs.readFileSync("apps/web/app/globals.css", "utf8"), { from: undefined });

const browser = await launchChromium({ headless: true });
try {
  const page = await browser.newPage();
  await page.route("**/*", (route) => route.abort());
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(`<style>${result.css}</style>${html}`);
    for (const item of cases) {
      const styles = await page.locator(`[data-case="${item.name}"]`).evaluate((root) => {
        const snapshot = (selector) => {
          const element = root.querySelector(selector);
          return [element, ...element.querySelectorAll("*")].map((node) => {
            const computed = getComputedStyle(node);
            return Object.fromEntries(
              [...computed].map((key) => [key, computed.getPropertyValue(key)]),
            );
          });
        };
        return {
          before: snapshot('[data-version="before"]'),
          after: snapshot('[data-version="after"]'),
        };
      });
      const differences = styles.after.flatMap((after, index) =>
        Object.keys(after)
          .filter((key) => after[key] !== styles.before[index][key])
          .map((key) => `${index} ${key}: ${styles.before[index][key]} → ${after[key]}`),
      );
      assert.deepEqual(differences, [], `${width}px ${item.name}: computed styles changed`);
    }
    await page.locator("#focus-test").focus();
    const outline = await page.locator("#focus-test").evaluate((element) => ({
      style: getComputedStyle(element).outlineStyle,
      width: getComputedStyle(element).outlineWidth,
    }));
    assert.deepEqual(
      outline,
      { style: "solid", width: "2px" },
      "Tailwind 3 focus outline must survive composition",
    );
    // The old generic merger mistook custom text-copy (font-size) for a color
    // and silently dropped it before text-graphite. Preserve both design tokens.
    const brandCopy = await page.locator("#brand-copy").evaluate((element) => ({
      size: getComputedStyle(element).fontSize,
      color: getComputedStyle(element).color,
    }));
    assert.deepEqual(brandCopy, { size: "17px", color: "rgb(71, 71, 71)" });
    console.log(
      `${width}px: all 6 component/default/override comparisons equal; focus outline visible`,
    );
  }
} finally {
  await browser.close();
}
