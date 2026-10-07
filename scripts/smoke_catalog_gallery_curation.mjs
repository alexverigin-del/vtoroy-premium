#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { launchChromium } from "./playwright_browser.mjs";

const root = path.resolve(process.argv[2] || "");
if (!process.argv[2]) throw Error("Audit directory is required");
const manifest = JSON.parse(await fs.readFile(path.join(root, "gallery-curation.json"), "utf8"));
const state = JSON.parse(await fs.readFile(path.join(root, "curation-state.json"), "utf8"));
if (state.status !== "verified") throw Error("Applied manifest is not verified");
const rows = new Map(state.rows.map((r) => [r.id, r.after]));
const folder = path.join(root, "production");
await fs.mkdir(folder, { recursive: true });
let replacementChecks = 0;
for (const photo of manifest.devices.flatMap((d) => d.photos).filter((p) => p.replacement)) {
  const response = await fetch(`https://api.isvoi.ru/assets/${rows.get(photo.id).image}`, {
    redirect: "error",
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw Error("Public replacement unavailable");
  const bytes = Buffer.from(await response.arrayBuffer());
  const info = await sharp(bytes).metadata();
  if (
    crypto.createHash("sha256").update(bytes).digest("hex") !== photo.replacement.sha256 ||
    info.width !== 2400 ||
    info.height !== 1800
  )
    throw Error("Public replacement differs");
  replacementChecks++;
}
const browser = await launchChromium({ headless: true });
const results = [];
try {
  const onlySku = process.env.GALLERY_SMOKE_SKU;
  for (const viewport of [
    { name: "desktop", width: 1366, height: 900 },
    { name: "mobile", width: 390, height: 844, isMobile: true },
  ]) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: Boolean(viewport.isMobile),
    });
    const page = await context.newPage();
    if (
      page.viewportSize().width !== viewport.width ||
      page.viewportSize().height !== viewport.height
    )
      throw Error("Viewport configuration mismatch");
    for (const device of manifest.devices) {
      if (onlySku && device.sku !== onlySku) continue;
      const response = await page.goto(`https://isvoi.ru/product/${device.id}`, {
        waitUntil: "networkidle",
        timeout: 60000,
      });
      if (device.status !== "published") {
        if (response.status() !== 404) throw Error(`${device.sku}: draft leaked publicly`);
        results.push({ sku: device.sku, viewport: viewport.name, draft_hidden: true });
        continue;
      }
      if (response.status() !== 200)
        throw Error(`${device.sku}: product HTTP ${response.status()}`);
      const necessary = page.getByRole("button", {
        name: /^(Только необходимые|Отклонить необязательные)$/,
      });
      if (await necessary.isVisible()) await necessary.click();
      const gallery = page.locator('[data-component="DeviceGallery"]');
      await gallery.waitFor({ state: "visible" });
      const tabs = gallery.getByRole("tab");
      const labels = await tabs.allTextContents();
      const expected = device.photos.map((p) => p.after.label);
      if (JSON.stringify(labels) !== JSON.stringify(expected))
        throw Error(`${device.sku}: stale or wrong gallery order`);
      let checked = 0;
      for (const [index, photo] of device.photos.entries()) {
        console.log(`checking ${device.sku} ${viewport.name} / ${index + 1}: ${photo.after.label}`);
        await tabs.nth(index).click();
        const fileId = rows.get(photo.id).image;
        try {
          await page.waitForFunction(
            (id) => {
              const img = document.querySelector('[data-component="DeviceGallery"] img');
              return img && img.currentSrc.includes(id) && img.complete && img.naturalWidth > 0;
            },
            fileId,
            { timeout: 60000 },
          );
        } catch (error) {
          console.log(
            JSON.stringify({
              sku: device.sku,
              index,
              expected_file: fileId,
              actual: await gallery.locator("img").evaluate((img) => ({
                src: img.currentSrc,
                complete: img.complete,
                width: img.naturalWidth,
              })),
              selected: await tabs.evaluateAll((elements) =>
                elements
                  .filter((e) => e.getAttribute("aria-selected") === "true")
                  .map((e) => e.textContent),
              ),
            }),
          );
          await page.screenshot({ path: path.join(folder, "failed-gallery.png") });
          throw error;
        }
        await gallery.locator("img").evaluate((img) => img.decode());
        if ((await gallery.locator("figcaption span").first().textContent()) !== photo.after.label)
          throw Error("Caption mismatch");
        checked++;
      }
      if (["т8", "т18", "т34", "т39"].includes(device.sku)) {
        await tabs.nth(0).click();
        await page.waitForFunction(
          (id) =>
            document.querySelector('[data-component="DeviceGallery"] img')?.currentSrc.includes(id),
          device.listing_file,
        );
        await page.mouse.move(viewport.width - 1, 1);
        await tabs.nth(0).waitFor({ state: "visible" });
        await page.waitForFunction(
          () =>
            document
              .querySelector('[data-component="DeviceGallery"] [role="tab"]')
              ?.getAttribute("aria-selected") === "true",
        );
        await page.evaluate(() =>
          Promise.all(
            document
              .getAnimations()
              .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
              .map((a) => a.finished.catch(() => undefined)),
          ),
        );
        await page.evaluate(() =>
          window.scrollBy(
            0,
            document.querySelector('[data-component="DeviceGallery"]').getBoundingClientRect().top -
              100,
          ),
        );
        await page.screenshot({
          path: path.join(folder, `${device.sku.replace("т", "t")}-${viewport.name}.png`),
        });
        await gallery.getByRole("button", { name: /Увеличить фото/ }).click();
        const dialog = page.getByRole("dialog", { name: "Просмотр фотографий устройства" });
        await dialog.waitFor({ state: "visible" });
        for (let i = 0; i < device.photos.length; i++) {
          console.log(`viewer ${device.sku} ${viewport.name} / ${i + 1}`);
          const expectedId = rows.get(device.photos[i].id).image;
          try {
            await page.waitForFunction(
              (id) => {
                const img = document.querySelector('[role="dialog"] img');
                return img && img.currentSrc.includes(id) && img.complete && img.naturalWidth > 0;
              },
              expectedId,
              { timeout: 60000 },
            );
          } catch (error) {
            console.log(
              JSON.stringify({
                sku: device.sku,
                index: i,
                expected_file: expectedId,
                dialog: await dialog.locator("img").evaluateAll((imgs) =>
                  imgs.map((img) => ({
                    src: img.currentSrc,
                    width: img.naturalWidth,
                    complete: img.complete,
                    layer: img.dataset.imageLayer,
                    index: img.dataset.imageIndex,
                  })),
                ),
                status: await dialog.innerText(),
              }),
            );
            await page.screenshot({ path: path.join(folder, "failed-viewer.png") });
            throw error;
          }
          await dialog
            .locator("img")
            .first()
            .evaluate((img) => img.decode());
          if (i + 1 < device.photos.length)
            await dialog.getByRole("button", { name: "Следующее фото", exact: true }).click();
        }
        await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
      }
      results.push({ sku: device.sku, viewport: viewport.name, checked, labels });
      console.log(`${device.sku} ${viewport.name}: ${checked} images OK`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
const result = { replacement_checks: replacementChecks, pages: results.length, results };
result.scope = process.env.GALLERY_SMOKE_SKU || "all";
await fs.writeFile(path.join(folder, "gallery-smoke.json"), JSON.stringify(result, null, 2) + "\n");
console.log(
  JSON.stringify({ replacement_checks: replacementChecks, pages: results.length, passed: true }),
);
