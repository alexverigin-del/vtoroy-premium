// Real components, loopback-only data. Next routing/image transport are adapters;
// compiled Next route/SEO smokes cover the framework separately.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import { launchChromium } from "./playwright_browser.mjs";
const require = createRequire(import.meta.url);
const { plugins, themeExtend } = require("../tailwind.shared.cjs");
const output = "output/playwright/impeccable";
await fs.mkdir(output, { recursive: true });
const mocks = {
  "next/link":
    'import React from "react"; export default function Link({children,...props}) { return React.createElement("a",props,children); }',
  "next/image":
    'import React from "react"; export default function Image({fill,priority,unoptimized,loader,...props}) {return React.createElement("img",{...props,style:fill?{position:"absolute",inset:0,width:"100%",height:"100%"}:props.style});}',
  "next/navigation":
    "export const usePathname=()=>location.pathname; export const useSearchParams=()=>new URLSearchParams(location.search); export const useRouter=()=>({push:(url)=>location.assign(url),refresh:()=>{}});",
  "next/dynamic":
    'import React,{lazy,Suspense} from "react"; export default function dynamic(load) { const Component=lazy(()=>load().then(value=>({default:value.default||value}))); return props=>React.createElement(Suspense,{fallback:null},React.createElement(Component,props)); }',
};
const bundled = await build({
  entryPoints: ["scripts/fixtures/impeccable-ui.tsx"],
  bundle: true,
  write: false,
  platform: "browser",
  jsx: "automatic",
  define: { "process.env": "{}", "process.env.NODE_ENV": '"production"' },
  alias: { "@": path.resolve("apps/web") },
  plugins: [
    {
      name: "next-fixture",
      setup(build) {
        build.onResolve({ filter: /^next\/(link|image|navigation|dynamic)$/ }, (args) => ({
          path: args.path,
          namespace: "fixture",
        }));
        build.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
          contents: mocks[args.path],
          resolveDir: process.cwd(),
        }));
      },
    },
  ],
});
const css = await postcss([
  tailwindcss({
    content: ["apps/web/**/*.{ts,tsx}", "scripts/fixtures/impeccable-ui.tsx"],
    theme: { extend: themeExtend },
    plugins,
  }),
]).process(await fs.readFile("apps/web/app/globals.css", "utf8"), { from: undefined });
const photo = await fs.readFile("apps/web/public/assets/critical-home-hero.webp");
const posts = [];
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    posts.push(JSON.parse(body));
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (url.pathname === "/fixture.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(bundled.outputFiles[0].contents);
  } else if (url.pathname === "/fixture.css") {
    res.setHeader("Content-Type", "text/css");
    res.end(css.css);
  } else if (url.pathname === "/fixture.webp") {
    res.setHeader("Content-Type", "image/webp");
    res.end(photo);
  } else if (url.pathname.startsWith("/api/")) {
    res.setHeader("Content-Type", "application/json");
    res.end("{}");
  } else if (url.pathname === "/missing.png") {
    res.writeHead(404);
    res.end();
  } else {
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<!doctype html><html lang="ru"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>',
    );
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await launchChromium({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error(error.stack);
  });
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === base ? route.continue() : route.abort(),
  );
  for (const width of [320, 390, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const variant of ["", "?caption", "?max&caption&long&brand", "?max", "?max&mark"]) {
      await page.goto(base + "/catalog" + variant);
      await page.locator("h1").waitFor();
      await page.waitForTimeout(150);
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `Overflow at ${width}${variant}`,
      );
      const overlap = await page.evaluate(() => {
        const logo = document.querySelector("header a").getBoundingClientRect();
        const button = document
          .querySelector("header button[aria-controls]")
          .getBoundingClientRect();
        return button.width > 0 && logo.right > button.left;
      });
      assert(!overlap, `Header overlap ${width}${variant}`);
      if (variant.includes("caption")) {
        const lockup = await page.evaluate(() => {
          const image = document.querySelector("header a span img").getBoundingClientRect();
          const caption = document.querySelector("header a span span");
          const captionBox = caption.getBoundingClientRect();
          const style = getComputedStyle(caption);
          return {
            captionLeft: captionBox.left,
            imageRight: image.right,
            fontSize: style.fontSize,
            textTransform: style.textTransform,
          };
        });
        assert(
          lockup.captionLeft >= lockup.imageRight,
          `Logo caption is not to the right of the image at ${width}${variant}`,
        );
        assert.equal(lockup.fontSize, "9px");
        assert.equal(lockup.textTransform, "uppercase");
        if (variant === "?caption" && (width === 390 || width === 1440)) {
          await page.locator("header").screenshot({
            path: `${output}/logo-caption-${width}.png`,
          });
        }
        if (variant === "?max&caption&long&brand" && width === 320) {
          await page.locator("header").screenshot({
            path: `${output}/logo-caption-max-320.png`,
          });
        }
      }
      if (width === 390 && !variant) {
        const price = await page
          .locator('[data-component="ProductCard"] p')
          .filter({ hasText: "79 900" })
          .boundingBox();
        assert(
          price.y + price.height <= 844,
          `First card price below viewport: ${price.y + price.height}`,
        );
        await page.screenshot({ path: output + "/catalog-390.png", fullPage: true });
      }
    }
    await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
    await page.waitForTimeout(200);
    if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))) {
      console.log(
        await page.evaluate(() =>
          Array.from(document.querySelectorAll("body *"))
            .filter(
              (el) =>
                getComputedStyle(el).visibility !== "hidden" &&
                el.getBoundingClientRect().right > innerWidth,
            )
            .map((el) => ({
              tag: el.tagName,
              cls: el.className,
              text: el.textContent.slice(0, 60),
              right: el.getBoundingClientRect().right,
            }))
            .slice(-12),
        ),
      );
      await page.screenshot({ path: output + "/overflow.png", fullPage: true });
    }
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `200% text overflow ${width}`,
    );
    console.log(`Header variants, catalog and 200% text: ${width}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/catalog?q=iPhone");
  const menu = page.locator("header button[aria-controls]");
  await menu.click();
  assert.equal(await menu.getAttribute("aria-expanded"), "true");
  await page.keyboard.press("Escape");
  assert.equal(await menu.getAttribute("aria-expanded"), "false");
  assert(await menu.evaluate((el) => el === document.activeElement));
  const trigger = page.getByRole("button", { name: "Фильтры", exact: true });
  for (let i = 0; i < 2; i++) {
    await trigger.click();
    await page.locator("dialog[open]").waitFor();
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflow), "hidden");
    await page.keyboard.press("Shift+Tab");
    assert(
      await page.evaluate(() => document.querySelector("dialog").contains(document.activeElement)),
    );
    assert.equal(await page.locator('dialog input[name="q"]').inputValue(), "iPhone");
    await page.keyboard.press("Escape");
    await page.locator("dialog").waitFor({ state: "detached" });
    assert(await trigger.evaluate((el) => el === document.activeElement));
  }
  await trigger.click();
  await page.setViewportSize({ width: 1024, height: 844 });
  await page.locator("dialog").waitFor({ state: "detached" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(base + "/product/fixture?cookies");
  await page.locator("[data-consent-banner]").waitFor();
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Consent banner at 200% must not overflow",
  );
  await page.getByRole("button", { name: "Настроить", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  if (
    !(await page
      .getByRole("dialog")
      .evaluate((element) => element.scrollWidth <= element.clientWidth))
  ) {
    console.log(
      await page.getByRole("dialog").evaluate((dialog) =>
        Array.from(dialog.querySelectorAll("*"))
          .filter(
            (element) =>
              element.getBoundingClientRect().right > dialog.getBoundingClientRect().right,
          )
          .map((element) => ({
            tag: element.tagName,
            text: element.textContent.slice(0, 80),
            className: element.className,
            right: element.getBoundingClientRect().right,
          })),
      ),
    );
    await page.screenshot({ path: output + "/consent-overflow.png" });
  }
  assert(
    await page
      .getByRole("dialog")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
    "Consent settings at 200% must not overflow",
  );
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const status of ["", "?sold", "?cookies"]) {
    await page.goto(base + "/product/fixture" + status);
    await page.locator("#product-lead-form").waitFor();
    assert.equal(await page.locator("#product-lead-form").count(), 1);
    await page.evaluate(() => window.scrollTo(0, 700));
    const bar = page.getByRole("navigation", { name: "Действия по товару" });
    if (status.includes("cookies")) {
      await page.locator("[data-consent-banner]").waitFor();
      assert.equal(await bar.count(), 0);
      await page.getByRole("button", { name: "Только необходимые", exact: true }).click();
    }
    await bar.waitFor();
    assert((await bar.textContent()).includes(status.includes("sold") ? "Продано" : "79 900"));
    await bar.getByRole("link").click();
    await bar.waitFor({ state: "detached" });
    await page.screenshot({
      path: output + `/product-form${status.includes("sold") ? "-sold" : ""}.png`,
    });
  }
  assert.equal(errors.length, 0, errors.join("\n"));
  for (const status of ["", "?sold"]) {
    await page.goto(base + "/product/fixture" + status);
    await page.locator('#product-lead-form input[name="contact"]').fill("fixture@example.test");
    await page.locator('#product-lead-form button[type="submit"]').click();
    await page
      .getByText(
        status
          ? "Заявка принята. Мы предложим похожую вещь из круга или сообщим, когда она появится."
          : "Заявка принята. Мы свяжемся и подтвердим наличие.",
        { exact: true },
      )
      .waitFor();
    assert.equal(posts.at(-1).kind, status ? "selection" : "purchase");
    assert.equal(posts.at(-1).product_id, "fixture");
  }
  await page.goto(base + "/product/fixture");
  await page.getByRole("combobox", { name: "Город получения" }).selectOption("moscow");
  assert(
    (await page.locator("#product-purchase-summary").textContent()).includes(
      "Москва · Нет в наличии",
    ),
  );
  await page.evaluate(() => scrollTo(0, 700));
  const mobileBar = page.getByRole("navigation", { name: "Действия по товару" });
  await mobileBar.waitFor();
  assert((await mobileBar.textContent()).includes("Москва · Нет в наличии"));
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Увеличить фото: Фото", exact: true }).click();
    const viewer = page.getByRole("dialog", { name: "Просмотр фотографий устройства" });
    await viewer.waitFor();
    assert.equal(await mobileBar.count(), 0);
    await viewer.getByRole("button", { name: "Увеличить", exact: true }).click();
    await page.keyboard.press("Escape");
    await viewer.waitFor({ state: "detached" });
  }
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Открыть сертификат", exact: true }).click();
    await page.locator("dialog[open]").waitFor();
    await page.keyboard.press("Escape");
    await page.locator("dialog").waitFor({ state: "detached" });
    assert(
      await page
        .getByRole("button", { name: "Открыть сертификат", exact: true })
        .evaluate((el) => el === document.activeElement),
    );
  }
  await page.goto(base + "/product/fixture?error");
  await page.getByRole("button", { name: "Открыть сертификат", exact: true }).click();
  await page.getByRole("alert").waitFor();
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await page.getByRole("alert").waitFor();
  await page.keyboard.press("Escape");
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "Purchase/sold writes stayed in fixtures; city parity, photo zoom, certificate reopen and image retry passed.",
  );
  console.log(
    "Native filter focus/Escape/reopen/desktop close; product sticky/sold/cookies/reduced motion passed.",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
