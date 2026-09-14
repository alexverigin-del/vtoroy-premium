import knex from "knex";
import { readFile } from "node:fs/promises";
import {
  communicationsSql,
  communicationsMetadataSql,
} from "./setup_directus_communications_sql.mjs";
import { backfillTelegram, reconcileTelegram } from "../packages/communications/dist/migration.js";
const mode = process.argv[2];
if (!["schema", "backfill", "reconcile"].includes(mode))
  throw Error("Use schema | backfill | reconcile");
let connection;
if (process.env.COMM_MIGRATION_DATABASE_URL) connection = process.env.COMM_MIGRATION_DATABASE_URL;
else {
  const required = ["DB_HOST", "DB_PORT", "DB_USER", "DB_DATABASE"];
  if (required.some((key) => !process.env[key])) throw Error("COMM_MIGRATION_DATABASE_REQUIRED");
  const password = process.env.DB_PASSWORD_FILE
    ? (await readFile(process.env.DB_PASSWORD_FILE, "utf8")).trim()
    : process.env.DB_PASSWORD;
  if (!password) throw Error("COMM_MIGRATION_DATABASE_PASSWORD_REQUIRED");
  connection = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password,
    database: process.env.DB_DATABASE,
  };
}
const db = knex({
  client: "pg",
  connection,
  pool: { min: 0, max: 1 },
});
try {
  if (mode === "schema") {
    await db.raw(communicationsSql);
    await db.raw(communicationsMetadataSql);
    console.log("COMM_ADDITIVE_SCHEMA_READY_DISABLED");
  } else {
    const id = process.env.COMM_CONNECTION_ID;
    if (!id) throw Error("COMM_CONNECTION_ID_REQUIRED");
    const result =
      mode === "backfill" ? await backfillTelegram(db, id) : await reconcileTelegram(db, id);
    console.log(JSON.stringify(result, null, 2));
    if (process.env.COMM_REQUIRE_DATA_READY === "true" && result.data_ready !== true)
      throw Error(result.reason || "COMM_MIGRATION_NOT_READY");
  }
} catch (e) {
  console.error(e.code || "COMM_MIGRATION_FAILED");
  process.exitCode = 1;
} finally {
  await db.destroy();
}
