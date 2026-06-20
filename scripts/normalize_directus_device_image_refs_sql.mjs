#!/usr/bin/env node
/**
 * Print SQL that replaces legacy local device image paths with Directus Files
 * asset URLs. This is a production maintenance fallback for fields that Directus
 * API PATCH can reject when legacy JSON content is present.
 *
 * Usage:
 *   NEXT_PUBLIC_DIRECTUS_URL=https://api.isvoi.ru \
 *     node scripts/normalize_directus_device_image_refs_sql.mjs \
 *       | docker compose exec -T database sh -lc 'psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1'
 */

const publicUrl = (process.env.NEXT_PUBLIC_DIRECTUS_URL || process.env.DIRECTUS_URL || "https://api.isvoi.ru")
  .replace(/\/+$/, "");

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

process.stdout.write(String.raw`
BEGIN;

CREATE OR REPLACE FUNCTION isvoi_is_local_asset(p_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(p_value, '') LIKE 'assets/%'
      OR coalesce(p_value, '') LIKE '/assets/%';
$$;

CREATE OR REPLACE FUNCTION isvoi_basename(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(coalesce(p_value, ''), '^.*/', '');
$$;

CREATE OR REPLACE FUNCTION isvoi_asset_url(p_file uuid, p_variant text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_variant
    WHEN 'card' THEN ${sqlLiteral(publicUrl)} || '/assets/' || p_file::text || '?width=720&height=540&quality=82&fit=cover&format=auto&withoutEnlargement=true'
    WHEN 'passport' THEN ${sqlLiteral(publicUrl)} || '/assets/' || p_file::text || '?width=900&height=675&quality=84&fit=cover&format=auto&withoutEnlargement=true'
    ELSE ${sqlLiteral(publicUrl)} || '/assets/' || p_file::text || '?width=1200&height=900&quality=86&fit=cover&format=auto&withoutEnlargement=true'
  END;
$$;

CREATE OR REPLACE FUNCTION isvoi_gallery_role(p_index integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_index
    WHEN 1 THEN 'main'
    WHEN 2 THEN 'screen'
    WHEN 3 THEN 'body'
    WHEN 4 THEN 'defect'
    ELSE 'other'
  END;
$$;

DO $$
DECLARE
  d record;
  item jsonb;
  item_index integer;
  file_id uuid;
  next_gallery jsonb;
  changed boolean;
BEGIN
  FOR d IN
    SELECT id, listing_image, gallery::jsonb AS gallery, passport::jsonb AS passport
    FROM devices
  LOOP
    IF isvoi_is_local_asset(d.listing_image) THEN
      SELECT f.id
      INTO file_id
      FROM directus_files f
      WHERE f.title = format('isvoi:%s:card:0', d.id)
         OR (
          f.filename_download = isvoi_basename(d.listing_image)
          AND f.title LIKE ('isvoi:' || d.id || ':%')
        )
      ORDER BY CASE WHEN f.title = format('isvoi:%s:card:0', d.id) THEN 0 ELSE 1 END
      LIMIT 1;

      IF file_id IS NOT NULL THEN
        UPDATE devices
        SET listing_image = isvoi_asset_url(file_id, 'card')
        WHERE id = d.id;
      END IF;
    END IF;

    IF d.gallery IS NOT NULL AND jsonb_typeof(d.gallery) = 'array' THEN
      next_gallery := '[]'::jsonb;
      changed := false;

      FOR item, item_index IN
        SELECT value, ordinality::integer
        FROM jsonb_array_elements(d.gallery) WITH ORDINALITY
      LOOP
        IF isvoi_is_local_asset(item->>'src') THEN
          SELECT f.id
          INTO file_id
          FROM directus_files f
          WHERE f.title = format('isvoi:%s:%s:%s', d.id, isvoi_gallery_role(item_index), item_index)
             OR (
              f.filename_download = isvoi_basename(item->>'src')
              AND f.title LIKE ('isvoi:' || d.id || ':%')
            )
          ORDER BY CASE
            WHEN f.title = format('isvoi:%s:%s:%s', d.id, isvoi_gallery_role(item_index), item_index) THEN 0
            ELSE 1
          END
          LIMIT 1;

          IF file_id IS NOT NULL THEN
            item := jsonb_set(item, '{src}', to_jsonb(isvoi_asset_url(file_id, 'gallery')), true);
            changed := true;
          END IF;
        END IF;

        next_gallery := next_gallery || jsonb_build_array(item);
      END LOOP;

      IF changed THEN
        UPDATE devices
        SET gallery = next_gallery::json
        WHERE id = d.id;
      END IF;
    END IF;

    IF d.passport IS NOT NULL AND isvoi_is_local_asset(d.passport #>> '{condition,defectPhoto}') THEN
      SELECT f.id
      INTO file_id
      FROM directus_files f
      WHERE f.title = format('isvoi:%s:defect:4', d.id)
         OR (
          f.filename_download = isvoi_basename(d.passport #>> '{condition,defectPhoto}')
          AND f.title LIKE ('isvoi:' || d.id || ':%')
        )
      ORDER BY CASE WHEN f.title = format('isvoi:%s:defect:4', d.id) THEN 0 ELSE 1 END
      LIMIT 1;

      IF file_id IS NOT NULL THEN
        UPDATE devices
        SET passport = jsonb_set(
          d.passport,
          '{condition,defectPhoto}',
          to_jsonb(isvoi_asset_url(file_id, 'passport')),
          true
        )::json
        WHERE id = d.id;
      END IF;
    END IF;
  END LOOP;
END $$;

DROP FUNCTION isvoi_gallery_role(integer);
DROP FUNCTION isvoi_asset_url(uuid, text);
DROP FUNCTION isvoi_basename(text);
DROP FUNCTION isvoi_is_local_asset(text);

COMMIT;

SELECT 'devices.listing_image.local' AS check_name, count(*)::text AS value
FROM devices
WHERE coalesce(listing_image, '') LIKE 'assets/%'
   OR coalesce(listing_image, '') LIKE '/assets/%'
UNION ALL
SELECT 'devices.gallery.local', count(*)::text
FROM devices
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements(gallery::jsonb) AS item
  WHERE coalesce(item->>'src', '') LIKE 'assets/%'
     OR coalesce(item->>'src', '') LIKE '/assets/%'
)
UNION ALL
SELECT 'devices.passport.local', count(*)::text
FROM devices
WHERE coalesce(passport::jsonb #>> '{condition,defectPhoto}', '') LIKE 'assets/%'
   OR coalesce(passport::jsonb #>> '{condition,defectPhoto}', '') LIKE '/assets/%';
`);
