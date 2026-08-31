// Keep the Tailwind conflict resolver on the server. Client variants must be
// mutually exclusive; test their possible class sets against the old resolver.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

const web = path.resolve("apps/web");
const files = fs
  .readdirSync(web, { recursive: true })
  .filter((file) => /^(app|components|lib)[\\/].*\.tsx?$/.test(file))
  .map((file) => path.join(web, file));
const sources = new Map(
  files.map((file) => [
    file,
    ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true),
  ]),
);
const clients = new Set();

function resolveImport(file, specifier) {
  const base = specifier.startsWith("@/")
    ? path.join(web, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(file), specifier)
      : null;
  if (!base) return null;
  return [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ].find((candidate) => sources.has(candidate));
}

function visitClient(file) {
  if (clients.has(file)) return;
  clients.add(file);
  for (const node of sources.get(file).statements) {
    if (!ts.isImportDeclaration(node) || node.importClause?.isTypeOnly) continue;
    const bindings = node.importClause?.namedBindings;
    if (
      bindings &&
      ts.isNamedImports(bindings) &&
      !node.importClause.name &&
      bindings.elements.every((element) => element.isTypeOnly)
    )
      continue;
    const name = node.moduleSpecifier.text;
    assert.notEqual(name, "tailwind-merge", `${file}: runtime conflict map in client graph`);
    const dependency = resolveImport(file, name);
    assert.notEqual(
      dependency,
      path.join(web, "lib/cn.ts"),
      `${file}: server cn imported by client`,
    );
    if (dependency) visitClient(dependency);
  }
}

for (const [file, source] of sources) {
  if (
    source.statements.some(
      (node) =>
        ts.isExpressionStatement(node) &&
        ts.isStringLiteral(node.expression) &&
        node.expression.text === "use client",
    )
  )
    visitClient(file);
}

function walk(node, callback) {
  callback(node);
  node.forEachChild((child) => walk(child, callback));
}

function initializer(file, name) {
  let found;
  walk(sources.get(file), (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name)
      found = { file, node: node.initializer };
  });
  if (found) return found;
  for (const declaration of sources.get(file).statements) {
    if (!ts.isImportDeclaration(declaration)) continue;
    const bindings = declaration.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    const binding = bindings.elements.find((element) => element.name.text === name);
    const dependency = resolveImport(file, declaration.moduleSpecifier.text);
    if (binding && dependency) return initializer(dependency, binding.propertyName?.text ?? name);
  }
  throw Error(`${file}: unresolved class constant ${name}`);
}

function unwrap(node) {
  while (ts.isAsExpression(node) || ts.isParenthesizedExpression(node)) node = node.expression;
  return node;
}

function combinations(args, file) {
  return args.reduce(
    (sets, arg) => sets.flatMap((set) => variants(arg, file).map((value) => [...set, value])),
    [[]],
  );
}

function variants(expression, file) {
  const node = unwrap(expression);
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isConditionalExpression(node))
    return [...variants(node.whenTrue, file), ...variants(node.whenFalse, file)];
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
  )
    return ["", ...variants(node.right, file)];
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "cn"
  )
    return combinations(node.arguments, file).map((args) => clsx(...args));
  if (ts.isIdentifier(node)) {
    // Public overrides use CSS component defaults (covered by browser CSS parity tests).
    if (
      node.text === "className" &&
      ["RichText.tsx", "HomeSectionIntro.tsx"].includes(path.basename(file))
    )
      return [""];
    const found = initializer(file, node.text);
    return variants(found.node, found.file);
  }
  if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression)) {
    const found = initializer(file, node.expression.text);
    const object = unwrap(found.node);
    assert(ts.isObjectLiteralExpression(object));
    return object.properties.flatMap((property) => variants(property.initializer, found.file));
  }
  throw Error(`${file}: untested class expression ${node.getText()}`);
}

let calls = 0;
let cases = 0;
for (const file of clients) {
  walk(sources.get(file), (node) => {
    if (
      !ts.isCallExpression(node) ||
      !ts.isIdentifier(node.expression) ||
      node.expression.text !== "cn"
    )
      return;
    calls++;
    for (const args of combinations(node.arguments, file)) {
      const classes = clsx(...args);
      const tokens = (value) => [...new Set(value.split(/\s+/).filter(Boolean))].sort();
      // tailwind-merge 3 treats bare `outline` as width (Tailwind 4), but this
      // project uses Tailwind 3: it sets outline-style and must not be dropped.
      const merged = twMerge(classes);
      const expected =
        classes.includes("focus-visible:outline ") &&
        !merged.split(" ").includes("focus-visible:outline")
          ? `${merged} focus-visible:outline`
          : merged;
      assert.deepEqual(
        tokens(classes),
        tokens(expected),
        `${path.relative(web, file)}: competing utilities in ${classes}`,
      );
      cases++;
    }
  });
}
assert(calls >= 20, "Client composition coverage unexpectedly disappeared");
console.log(
  `Client classes: ${clients.size} modules checked, ${calls} compositions / ${cases} variants, no client conflict resolver`,
);
