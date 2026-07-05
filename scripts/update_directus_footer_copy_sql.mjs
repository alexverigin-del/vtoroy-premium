#!/usr/bin/env node
/**
 * Print idempotent SQL that updates public footer copy in Directus site_settings.
 *
 * Usage:
 *   node scripts/update_directus_footer_copy_sql.mjs > /tmp/isvoi_update_footer_copy.sql
 *   cd infra/directus-beget
 *   set -a && . ./.env && set +a
 *   docker compose exec -T database psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 < /tmp/isvoi_update_footer_copy.sql
 */

const footerCopy = {
  footer_note:
    "I СВОИ — клуб разумного владения: проверенные вещи проходят дальше через своих. Наличие, цены, грейды, гарантия и условия выхода подтверждаются перед сделкой. Названия и товарные знаки принадлежат их правообладателям.",
  footer_legal:
    "Наличие, цены и условия подтверждаются перед сделкой. Информация на сайте не является публичной офертой.",
  footer_copyright: "© 2026 I СВОИ.",
};

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

process.stdout.write(String.raw`
BEGIN;

DO $$
DECLARE
  v_settings_id site_settings.id%TYPE;
  v_updated integer;
BEGIN
  SELECT id INTO v_settings_id
  FROM site_settings
  ORDER BY id
  LIMIT 1;

  IF v_settings_id IS NULL THEN
    RAISE EXCEPTION 'site_settings singleton row was not found';
  END IF;

  UPDATE site_settings
  SET footer_note = ${sql(footerCopy.footer_note)},
    footer_legal = ${sql(footerCopy.footer_legal)},
    footer_copyright = ${sql(footerCopy.footer_copyright)}
  WHERE id = v_settings_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'expected to update 1 site_settings row, updated %', v_updated;
  END IF;
END;
$$;

SELECT 'footer_copy.footer_note' AS check_name, footer_note AS value
FROM site_settings
ORDER BY id
LIMIT 1;

SELECT 'footer_copy.footer_legal' AS check_name, footer_legal AS value
FROM site_settings
ORDER BY id
LIMIT 1;

SELECT 'footer_copy.footer_copyright' AS check_name, footer_copyright AS value
FROM site_settings
ORDER BY id
LIMIT 1;

COMMIT;
`);
