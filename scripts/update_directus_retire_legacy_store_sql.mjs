#!/usr/bin/env node

const apply = process.argv.includes("--apply");
const confirmed = process.argv.includes("--confirm-retire-legacy-store");

if (apply !== confirmed) {
  throw new Error("Production apply requires both --apply and --confirm-retire-legacy-store");
}

const transactionEnd = apply ? "COMMIT;" : "ROLLBACK;";

process.stdout.write(String.raw`
BEGIN;

DO $$
DECLARE
  store_page_id uuid;
  section_count integer;
  unexpected_count integer;
BEGIN
  SELECT id INTO store_page_id
  FROM site_pages
  WHERE slug='store' AND status='draft';

  IF store_page_id IS NULL THEN
    RAISE EXCEPTION 'Expected site_pages.store to exist in draft status';
  END IF;

  SELECT count(*) INTO section_count
  FROM page_sections
  WHERE page=store_page_id;

  IF section_count <> 8 THEN
    RAISE EXCEPTION 'Expected 8 legacy store sections, got %', section_count;
  END IF;

  SELECT count(*) INTO unexpected_count
  FROM page_sections
  WHERE page=store_page_id
    AND id NOT IN (
      'b25b1be5-edf0-486f-ad6c-4144888d9faf'::uuid,
      'a23155da-0247-479e-b150-766efc9bfc7c'::uuid,
      'a6bf73fe-7c06-47b5-8096-d82fd2cb92ed'::uuid,
      '4c9eb7a3-572c-4a8d-9998-1bc739c18d81'::uuid,
      '2036bd45-94da-46f5-a179-c492fd26e4a9'::uuid,
      'def494a8-e81f-466a-b30b-a8b63133694c'::uuid,
      'cf9d345c-c0e8-4296-aa51-576ea779e97e'::uuid,
      '684210de-9313-40c5-8432-f9561b4ba23b'::uuid
    );

  IF unexpected_count <> 0 THEN
    RAISE EXCEPTION 'Legacy store section set changed; refusing update';
  END IF;
END $$;

UPDATE page_sections
SET is_active=false
WHERE page=(SELECT id FROM site_pages WHERE slug='store' AND status='draft')
  AND is_active=true;

SELECT 'retire_legacy_store.active_sections|' || count(*)::text
FROM page_sections
WHERE page=(SELECT id FROM site_pages WHERE slug='store')
  AND is_active=true;

${transactionEnd}
`);
