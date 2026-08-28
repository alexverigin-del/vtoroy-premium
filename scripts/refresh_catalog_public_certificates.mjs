#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const manifestArg = process.argv[2];
const apply = process.argv.includes("--apply");
if (!manifestArg) {
  throw new Error(
    "Usage: node scripts/refresh_catalog_public_certificates.mjs <private-release-manifest.json> [--apply]",
  );
}

const manifestPath = path.resolve(manifestArg);
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const directusUrl = (process.env.DIRECTUS_URL || "").replace(/\/$/, "");
const token = process.env.INVENTORY_IMPORT_DIRECTUS_TOKEN || process.env.DIRECTUS_TOKEN || "";
const brandingVersion = String(manifest.certificateBrandingVersion || "").trim();
if (!directusUrl || !token) {
  throw new Error("DIRECTUS_URL and INVENTORY_IMPORT_DIRECTUS_TOKEN are required");
}
if (!/^[a-z0-9-]+$/.test(brandingVersion)) {
  throw new Error("certificateBrandingVersion must contain lowercase letters, digits and hyphens");
}

async function request(method, pathname, body) {
  const response = await fetch(`${directusUrl}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${method} ${pathname}: ${response.status} ${text.slice(0, 800)}`);
  }
  return json.data;
}

const first = async (endpoint, query) =>
  (await request("GET", `/${endpoint}?${query}&limit=1`))?.[0];
const relationId = (value) =>
  typeof value === "string" ? value : value && typeof value === "object" ? value.id : "";
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

async function folderId(name) {
  const folder = await first("folders", `filter[name][_eq]=${encodeURIComponent(name)}&fields=id`);
  if (!folder) throw new Error(`Directus folder is missing: ${name}`);
  return folder.id;
}

