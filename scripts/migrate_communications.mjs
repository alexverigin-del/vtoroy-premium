import knex from "knex";
import {
  communicationsSql,
  communicationsMetadataSql,
} from "./setup_directus_communications_sql.mjs";
import { backfillTelegram, reconcileTelegram } from "../packages/communications/dist/migration.js";
const mode = process.argv[2];
if (!["schema", "backfill", "reconcile"].includes(mode))
  throw Error("Use schema | backfill | reconcile");
if (!process.env.COMM_MIGRATION_DATABASE_URL) throw Error("COMM_MIGRATION_DATABASE_URL_REQUIRED");
const db = knex({
  client: "pg",
  connection: process.env.COMM_MIGRATION_DATABASE_URL,
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
  }
} catch (e) {
  console.error(e.code || "COMM_MIGRATION_FAILED");
  process.exitCode = 1;
} finally {
  await db.destroy();
}
