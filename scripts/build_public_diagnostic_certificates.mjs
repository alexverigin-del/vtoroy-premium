#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const manifestPath = process.argv[2];
if (!manifestPath)
  throw new Error(
    "Usage: node scripts/build_public_diagnostic_certificates.mjs <private-release-manifest.json>",
  );

const manifest = JSON.parse(await fs.readFile(path.resolve(manifestPath), "utf8"));
const outputDir = path.resolve(manifest.publicCertificateOutput);
await fs.mkdir(outputDir, { recursive: true });

async function imageDataUri(filePath) {
  if (!filePath) return "";
  const resolved = path.resolve(filePath);
  const bytes = await fs.readFile(resolved);
  const extension = path.extname(resolved).toLowerCase();
  const mime = extension === ".svg" ? "image/svg+xml" : "image/png";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

const providerLogo = await imageDataUri(manifest.certificateProviderLogo);
const brandLogo = await imageDataUri(manifest.certificateBrandLogo);

const escapeXml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

for (const device of manifest.devices) {
  const rows = [
    ["Идентификация", `Serial •••••${device.serialTail}; IMEI •••• ${device.imeiPrimaryLast4}`],
    ["Состояние", device.grade ? `Грейд ${device.grade}` : "Требуется повторная проверка"],
    ["Батарея", `${device.batteryPercent}% · ${device.batteryCycles} циклов`],
    ["Блокировки", "Find My iPhone: нет · Jailbreak: нет · MDM: нет"],
    ["Удаление данных", "Secure Erase завершён"],
    ["Компоненты", "Проверенные компоненты отмечены как оригинальные"],
    ["Функции", device.diagnosticSummary],
  ];
  const rowMarkup = rows
    .map(([label, value], index) => {
      const y = 480 + index * 98;
      return `<text x="96" y="${y}" class="label">${escapeXml(label)}</text>
      <text x="430" y="${y}" class="value">${escapeXml(value)}</text>
      <line x1="96" x2="1304" y1="${y + 34}" y2="${y + 34}" class="line"/>`;
    })
    .join("\n");
  const conditionNotes = Array.isArray(device.conditionNotes)
    ? device.conditionNotes.filter(Boolean).slice(0, 3)
    : [];
  const statusPanel =
    device.status === "superseded"
      ? `<rect x="96" y="1214" width="1208" height="156" rx="8" fill="#fff7ed" stroke="#fdba74"/>
       <text x="128" y="1282" class="warning">Отчёт заменён. Карточка не публикуется до повторной диагностики.</text>
       <text x="128" y="1330" class="note">${escapeXml(device.publicNote)}</text>`
      : conditionNotes.length > 0
        ? `<rect x="96" y="1190" width="1208" height="220" rx="8" fill="#fff7ed" stroke="#fdba74"/>
       <text x="128" y="1240" class="warning">Почему грейд ${escapeXml(device.grade)}</text>
       ${conditionNotes
         .map(
           (note, index) =>
             `<text x="128" y="${1288 + index * 44}" class="condition">${escapeXml(note)}</text>`,
         )
         .join("\n")}`
        : `<rect x="96" y="1230" width="1208" height="132" rx="8" fill="#ecfdf5" stroke="#6ee7b7"/>
       <text x="128" y="1282" class="verified">Проверка зафиксирована</text>
       <text x="128" y="1328" class="note">Публичная выписка не содержит полного IMEI, serial, QR и номеров компонентов.</text>`;
  const providerBrand = providerLogo
    ? `<image href="${providerLogo}" x="96" y="112" width="330" height="74" preserveAspectRatio="xMinYMid meet"/>`
    : `<text x="96" y="166" class="provider">NSYS Diagnostics</text>`;
  const isvoiBrand = brandLogo
    ? `<image href="${brandLogo}" x="920" y="96" width="384" height="158" preserveAspectRatio="xMaxYMid meet"/>`
    : `<text x="1304" y="164" text-anchor="end" class="brand">I СВОИ</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1800" viewBox="0 0 1400 1800">
    <rect width="1400" height="1800" fill="#f8fafc"/>
    <rect x="64" y="64" width="1272" height="1672" rx="12" fill="white" stroke="#dbe3ea"/>
    ${providerBrand}
    ${isvoiBrand}
    <text x="1304" y="246" text-anchor="end" class="brand-caption">ПРОВЕРЕННАЯ ТЕХНИКА ДЛЯ СВОИХ</text>
    <line x1="96" x2="1304" y1="286" y2="286" class="brand-line"/>
    <text x="96" y="338" class="subtitle">Публичная выписка диагностики</text>
    <text x="1304" y="338" text-anchor="end" class="meta">${escapeXml(device.testedAt)}</text>
    <text x="96" y="392" class="title">${escapeXml(device.title)}</text>
    ${rowMarkup}
    ${statusPanel}
    <text x="96" y="1490" class="section">Что проверено</text>
    <text x="96" y="1544" class="body">Экран · камеры · Face ID · звук · связь · кнопки и датчики</text>
    <text x="96" y="1610" class="body">Блокировки · безопасное удаление данных · оригинальность компонентов</text>
    <text x="96" y="1690" class="footer">Источник: NSYS Diagnostics · публичная выписка I СВОИ</text>
    <style>
      text{font-family:Arial,sans-serif;fill:#16191d}.brand{font-size:54px;font-weight:700}.provider{font-size:34px;font-weight:700;fill:#18334d}.brand-caption{font-size:15px;font-weight:700;fill:#66717d}.brand-line{stroke:#d9c39a}.subtitle{font-size:25px;fill:#66717d}.meta{font-size:24px;fill:#66717d}.title{font-size:34px;font-weight:700}.label{font-size:22px;font-weight:700;fill:#4b5563}.value{font-size:22px}.line{stroke:#e3e8ee}.warning{font-size:23px;font-weight:700;fill:#9a3412}.verified{font-size:23px;font-weight:700;fill:#047857}.note{font-size:19px;fill:#59636e}.condition{font-size:18px;fill:#78350f}.section{font-size:25px;font-weight:700}.body{font-size:22px;fill:#374151}.footer{font-size:18px;fill:#7a8490}
    </style>
  </svg>`;
  const output = path.join(outputDir, `${device.sku.toLowerCase()}.png`);
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(output);
  process.stdout.write(`${device.sku}: ${output}\n`);
}
