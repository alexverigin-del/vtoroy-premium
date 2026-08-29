#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  evaluateRealDeviceCandidate,
  evaluateTradeDeskGate,
  mergeTradeDeskAcceptance,
} from "./trade_pricing_real_device_validation.mjs";

const root = process.cwd();
const outputDir = path.join(root, "analysis", "trade-in-pricing-validation-2026-08-29");
const acceptancePath = path.join(outputDir, "trade_desk_acceptance.json");
const sshKey = process.env.DIRECTUS_AUDIT_SSH_KEY || "C:\\Users\\1\\.ssh\\isvoi_beget_ed25519";
const sshTarget = process.env.DIRECTUS_AUDIT_SSH_TARGET || "deploy@217.114.14.32";
const remoteCommand =
  process.env.DIRECTUS_AUDIT_REMOTE_PSQL ||
  "cd /opt/isvoi/infra/directus-beget && docker compose exec -T database psql -U isvoi -d isvoi -v ON_ERROR_STOP=1 -qAt -F '|'";
const enforce = process.argv.includes("--enforce");

const sqlResult = spawnSync(
  process.execPath,
  [path.join(root, "scripts", "query_trade_pricing_validation_run_sql.mjs")],
  { cwd: root, encoding: "utf8" },
);
if (sqlResult.status !== 0) throw new Error(sqlResult.stderr || "Could not generate validation SQL");

const queryResult = spawnSync("ssh", ["-i", sshKey, sshTarget, remoteCommand], {
  cwd: root,
  input: sqlResult.stdout,
  encoding: "utf8",
  maxBuffer: 4 * 1024 * 1024,
});
if (queryResult.status !== 0) throw new Error(queryResult.stderr || "Production candidate query failed");

const columns = [
  "candidate_key", "candidate_source", "model_slug", "storage", "grade", "battery_text",
  "diagnostic_date", "diagnostics_status", "repair", "water", "product_status", "stock_status",
  "quantity", "listing_price", "purchase_price", "eligibility_status", "identity_status",
  "diagnostics_complete",
];

const rawCandidates = queryResult.stdout
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    const values = line.split("|");
    if (values.length !== columns.length) {
      throw new Error(`Unexpected production row shape: ${values.length} fields`);
    }
    const candidate = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
    candidate.quantity = Number(candidate.quantity);
    candidate.diagnostics_complete = candidate.diagnostics_complete === "t";
    return candidate;
  });

const evaluated = rawCandidates.map(evaluateRealDeviceCandidate);
fs.mkdirSync(outputDir, { recursive: true });

let existingAcceptance = {};
if (fs.existsSync(acceptancePath)) {
  existingAcceptance = JSON.parse(fs.readFileSync(acceptancePath, "utf8"));
}
const acceptance = mergeTradeDeskAcceptance(evaluated, existingAcceptance);
const gate = evaluateTradeDeskGate(acceptance);
acceptance.candidates = gate.candidates;
fs.writeFileSync(acceptancePath, `${JSON.stringify(acceptance, null, 2)}\n`, "utf8");