async function readAsset(fileId) {
  const response = await fetch(`${directusUrl}/assets/${encodeURIComponent(fileId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`GET /assets/${fileId}: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function uploadFile({ filePath, title, folder, mime, filename, expectedImage }) {
  const bytes = await fs.readFile(path.resolve(filePath));
  const digest = sha256(bytes);
  if (expectedImage) {
    const metadata = await sharp(bytes).metadata();
    if (
      metadata.format !== expectedImage.format ||
      metadata.width !== expectedImage.width ||
      metadata.height !== expectedImage.height
    ) {
      throw new Error(`${filePath}: unexpected certificate format or dimensions`);
    }
  }
  const deterministicTitle = `${title}:${digest.slice(0, 12)}`;
  const existing = await first(
    "files",
    `filter[title][_eq]=${encodeURIComponent(deterministicTitle)}&fields=id,title`,
  );
  if (existing) {
    if (sha256(await readAsset(existing.id)) !== digest) {
      throw new Error(`${deterministicTitle}: existing Directus file has a different SHA-256`);
    }
    return existing.id;
  }
  if (!apply) return `dry-run:${deterministicTitle}`;
  const form = new FormData();
  form.append("folder", folder);
  form.append("title", deterministicTitle);
  form.append("description", `Брендированная выписка диагностики, ${brandingVersion}.`);
  form.append("file", new Blob([bytes], { type: mime }), filename);
  return (await request("POST", "/files", form)).id;
}

const publicFolder = await folderId("ISVOI Passport Public");
const originalFolder = await folderId("ISVOI Passport Originals");
const archiveFolder = await folderId("ISVOI Passport Archive");
const oldPublicFiles = new Set();

for (const device of manifest.devices) {
  const product = await first(
    "items/products",
    `filter[sku][_eq]=${encodeURIComponent(device.sku)}&fields=id,sku,status,content_status,passport.id`,
  );
  if (!product) throw new Error(`${device.sku}: product is missing`);
  const passportId = relationId(
    Array.isArray(product.passport) ? product.passport[0] : product.passport,
  );
  if (!passportId) throw new Error(`${device.sku}: Passport is missing`);
  const details = await first(
    "items/device_details",
    `filter[product][_eq]=${encodeURIComponent(product.id)}&fields=id`,
  );
  if (!details) throw new Error(`${device.sku}: device details are missing`);
  let currentReport = await first(
    "items/device_diagnostic_reports",
    `filter[product][_eq]=${encodeURIComponent(product.id)}&filter[status][_eq]=current&fields=id,tested_at,status,provider,public_file,original_file,passport&sort=-tested_at`,
  );
  if (!currentReport) {
    currentReport = await first(
      "items/device_diagnostic_reports",
      `filter[product][_eq]=${encodeURIComponent(product.id)}&fields=id,tested_at,status,provider,public_file,original_file,passport&sort=-tested_at`,
    );
  }
  if (!currentReport) throw new Error(`${device.sku}: diagnostic report is missing`);

  const safeSku = device.sku.toLowerCase().replace(/^т/u, "t");
  const publicFile = await uploadFile({
    filePath: device.publicCertificate,
    title: `isvoi:${brandingVersion}:${safeSku}:public`,
    folder: publicFolder,
    mime: "image/png",
    filename: `isvoi-${safeSku}-diagnostic-certificate.png`,
    expectedImage: { format: "png", width: 1400, height: 1800 },
  });

  if (device.replaceDiagnosticReport) {
    if (
      !device.originalCertificate ||
      path.extname(device.originalCertificate).toLowerCase() !== ".pdf"
    ) {
      throw new Error(`${device.sku}: replacement diagnostic report must be a PDF`);
    }
    if (String(currentReport.tested_at) > String(device.testedAt)) {
      throw new Error(`${device.sku}: replacement diagnostic date is older than current report`);
    }
    const replacementAlreadyCurrent = String(currentReport.tested_at) === String(device.testedAt);
    const originalFile = await uploadFile({
      filePath: device.originalCertificate,
      title: `isvoi:${brandingVersion}:${safeSku}:original`,
      folder: originalFolder,
      mime: "application/pdf",
      filename: `isvoi-${safeSku}-diagnostic-original.pdf`,
    });
    if (replacementAlreadyCurrent) {
      if (
        relationId(currentReport.original_file) !== originalFile ||
        relationId(currentReport.public_file) !== publicFile
      ) {
        throw new Error(`${device.sku}: current report files do not match the branded manifest`);
      }
    } else if (apply) {
      await request(
        "PATCH",
        `/items/device_diagnostic_reports/${encodeURIComponent(currentReport.id)}`,
        { status: "superseded", sort: 20 },
      );
      try {
        await request("POST", "/items/device_diagnostic_reports", {
          product: product.id,
          passport: passportId,
          provider: "NSYS Diagnostics",
          tested_at: device.testedAt,
          status: "current",
          original_file: originalFile,
          public_file: publicFile,
          public_note: device.publicNote,
          sort: 10,
        });
      } catch (error) {
        await request(
          "PATCH",
          `/items/device_diagnostic_reports/${encodeURIComponent(currentReport.id)}`,
          { status: "current", sort: 10 },
        );
        throw error;
      }
    }
    if (apply) {
      await request("PATCH", `/items/device_details/${encodeURIComponent(details.id)}`, {
        grade: device.grade,
        battery: `${device.batteryPercent}%`,
        battery_text: `Аккумулятор ${device.batteryPercent}%`,
        battery_cycles: device.batteryCycles,
        diagnostic_date: device.testedAt,
        diagnostic_by: "NSYS Diagnostics / I СВОИ",
      });
      await request("PATCH", `/items/device_passports/${encodeURIComponent(passportId)}`, {
        summary_rows: device.summaryRows,
        diagnostics_status: "Проверено",
        diagnostics_checklist: device.checklist,
        condition_grade_text: `Грейд ${device.grade}`,
        condition_note: device.conditionNote,
        condition_notes: device.conditionNotes,
      });
    }
  } else {
    const oldPublicId = relationId(currentReport.public_file);
    if (oldPublicId && oldPublicId !== publicFile) oldPublicFiles.add(oldPublicId);
    if (apply) {
      await request(
        "PATCH",
        `/items/device_diagnostic_reports/${encodeURIComponent(currentReport.id)}`,
        { public_file: publicFile },
      );
    }
  }

  process.stdout.write(
    `${apply ? "refreshed" : "checked"} ${device.sku}: branded public certificate${device.replaceDiagnosticReport ? ", replacement diagnostic report" : ""}\n`,
  );
}

if (apply) {
  for (const fileId of oldPublicFiles) {
    const reference = await first(
      "items/device_diagnostic_reports",
      `filter[public_file][_eq]=${encodeURIComponent(fileId)}&fields=id`,
    );
    if (reference) throw new Error(`Refusing to archive referenced public certificate ${fileId}`);
    await request("PATCH", `/files/${encodeURIComponent(fileId)}`, {
      folder: archiveFolder,
      description: `Архив публичной выписки до брендирования ${brandingVersion}; активных связей нет.`,
    });
  }
}

process.stdout.write(
  `${apply ? "Applied" : "Dry-run passed"}: ${manifest.devices.length} certificates, ${oldPublicFiles.size} previous public files to archive.\n`,
);
