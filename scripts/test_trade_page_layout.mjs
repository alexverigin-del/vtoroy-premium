import assert from "node:assert/strict";
import fs from "node:fs";
import { tradeDeviceGroups } from "../apps/web/lib/trade-device-groups.ts";
import { tradePrimaryCtaForRuntime } from "../apps/web/lib/marketing-cta.ts";
import { validatePatch } from "./lib/directus-content-patch.mjs";

const read = (path) => fs.readFileSync(path, "utf8");
const sections = JSON.parse(read("apps/web/data/marketing-pages.json")).trade.sections;
assert.deepEqual(
  [...sections].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.sectionKey),
  [
    "trade_hero",
    "trade_calculator_intro",
    "trade_paths",
    "trade_steps",
    "trade_live_example",
    "trade_compare",
    "final_cta",
  ],
);
assert.equal(
  sections.find((s) => s.sectionKey === "trade_calculator_intro").headline,
  "Оцените свой смартфон онлайн",
);
assert(!JSON.stringify(sections).includes("42 000"));
assert.equal(sections.find((s) => s.sectionKey === "trade_hero").content.highlights.length, 0);
const items = sections.find((s) => s.sectionKey === "trade_paths").content.items;
for (const item of items) {
  assert.equal(tradePrimaryCtaForRuntime(item.url, false), "#final");
  assert.equal(
    tradePrimaryCtaForRuntime(item.url, true),
    item.intent === "commission_consultation" ? "#final" : "#trade-calculator",
  );
}
const devices = [
  { id: "a128", deviceModelId: "a", modelSlug: "iphone-16-pro", modelName: "iPhone 16 Pro" },
  { id: "a256", deviceModelId: "a", modelSlug: "iphone-16-pro", modelName: "iPhone 16 Pro" },
  {
    id: "s",
    deviceModelId: "s",
    modelSlug: "samsung-galaxy-s24-ultra",
    modelName: "Samsung Galaxy S24 Ultra",
  },
];
assert.deepEqual(tradeDeviceGroups(devices), [
  { brand: "Apple", models: [{ id: "a", name: "iPhone 16 Pro" }] },
  { brand: "Samsung", models: [{ id: "s", name: "Samsung Galaxy S24 Ultra" }] },
]);
assert.deepEqual(tradeDeviceGroups([]), []);
const paths = fs
  .readdirSync("directus/content-patches")
  .filter((p) => p.startsWith("2026-08-31-") && p.endsWith("-ux.patch.json"));
assert.equal(paths.length, 7);
for (const file of paths) {
  const p = validatePatch(JSON.parse(read(`directus/content-patches/${file}`)));
  assert.equal(p.collection, "page_sections");
  assert.equal(p.selector.page, "48562035-16be-4cc1-88b8-ba9b66558fcc");
  assert(sections.some((s) => s.sectionKey === p.selector.section_key));
  assert(!Object.keys(p.changes).some((k) => /consent|privacy|legal|pricing|stock|offer/.test(k)));
  assert(!p.changes.content, "patch must preserve unrelated CMS JSON fields");
}
const wizard = read("apps/web/components/TradeInWizard.tsx");
const contentAudit = read("scripts/audit_directus_page_sections_contract_sql.mjs");
for (const key of ["details_label", "formula", "intent"])
  assert(contentAudit.includes(`('${key}')`), `CMS audit must recognize ${key}`);
assert(!wizard.includes('value="Apple"'));
assert(wizard.includes("previousStep.current === step"));
assert(wizard.includes("prefers-reduced-motion: reduce"));
assert(wizard.includes("<h3"));
assert(wizard.includes("if (!restored) return"));
console.log(
  "Trade page layout: order, CMS patch safety, CTA fallback, model groups, focus/restore contracts OK",
);
