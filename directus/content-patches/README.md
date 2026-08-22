# Directus Content Patches

This directory stores reviewed, one-row content changes for production
Directus. A patch is data migration evidence, not a reusable seed.

Workflow:

1. Copy `example.page-section.patch.json` and describe only the intended paths.
2. Capture the current production lock:

   ```bash
   npm run directus:content-patch -- --file directus/content-patches/<patch>.json --capture-lock
   ```

3. Review the file, commit it, then run preview. Preview reads production,
   prints the exact field diff and executes the SQL transaction with `ROLLBACK`:

   ```bash
   npm run directus:content-patch -- --file directus/content-patches/<patch>.json
   ```

4. Push the reviewed commit to `origin/master`, then apply:

   ```bash
   npm run directus:content-patch -- --file directus/content-patches/<patch>.json --apply --confirm <patch-id>
   ```

Apply refuses untracked, modified or local-only patch files. It creates and
verifies a fresh PostgreSQL/uploads backup, checks the snapshot again, uses an
atomic optimistic lock, restarts Directus to avoid stale cache and revalidates
the site when `revalidate` is `site-content`.

Never refresh a stale lock without first understanding who changed the record
in Studio. A mismatch is the safety mechanism, not an inconvenience to bypass.
