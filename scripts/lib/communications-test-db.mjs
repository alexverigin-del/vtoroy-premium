import { PGlite } from "@electric-sql/pglite";
import knex from "knex";
import ClientPG from "knex/lib/dialects/postgres/index.js";
import { readFile } from "node:fs/promises";

/** Actual PostgreSQL engine (WASM), not a query mock. One connection, no concurrency claims. */
export async function testDatabase() {
  const pg = new PGlite();
  await pg.waitReady;
  class Client extends ClientPG {
    async acquireRawConnection() {
      return { __knexUid: "pglite" };
    }
    async destroyRawConnection() {}
    async _query(connection, obj) {
      const result = await pg.query(obj.sql, obj.bindings || []);
      obj.response = {
        ...result,
        rowCount: result.affectedRows,
        command: /^\s*(select|with)/i.test(obj.sql)
          ? "SELECT"
          : obj.sql.trim().split(" ")[0].toUpperCase(),
      };
      return obj;
    }
  }
  const db = knex({ client: Client, connection: {}, pool: { min: 1, max: 1 } });
  await pg.exec(`CREATE TABLE store_locations(id uuid PRIMARY KEY);
    CREATE TABLE directus_roles(id uuid PRIMARY KEY,parent uuid);
    CREATE TABLE directus_users(id uuid PRIMARY KEY,status text,role uuid);
    CREATE TABLE directus_policies(id uuid PRIMARY KEY,admin_access boolean);
    CREATE TABLE directus_access(id uuid PRIMARY KEY,"user" uuid,role uuid,policy uuid);
    CREATE TABLE leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kind text,status text,assigned_to uuid,store_location_id uuid,is_test boolean,reference_code text,contact text,contact_channel text,message text,source text,source_path text);
    CREATE TABLE lead_comments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lead uuid,created_by uuid,comment text,outcome text);`);
  const schema = await readFile(
    new URL("../../packages/communications/schema.sql", import.meta.url),
    "utf8",
  );
  await pg.exec(schema);
  await pg.exec(schema);
  return {
    db,
    pg,
    close: async () => {
      await db.destroy();
      await pg.close();
    },
  };
}
