#!/usr/bin/env node

process.stdout.write(String.raw`
\set ON_ERROR_STOP on
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO directus_folders(id,name,parent)
SELECT gen_random_uuid(),'ISVOI Passport Archive',NULL
WHERE NOT EXISTS(
  SELECT 1 FROM directus_folders WHERE name='ISVOI Passport Archive'
);

COMMIT;

SELECT 'certificate_branding.passport_archive_missing' AS check_name,count(*)::text AS value
FROM (VALUES ('ISVOI Passport Archive')) expected(name)
WHERE NOT EXISTS(
  SELECT 1 FROM directus_folders folder WHERE folder.name=expected.name
);
`);
