#!/usr/bin/env node

process.stdout.write(String.raw`
WITH public_candidates AS (
  SELECT
    product.id::text AS candidate_key,
    'public_catalog'::text AS candidate_source,
    model.slug::text AS model_slug,
    details.storage::text AS storage,
    coalesce(details.grade,'')::text AS grade,
    coalesce(details.battery_text,'')::text AS battery_text,
    details.diagnostic_date::text AS diagnostic_date,
    coalesce(passport.diagnostics_status,'')::text AS diagnostics_status,
    coalesce(passport.repair,'')::text AS repair,
    coalesce(passport.water,'')::text AS water,
    product.status::text AS product_status,
    product.content_status::text AS content_status,
    product.stock_status::text AS stock_status,
    product.stock_quantity::integer AS quantity,
    product.price::numeric AS listing_price,
    inventory.purchase_price::numeric AS purchase_price,
    inventory.eligibility_status::text AS eligibility_status,
    inventory.identity_status::text AS identity_status,
    inventory.authenticity_status::text AS authenticity_status,
    inventory.review_override::boolean AS review_override,
    (nullif(inventory.review_note,'') IS NOT NULL)::boolean AS review_note_present,
    coalesce(inventory.block_reason,'')::text AS block_reason,
    true AS offer_ready,
    CASE WHEN details.diagnostic_date IS NOT NULL AND passport.diagnostics_status='Проверено'
      THEN true ELSE false END AS diagnostics_complete
  FROM products product
  JOIN device_models model ON model.id=product.device_model
  JOIN device_details details ON details.product=product.id
  JOIN device_passports passport ON passport.product=product.id
  JOIN LATERAL (
    SELECT
      item.purchase_price,item.eligibility_status,item.identity_status,item.authenticity_status,
      item.review_override,item.review_note,item.block_reason
    FROM inventory_items item
    WHERE item.product=product.id AND item.quantity>0 AND item.purchase_price>0
    ORDER BY item.updated_at DESC NULLS LAST,item.id
    LIMIT 1
  ) inventory ON true
  WHERE product.status='published'
    AND product.content_status='ready'
    AND product.product_type='device'
    AND product.condition='used'
    AND product.stock_status<>'hidden'
    AND product.stock_quantity>0
    AND product.price>0
    AND EXISTS (
      SELECT 1 FROM product_offers offer
      WHERE offer.product=product.id AND offer.status='published'
        AND offer.stock_status='available' AND offer.stock_quantity>0
    )
)
SELECT
  candidate_key,candidate_source,model_slug,storage,grade,battery_text,diagnostic_date,
  diagnostics_status,repair,water,product_status,content_status,stock_status,quantity,
  listing_price,purchase_price,eligibility_status,identity_status,authenticity_status,
  review_override,review_note_present,block_reason,offer_ready,diagnostics_complete
FROM public_candidates
ORDER BY model_slug,storage,candidate_key;
`);
