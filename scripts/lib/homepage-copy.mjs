import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const canonicalPath = path.join(root, "apps", "web", "data", "homepage-copy.json");

function plainText(value) {
  return String(value)
    .replace(/<\/p>/giu, " ")
    .replace(/<br\s*\/?>/giu, " ")
    .replace(/<[^>]+>/gu, "")
    .replace(/[*#_`]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .replaceAll("Белгород", "Северодвинск");
}

function canonicalPublicStrings(copy) {
  const values = [
    ...Object.values(copy.footer),
    ...copy.faq_items.flatMap((item) => [item.question, item.answer]),
  ];
  for (const section of copy.sections) {
    values.push(
      section.eyebrow,
      section.headline,
      section.body,
      section.primary_cta_label,
      section.secondary_cta_label,
    );
    const content = section.content ?? {};
    values.push(...(content.assurance ?? []), content.note);
    for (const key of ["items", "features", "choices", "steps"]) {
      for (const item of content[key] ?? []) values.push(item.title, item.text);
    }
    values.push(...(content.proof ?? []));
    if (content.passport) {
      values.push(
        content.passport.heading,
        content.passport.device,
        content.passport.sub,
        content.passport.grade,
        content.passport.grade_label,
        content.passport.status,
        content.passport.cta_label,
      );
      for (const row of content.passport.rows ?? []) values.push(row.label, row.value);
    }
    if (content.form) {
      values.push(
        content.form.device_label,
        content.form.device_placeholder,
        content.form.contact_label,
        content.form.contact_placeholder,
        content.form.submit_label,
        content.form.note,
      );
    }
    if (content.closing) {
      values.push(
        content.closing.headline,
        content.closing.body,
        content.closing.brand,
        content.closing.tagline,
        content.closing.primary_cta_label,
        content.closing.secondary_cta_label,
      );
    }
  }
  return values
    .filter((value) => typeof value === "string" && value.trim())
    .flatMap((value) => {
      if (!value.includes("<p>")) return [value];
      return [...value.matchAll(/<p>([\s\S]*?)<\/p>/giu)].map((match) => match[1]);
    });
}

export function loadHomepageCopy() {
  const canonical = JSON.parse(fs.readFileSync(canonicalPath, "utf8"));
  const sourcePath = path.join(root, canonical.source);
  const source = fs.readFileSync(sourcePath);
  const checksum = crypto.createHash("sha256").update(source).digest("hex");
  if (checksum !== canonical.source_sha256) {
    throw new Error(
      `Homepage source checksum mismatch: expected ${canonical.source_sha256}, got ${checksum}`,
    );
  }
  const normalizedSource = plainText(source.toString("utf8"));
  const undocumented = canonicalPublicStrings(canonical).filter(
    (value) => !normalizedSource.includes(plainText(value)),
  );
  if (undocumented.length > 0) {
    throw new Error(
      `Canonical homepage copy contains text absent from writing-block.md:\n${undocumented
        .map((value) => `- ${plainText(value)}`)
        .join("\n")}`,
    );
  }
  return canonical;
}

export function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function sqlJson(value) {
  return `${sqlLiteral(JSON.stringify(value))}::json`;
}
