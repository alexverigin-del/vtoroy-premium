# Production release: Telegram client conversations

Prepared for the existing production stage 1 at commit `2bee9ed328fe85d65fd270211c99e7147c9efb1d`. This release does not create or replace the bot, group, route, staff binding or worker identity. It adds client conversations to `@isvoi_help_bot` and keeps the current group `I СВОИ · Заявки · Белгород` (`-1004317825276`).

The accepted retention period is **6 months after a lead enters `won` or `closed`**. Reopening clears the closure timestamp. The worker runs cleanup at most once per day. Deleting a conversation cascades to messages, drafts and queued payloads, including Telegram photo `file_id` values. Expired link hashes are deleted after one day; empty inactive client sessions and receipt metadata are removed after six months. The last run stores only aggregate counts.

## Release artifact

The code is delivered as a Git bundle from the exact base commit. The private staging directory contains only:

- `release.bundle` — the reviewed commit and its objects;
- `release-manifest.json` — base SHA, release SHA and SHA-256 of the bundle;
- `scripts/release_telegram_conversations_production.mjs` plus the migration/preflight imports needed to execute it.

No env file, bot token, Directus token, email, Telegram message or client data belongs in the artifact. The release script reads existing secrets on the production host and never prints them.

## Read-only gate

From `/tmp/isvoi-telegram-conversations-release-<random>`:

```bash
node scripts/release_telegram_conversations_production.mjs check
```

The gate verifies the clean production checkout and exact base, release bundle hash/signature, enabled stage-1 route, PM2 worker configuration, bot/group/admin readiness and the website lead token. The lead token must map to an active role without an inherited or direct admin policy. The gate does not change code, schema, env files, PM2 processes, Telegram messages or business data.

## Activation

Activation is deliberately a separate command and requires explicit deployment approval:

```bash
node scripts/release_telegram_conversations_production.mjs enable
```

Order of operations:

1. Re-run every read-only gate and create a PostgreSQL custom-format dump; verify its catalog and copy Directus, worker and web env files into a mode-700 backup directory.
2. Fast-forward from the exact base to the release commit and run Telegram tests plus the full `web:verify` build before changing feature flags.
3. Apply the additive conversation/retention schema. Public and worker receive no collection permissions.
4. Briefly stop the Telegram worker, enable the Directus conversation endpoint and restart Directus.
5. Verify Public and worker cannot use `intake-check`; verify the existing scoped website token can use it. Verify the authenticated worker session reports production conversations enabled.
6. Release the preflight lease, enable the site flag, restart the worker and web process, then require an active worker lease, HTTP 200 from the homepage, both PM2 processes online and the original stage-1 route still enabled.
7. Save PM2 state and the release SHA, backup path, activation time and retention period in the existing mode-600 release state file.

The release does not backfill historical leads or issue old leads a Telegram link. The site returns a link only in the response that creates a new lead.

## Automatic rollback

If activation fails, the script restores the three saved env files, resets only the reviewed release commit after first proving the production checkout was clean and at the exact base, rebuilds the previous web version, restarts Directus/web/worker and leaves the additive empty schema in place. The existing stage-1 route and its history are preserved.

After a successful release, the emergency feature rollback is:

```bash
node scripts/release_telegram_conversations_production.mjs disable
```

It sets the Directus and website conversation flags to false, rebuilds/restarts the web app, restarts Directus and worker, saves PM2 state and preserves stage 1 plus conversation history. Cleanup resumes when the conversation feature is enabled again; it never shortens the six-month period.

## First production verification

Use one new controlled lead owned by `@AVerigin`. Confirm: the site shows the link; `/start` binds exactly that lead; its client message appears in its topic; an ordinary group message stays internal; “Ответить клиенту” requires the exact prompt and preview confirmation; the reply reaches the controlled client; Directus records both directions and the staff author. Then close the controlled lead and mark it as a technical test so it is excluded from the business queue. Never use an existing customer lead for the release check.