const csvColumns = [
  "candidate_key", "candidate_source", "model_slug", "storage", "grade", "battery_text",
  "diagnostics_status", "eligibility_status", "listing_price", "historical_purchase_price",
  "quote_min", "quote_max", "actual_gross_margin_pct", "projected_gross_margin_pct",
  "gross_headroom_pass", "diagnostics_complete",
];
const csvValue = (value) => {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const csv = [
  csvColumns.join(","),
  ...evaluated.map((candidate) => csvColumns.map((column) => csvValue(candidate[column])).join(",")),
].join("\n");
fs.writeFileSync(path.join(outputDir, "real_device_candidates.csv"), `\uFEFF${csv}\n`, "utf8");

const margins = evaluated.map((candidate) => candidate.projected_gross_margin_pct).sort((a, b) => a - b);
const actualMargins = evaluated.map((candidate) => candidate.actual_gross_margin_pct).sort((a, b) => a - b);
const money = (value) => `${Number(value).toLocaleString("ru-RU")} ₽`;
const status = gate.passed ? "PASSED" : "BLOCKED";
const rows = evaluated.map((candidate) =>
  `| ${candidate.candidate_key.slice(0, 18)} | ${candidate.model_slug} | ${candidate.storage} | ${candidate.grade || "—"} | ${money(candidate.listing_price)} | ${money(candidate.historical_purchase_price)} | ${money(candidate.quote_min)}–${money(candidate.quote_max)} | ${candidate.actual_gross_margin_pct}% | ${candidate.projected_gross_margin_pct}% | ${candidate.diagnostics_complete ? "готово" : "нужно"} |`,
);

const report = `# Trade-in pricing v2: проверка на реальных устройствах

Дата: 29 августа 2026 года. Версия: \`trade-pricing-v2-draft\`. Gate: **${status}**.

## Результат

- Активированных inventory-кандидатов: **${gate.candidate_count}/${gate.target}**.
- Завершённая диагностика/Passport: **${gate.diagnostics_ready}/${gate.target}**.
- Запас не меньше 25% при верхней границе quote: **${gate.gross_headroom_ready}/${gate.target}**.
- Фактическая валовая маржа текущих закупок: **${actualMargins[0]}–${actualMargins.at(-1)}%**.
- Расчётная валовая маржа при v2 quote max: **${margins[0]}–${margins.at(-1)}%**.
- Заполнены подготовка и гарантийный резерв: **${gate.cost_inputs_ready}/${gate.target}**.
- Одобрено Trade Desk: **${gate.approved_candidates}/${gate.target}**; общее подтверждение: **${gate.approval_complete ? "да" : "нет"}**.

Матрица v2 проходит защитный gross-headroom на **${gate.gross_headroom_ready}/${gate.candidate_count}** активированных складских позициях. Неактивированные строки загрузки остатков намеренно не входят в контрольную выборку до создания товарной карточки, загрузки фото и завершения Passport. Поэтому Trade Desk gate остаётся закрытым до появления десяти активированных кандидатов и завершения их диагностики.

## Контрольные устройства

| Кандидат | Модель | Память | Грейд | Розница | Фактическая закупка | Quote v2 | Факт. gross margin | Gross margin v2 | Диагностика |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
${rows.join("\n")}

## Что требуется для снятия блокировки

1. Завершить повторную диагностику iPhone 14 Pro Max 256 ГБ Gold.
2. После штатной активации новых устройств с фото и Passport повторно собрать выборку до 10 единиц.
3. В \`trade_desk_acceptance.json\` заполнить для всех десяти устройств подтверждённый offer, стоимость подготовки и гарантийный резерв.
4. Trade Desk задаёт минимальную net margin, одобряет каждый кейс и заполняет общее подтверждение.
5. Выполнить \`npm run trade:validate:real-devices:gate\`; только статус PASSED разрешает обсуждать публикацию pricing version.

## Ограничения

Проверка использует обезличенные production inventory и Passport: серийные номера и IMEI не выгружаются. Текущая розничная цена не доказывает фактическую продажу по этой цене, а gross margin не учитывает подготовку, гарантию, налоги и другие переменные расходы, пока Trade Desk не заполнит acceptance.
`;
fs.writeFileSync(path.join(outputDir, "README.md"), report, "utf8");

console.log(`Trade pricing real-device gate: ${status}`);
console.log(`- candidates: ${gate.candidate_count}/${gate.target}`);
console.log(`- diagnostics: ${gate.diagnostics_ready}/${gate.target}`);
console.log(`- gross headroom: ${gate.gross_headroom_ready}/${gate.target}`);
console.log(`- cost inputs: ${gate.cost_inputs_ready}/${gate.target}`);
console.log(`- approvals: ${gate.approved_candidates}/${gate.target}`);
console.log(`- report: ${path.relative(root, path.join(outputDir, "README.md"))}`);

if (enforce && !gate.passed) process.exit(2);
