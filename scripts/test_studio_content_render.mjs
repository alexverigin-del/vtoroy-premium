#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { runInThisContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseDocument, DomUtils } from "htmlparser2";
import ts from "typescript";
import { mergeSectionEditorContent } from "../apps/web/lib/section-editor-content.ts";

// Transpile TSX in memory; render the real components and dependencies without
// a Next server, production credentials, network requests or mocked list logic.
const modules = new Map();
function loadTsx(filename) {
  if (modules.has(filename)) return modules.get(filename).exports;
  const module = { exports: {} };
  modules.set(filename, module);
  const nativeRequire = createRequire(filename);
  const localRequire = (id) => {
    if (id.startsWith(".")) {
      const base = path.resolve(path.dirname(filename), id);
      const source = [base, `${base}.ts`, `${base}.tsx`].find(
        (candidate) => /\.tsx?$/.test(candidate) && fs.existsSync(candidate),
      );
      if (source) return loadTsx(source);
    }
    return nativeRequire(id);
  };
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  runInThisContext(`(function(require,module,exports){${outputText}\n})`, { filename })(
    localRequire,
    module,
    module.exports,
  );
  return module.exports;
}

const { FinalCtaSection } = loadTsx(path.resolve("apps/web/components/FinalCtaSection.tsx"));
const { StorePreviewSection } = loadTsx(
  path.resolve("apps/web/components/StorePreviewSection.tsx"),
);
const section = {
  id: "fixture",
  headline: "Section heading",
  body: "Section introduction",
  image: "/fixture-store.jpg",
  primaryCtaLabel: "Visit store",
  primaryCtaUrl: "/belgorod",
};
const legacy = {
  proof: ["Price & condition", "Passport <details>"],
  steps: [
    { title: "Choose", text: "First & second" },
    { title: "Inspect", text: "Third <fourth>" },
  ],
  note: "Preserved note",
};
const legacyBefore = structuredClone(legacy);
function render(component, content, source) {
  return parseDocument(
    renderToStaticMarkup(createElement(component, { section: { ...section, content }, source })),
  );
}
const elements = (dom, tag) => DomUtils.getElementsByTagName(tag, dom.children, true);
const text = (dom) => DomUtils.textContent(dom);
const outer = (dom, tag) => elements(dom, tag).map((node) => DomUtils.getOuterHTML(node));

const cases = [
  {
    name: "homepage",
    component: FinalCtaSection,
    source: "home_final_cta",
    key: "proof",
    field: "editor_proof",
    tag: "ul",
    fallbackCount: 3,
  },
  {
    name: "trade",
    component: FinalCtaSection,
    source: "trade_page",
    key: "proof",
    field: "editor_proof",
    tag: "ul",
    fallbackCount: 3,
  },
  {
    name: "store",
    component: StorePreviewSection,
    key: "steps",
    field: "editor_steps",
    tag: "ol",
    fallbackCount: 4,
  },
];
let assertions = 0;
for (const fixture of cases) {
  const { component, source, key, field, tag, fallbackCount } = fixture;
  const filled = render(component, legacy, source);
  assert.equal(elements(filled, "li").length, 2);
  if (key === "proof") {
    assert.equal(elements(filled, "form").length, 1);
    assert.ok(elements(filled, "input").some((node) => node.attribs.name === "contact"));
    assert.ok(elements(filled, "button").some((node) => node.attribs.type === "submit"));
  } else {
    assert.equal(elements(filled, "img").length, 1);
    assert.ok(elements(filled, "a").some((node) => node.attribs.href === section.primaryCtaUrl));
  }
  for (const [index, item] of legacy[key].entries()) {
    const expected = typeof item === "string" ? item : item.title + item.text;
    assert.ok(text(elements(filled, "li")[index]).endsWith(expected));
  }
  // Legacy rows without migrated fields retain their existing content.
  for (const row of [{}, { [field]: null }]) {
    assert.deepEqual(
      outer(render(component, mergeSectionEditorContent(row, legacy), source), tag),
      outer(filled, tag),
    );
  }
  const native = key === "proof" ? legacy.proof.map((item) => ({ text: item })) : legacy.steps;
  assert.deepEqual(
    outer(render(component, mergeSectionEditorContent({ [field]: native }, {}), source), tag),
    outer(filled, tag),
  );

  for (const content of [
    { ...legacy, [key]: [] },
    mergeSectionEditorContent({ [field]: [] }, legacy),
    mergeSectionEditorContent({ [field]: "invalid" }, legacy),
    { ...legacy, [key]: [null, false, 42, {}] },
    { ...legacy, [key]: "invalid" },
    { ...legacy, [key]: key === "proof" ? ["", "   "] : [{ title: "", text: "" }] },
  ]) {
    const cleared = render(component, content, source);
    assert.equal(elements(cleared, "li").length, 0, `${fixture.name}: cleared items`);
    assert.equal(elements(cleared, tag).length, 0, `${fixture.name}: empty list surface`);
    assert.ok(text(cleared).includes(section.headline));
    assert.ok(text(cleared).includes(section.body));
    assert.deepEqual(outer(cleared, "form"), outer(filled, "form"));
    assert.deepEqual(outer(cleared, "img"), outer(filled, "img"));
    assert.deepEqual(outer(cleared, "a"), outer(filled, "a"));
    const form = elements(cleared, "form")[0];
    if (form) {
      assert.equal(
        form.parent.children.filter((node) => node.type === "tag").length,
        1,
        `${fixture.name}: no empty proof column beside the form`,
      );
    }
    if (key === "steps") assert.ok(text(cleared).includes(legacy.note));
    assertions++;
  }
  for (const content of [{}, { [key]: null }]) {
    assert.equal(elements(render(component, content, source), "li").length, fallbackCount);
  }
  const mixed = render(component, { [key]: [null, legacy[key][1], {}] }, source);
  assert.equal(elements(mixed, "li").length, 1);
  console.log(`${fixture.name}: cleared/filled/legacy/malformed HTML passed`);
}
assert.deepEqual(legacy, legacyBefore, "Rendering must not mutate CMS content");
console.log(
  `Studio content HTML: ${assertions} deletion cases passed; forms, images and links preserved.`,
);
