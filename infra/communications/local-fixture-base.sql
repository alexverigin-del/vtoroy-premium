BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS store_locations (
  id uuid PRIMARY KEY,
  city text NOT NULL
);

CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'new',
  assigned_to uuid REFERENCES directus_users(id),
  kind text,
  reference_code text,
  contact text,
  contact_channel text,
  message text,
  source text,
  source_path text,
  store_location_id uuid REFERENCES store_locations(id),
  is_test boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS lead_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead uuid NOT NULL REFERENCES leads(id),
  created_by uuid NOT NULL REFERENCES directus_users(id),
  comment text NOT NULL,
  outcome text
);

INSERT INTO directus_collections(collection, icon, note, hidden, singleton, accountability)
VALUES
  ('store_locations', 'store', 'Локальные тестовые магазины.', false, false, 'all'),
  ('leads', 'contact_page', 'Локальные тестовые обращения.', false, false, 'all'),
  ('lead_comments', 'comment', 'Локальные тестовые комментарии обращения.', false, false, 'all')
ON CONFLICT(collection) DO NOTHING;

INSERT INTO directus_fields(collection, field, special)
SELECT values.collection, values.field, values.special
FROM (VALUES
  ('store_locations', 'id', 'uuid'),
  ('leads', 'id', 'uuid'),
  ('lead_comments', 'id', 'uuid')
) AS values(collection, field, special)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_fields fields
  WHERE fields.collection = values.collection AND fields.field = values.field
);
COMMIT;
