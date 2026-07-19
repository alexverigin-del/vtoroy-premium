#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { launchChromium, playwrightBrowserHint } from "./playwright_browser.mjs";

const baseUrl = (process.env.SMOKE_BASE_URL || "https://isvoi.ru").replace(/\/+$/, "");
const secret = (process.env.BLOG_PREVIEW_SECRET || "").trim();
const postId = (process.env.BLOG_PREVIEW_POST_ID || "").trim();
const version = (process.env.BLOG_PREVIEW_VERSION || "").trim();
const outputDir = path.resolve(
  process.cwd(),
  process.env.BLOG_PREVIEW_OUTPUT_DIR || "output/audit/blog-preview-growth",
);

if (!secret || !/^[0-9a-f-]{36}$/i.test(postId) || !version) {
  throw new Error(
    "BLOG_PREVIEW_SECRET, BLOG_PREVIEW_POST_ID and BLOG_PREVIEW_VERSION are required.",
  );
}

const viewports = [
  { name: "desktop", width: 1366, height: 900 },
  { name: "mobile", width: 390, height: 844, isMobile: true },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const browser = await launchChromium({ headless: true });
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: Boolean(viewport.isMobile),
      });
      const page = await context.newPage();
      const cookieEvents = [];
      page.on("response", async (response) => {
        const setCookie = await response.headerValue("set-cookie");
        if (!setCookie) return;
        cookieEvents.push({
          path: new URL(response.url()).pathname,
          status: response.status(),
          cookies: setCookie
            .split(/,(?=\s*[^;,=]+=[^;,]+)/)
            .map((cookie) => cookie.replace(/=([^;]*)/, "=REDACTED")),
        });
      });
      try {
        const previewUrl = new URL("/api/draft/blog", baseUrl);
        previewUrl.searchParams.set("secret", secret);
        previewUrl.searchParams.set("id", postId);
        previewUrl.searchParams.set("version", version);
        const response = await page.goto(previewUrl.toString(), {
          waitUntil: "networkidle",
          timeout: 45_000,
        });
        assert(response?.ok(), `${viewport.name}: preview request failed`);
        assert(!page.url().includes("secret="), `${viewport.name}: secret remained in final URL`);
        assert(
          (await page.getByText(/Предпросмотр Directus/).count()) === 1,
          `${viewport.name}: Draft Mode banner is missing`,
        );

        const contentImage = page.getByAltText("Проверка дисплея iPhone по всей площади экрана", {
          exact: true,
        });
        const wideImage = page.getByAltText(
          "Осмотр корпуса iPhone и следов предыдущего вмешательства",
          { exact: true },
        );
        for (const [label, image] of [
          ["content", contentImage],
          ["wide", wideImage],
        ]) {
          await image.waitFor({ state: "visible", timeout: 20_000 });
          await image.scrollIntoViewIfNeeded();
          await page.waitForFunction(
            (alt) => document.querySelector(`img[alt="${CSS.escape(alt)}"]`)?.complete === true,
            await image.getAttribute("alt"),
            { timeout: 20_000 },
          );
          const loaded = await image.evaluate(
            (element) => element.naturalWidth > 0 && element.naturalHeight > 0,
          );
          if (!loaded) {
            const src = await image.getAttribute("src");
            const diagnostic = await page.evaluate(async (url) => {
              const response = await fetch(url, { cache: "no-store" });
              return {
                status: response.status,
                contentType: response.headers.get("content-type"),
                body: await response.text(),
              };
            }, src);
            const cookieNames = (await context.cookies()).map((cookie) => cookie.name);
            const queryKeys = [...new URL(src || "", baseUrl).searchParams.keys()];
            throw new Error(
              `${viewport.name}: ${label} preview image did not load (${diagnostic.status} ${diagnostic.contentType} ${diagnostic.body}; cookies=${cookieNames.join(",")}; query=${queryKeys.join(",")}; setCookie=${JSON.stringify(cookieEvents)})`,
            );
          }
        }

        const contentBox = await contentImage.boundingBox();
        const wideBox = await wideImage.boundingBox();
        assert(contentBox && wideBox, `${viewport.name}: preview image box is missing`);
        if (viewport.name === "desktop") {
          assert(
            wideBox.width - contentBox.width >= 150,
            `desktop: wide block must be visibly wider (${wideBox.width} vs ${contentBox.width})`,
          );
        } else {
          assert(
            contentBox.width <= viewport.width && wideBox.width <= viewport.width,
            "mobile: preview images overflow the viewport",
          );
        }

        await page.screenshot({
          path: path.join(outputDir, `${viewport.name}.png`),
          fullPage: true,
        });
        console.log(
          `ok ${viewport.name} content=${Math.round(contentBox.width)}x${Math.round(contentBox.height)} wide=${Math.round(wideBox.width)}x${Math.round(wideBox.height)}`,
        );
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  if (String(error.message || "").includes("Executable doesn't exist")) {
    console.error(playwrightBrowserHint());
  }
  console.error(`Blog preview smoke failed: ${error.message}`);
  process.exit(1);
});
