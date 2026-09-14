import test from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./lib/communications-test-db.mjs";
import { changeJournalSql } from "./setup_communications_change_journal.mjs";

test("legacy journal ignores Telegram lease heartbeats but records cursor changes", async () => {
  const fixture = await testDatabase();
  try {
    await fixture.pg.exec(`
      CREATE TABLE telegram_runtime(
        bot_id bigint PRIMARY KEY,
        update_offset bigint NOT NULL DEFAULT 0,
        lease_until timestamptz
      );
      CREATE TABLE telegram_receipts(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        update_id bigint
      );
      ${changeJournalSql}
    `);

    await fixture.db("telegram_runtime").insert({ bot_id: 42, update_offset: 10 });
    assert.equal(Number((await fixture.db("comm_migration_changes").count("* as n").first()).n), 1);

    await fixture.db("telegram_runtime").where({ bot_id: 42 }).update({ lease_until: fixture.db.fn.now() });
    assert.equal(Number((await fixture.db("comm_migration_changes").count("* as n").first()).n), 1);

    await fixture.db("telegram_runtime").where({ bot_id: 42 }).update({ update_offset: 11 });
    const runtimeChanges = await fixture.db("comm_migration_changes")
      .where({ collection: "telegram_runtime" })
      .orderBy("sequence");
    assert.equal(runtimeChanges.length, 2);
    assert.equal(runtimeChanges[1].operation, "UPDATE");
    assert.equal(runtimeChanges[1].row_id, "42");

    const [receipt] = await fixture.db("telegram_receipts")
      .insert({ update_id: 99 })
      .returning("id");
    await fixture.db("telegram_receipts").where({ id: receipt.id }).update({ update_id: 100 });
    await fixture.db("telegram_receipts").where({ id: receipt.id }).delete();
    const receiptChanges = await fixture.db("comm_migration_changes")
      .where({ collection: "telegram_receipts" })
      .orderBy("sequence");
    assert.deepEqual(receiptChanges.map((row) => row.operation), ["INSERT", "UPDATE", "DELETE"]);
  } finally {
    await fixture.close();
  }
});
