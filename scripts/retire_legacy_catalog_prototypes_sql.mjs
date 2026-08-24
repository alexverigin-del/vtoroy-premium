#!/usr/bin/env node

process.stdout.write(String.raw`
BEGIN;

CREATE TEMP TABLE isvoi_retired_catalog_products(id varchar(255) PRIMARY KEY) ON COMMIT DROP;
INSERT INTO isvoi_retired_catalog_products(id)
VALUES ('iphone-13-pro'),('iphone-14'),('macbook-air-m1'),('ipad-air');

UPDATE club_offers offer
SET status='archived', offer_status='archived', updated_at=now()
WHERE offer.product IN (SELECT id FROM isvoi_retired_catalog_products)
  AND (offer.status<>'archived' OR offer.offer_status<>'archived');

UPDATE product_offers offer
SET status='archived', stock_status='hidden', stock_quantity=0, updated_at=now()
WHERE offer.product IN (SELECT id FROM isvoi_retired_catalog_products)
  AND (offer.status<>'archived' OR offer.stock_status<>'hidden' OR offer.stock_quantity<>0);

UPDATE product_images image
SET status='archived', updated_at=now()
WHERE image.product IN (SELECT id FROM isvoi_retired_catalog_products)
  AND image.status<>'archived';

UPDATE products product
SET status='archived',
    content_status='review',
    stock_status='hidden',
    stock_quantity=0,
    admin_note=concat_ws(E'\n', nullif(product.admin_note,''),
      'Архивировано при переходе на Catalog V3: legacy-прототип без подтверждённой складской строки, даты и исполнителя диагностики.'),
    updated_at=now()
WHERE product.id IN (SELECT id FROM isvoi_retired_catalog_products)
  AND (
    product.status<>'archived' OR product.content_status<>'review' OR
    product.stock_status<>'hidden' OR product.stock_quantity<>0
  );

UPDATE device_images image
SET status='archived', updated_at=now()
WHERE image.device IN (SELECT id FROM isvoi_retired_catalog_products)
  AND image.status<>'archived';

UPDATE devices device
SET status='archived', content_status='review', stock_status='hidden',
    admin_note=concat_ws(E'\n', nullif(device.admin_note,''),
      'Архивировано при переходе на Catalog V3: иллюстративная legacy-карточка, не подтверждённая складским контуром.'),
    updated_at=now()
WHERE device.id IN (SELECT id FROM isvoi_retired_catalog_products)
  AND (
    device.status<>'archived' OR device.content_status<>'review' OR device.stock_status<>'hidden'
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM products product
    JOIN isvoi_retired_catalog_products retired ON retired.id=product.id
    WHERE product.status<>'archived' OR product.stock_status<>'hidden' OR product.stock_quantity<>0
  ) THEN
    RAISE EXCEPTION 'Catalog V3 prototype retirement validation failed for products';
  END IF;
  IF EXISTS (
    SELECT 1 FROM devices device
    JOIN isvoi_retired_catalog_products retired ON retired.id=device.id
    WHERE device.status<>'archived' OR device.stock_status<>'hidden'
  ) THEN
    RAISE EXCEPTION 'Catalog V3 prototype retirement validation failed for legacy devices';
  END IF;
END $$;

COMMIT;

SELECT 'catalog_v3.retired.products', count(*)::text
FROM products WHERE id IN ('iphone-13-pro','iphone-14','macbook-air-m1','ipad-air') AND status='archived'
UNION ALL
SELECT 'catalog_v3.retired.devices', count(*)::text
FROM devices WHERE id IN ('iphone-13-pro','iphone-14','macbook-air-m1','ipad-air') AND status='archived'
UNION ALL
SELECT 'catalog_v3.retired.product_offers', count(*)::text
FROM product_offers WHERE product IN ('iphone-13-pro','iphone-14','macbook-air-m1','ipad-air') AND status='archived'
UNION ALL
SELECT 'catalog_v3.retired.club_offers', count(*)::text
FROM club_offers WHERE product IN ('iphone-13-pro','iphone-14','macbook-air-m1','ipad-air') AND status='archived';
`);
