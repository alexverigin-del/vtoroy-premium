#!/usr/bin/env node
/**
 * Make `sold` an explicit, atomic Catalog V3 lifecycle state.
 *
 * Marking a product sold keeps its published card available as history, while
 * zeroing the product and every store offer. Returning it to stock remains an
 * explicit inventory operation and is intentionally not automated here.
 */

const rollback = process.argv.includes("--rollback");

process.stdout.write(String.raw`
\set ON_ERROR_STOP on
BEGIN;
SET client_encoding TO 'UTF8';

CREATE OR REPLACE FUNCTION isvoi_product_sold_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stock_status='sold' THEN
    NEW.stock_quantity=0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_sold_guard ON products;
CREATE TRIGGER products_sold_guard
BEFORE INSERT OR UPDATE OF stock_status,stock_quantity
ON products FOR EACH ROW EXECUTE FUNCTION isvoi_product_sold_guard();

CREATE OR REPLACE FUNCTION isvoi_sync_sold_product_offers()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stock_status='sold' AND (
    TG_OP='INSERT' OR OLD.stock_status IS DISTINCT FROM NEW.stock_status
  ) THEN
    UPDATE product_offers
    SET stock_status='sold',stock_quantity=0,updated_at=now()
    WHERE product=NEW.id
      AND (stock_status IS DISTINCT FROM 'sold' OR stock_quantity<>0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_sync_sold_offers ON products;
CREATE TRIGGER products_sync_sold_offers
AFTER INSERT OR UPDATE OF stock_status
ON products FOR EACH ROW EXECUTE FUNCTION isvoi_sync_sold_product_offers();

CREATE OR REPLACE FUNCTION isvoi_sold_product_offer_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_product_status varchar;
BEGIN
  SELECT stock_status INTO v_product_status FROM products WHERE id=NEW.product;
  IF NEW.stock_status='sold' OR v_product_status='sold' THEN
    NEW.stock_status='sold';
    NEW.stock_quantity=0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_offers_sold_guard ON product_offers;
CREATE TRIGGER product_offers_sold_guard
BEFORE INSERT OR UPDATE OF product,stock_status,stock_quantity
ON product_offers FOR EACH ROW EXECUTE FUNCTION isvoi_sold_product_offer_guard();

UPDATE products SET stock_quantity=0
WHERE stock_status='sold' AND stock_quantity<>0;

UPDATE product_offers offer
SET stock_status='sold',stock_quantity=0,updated_at=now()
FROM products product
WHERE product.id=offer.product AND product.stock_status='sold'
  AND (offer.stock_status IS DISTINCT FROM 'sold' OR offer.stock_quantity<>0);

UPDATE directus_fields
SET options='{"choices":[{"text":"В наличии","value":"available"},{"text":"Бронь","value":"reserved"},{"text":"Продано","value":"sold"},{"text":"Скрыто","value":"hidden"}]}'::json,
    note='Статус «Продано» оставляет карточку публичной, обнуляет её остаток и все предложения магазинов. Для полного скрытия используйте «Скрыто».'
WHERE collection='products' AND field='stock_status';

UPDATE directus_fields
SET options='{"choices":[{"text":"В наличии","value":"available"},{"text":"Бронь","value":"reserved"},{"text":"Продано","value":"sold"},{"text":"Скрыто","value":"hidden"}]}'::json,
    note='Предложение синхронизируется с товаром. Если карточка товара продана, остаток предложения всегда равен нулю.'
WHERE collection='product_offers' AND field='stock_status';

DELETE FROM directus_presets preset
USING directus_roles role
WHERE preset.role=role.id
  AND role.name IN ('Administrator','ISVOI Editor','ISVOI Advanced Editor')
  AND preset."user" IS NULL
  AND preset.collection='products'
  AND preset.bookmark IN ('Продано или скрыто','Продано','Скрыто');

INSERT INTO directus_presets(
  bookmark,role,"user",collection,layout,layout_query,filter,icon,color
)
SELECT
  view.bookmark,role.id,NULL,'products','tabular',
  json_build_object('tabular',json_build_object(
    'sort',view.sort,'fields',view.fields,'page',1
  )),
  view.filter,view.icon,view.color
FROM directus_roles role
CROSS JOIN (VALUES
  (
    'Продано','sell','#64748b',
    '{"stock_status":{"_eq":"sold"}}'::json,
    '["title","sku","condition","status","stock_quantity","offers","updated_at"]'::json,
    '["-updated_at"]'::json
  ),
  (
    'Скрыто','visibility_off','#475569',
    '{"stock_status":{"_eq":"hidden"}}'::json,
    '["title","sku","condition","status","content_status","updated_at"]'::json,
    '["-updated_at"]'::json
  )
) AS view(bookmark,icon,color,filter,fields,sort)
WHERE role.name IN ('Administrator','ISVOI Editor','ISVOI Advanced Editor');

${
  rollback
    ? "ROLLBACK;\nSELECT 'sold_status_v9.rollback' AS check_name,'ok' AS value;"
    : `COMMIT;

SELECT 'sold_status_v9.triggers_missing' AS check_name,count(*)::text AS value
FROM (VALUES
  ('products_sold_guard'),('products_sync_sold_offers'),('product_offers_sold_guard')
) expected(trigger_name)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_trigger
  WHERE tgname=expected.trigger_name AND NOT tgisinternal
)
UNION ALL
SELECT 'sold_status_v9.labels_missing',count(*)::text
FROM (VALUES ('products'),('product_offers')) expected(collection)
WHERE NOT EXISTS (
  SELECT 1
  FROM directus_fields field
  CROSS JOIN LATERAL jsonb_array_elements(field.options::jsonb->'choices') choice
  WHERE field.collection=expected.collection AND field.field='stock_status'
    AND choice->>'value'='sold' AND choice->>'text'='Продано'
)
UNION ALL
SELECT 'sold_status_v9.bookmarks_missing',count(*)::text
FROM (VALUES ('Administrator'),('ISVOI Editor'),('ISVOI Advanced Editor')) role(name)
CROSS JOIN (VALUES ('Продано'),('Скрыто')) view(bookmark)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_presets preset
  JOIN directus_roles actual_role ON actual_role.id=preset.role
  WHERE actual_role.name=role.name AND preset."user" IS NULL
    AND preset.collection='products' AND preset.bookmark=view.bookmark
)
UNION ALL
SELECT 'sold_status_v9.sold_product_stock',count(*)::text
FROM products WHERE stock_status='sold' AND stock_quantity<>0
UNION ALL
SELECT 'sold_status_v9.sold_offer_stock',count(*)::text
FROM product_offers offer
JOIN products product ON product.id=offer.product
WHERE product.stock_status='sold'
  AND (offer.stock_status<>'sold' OR offer.stock_quantity<>0);`
}
`);
