#!/usr/bin/env node

process.stdout.write(String.raw`
WITH normalized_inventory AS (
  SELECT
    product,
    max(purchase_price) FILTER (WHERE purchase_price > 0) AS purchase_price,
    max(retail_price) FILTER (WHERE retail_price > 0) AS inventory_retail_price,
    max(quantity) AS inventory_quantity,
    max(eligibility_status) AS eligibility_status,
    max(identity_status) AS identity_status
  FROM inventory_items
  WHERE product IS NOT NULL
  GROUP BY product
), normalized AS (
  SELECT
    product.id::text AS candidate_key,
    'normalized_product'::text AS candidate_source,
    model.slug::text AS model_slug,
    details.storage::text AS storage,
    coalesce(details.grade,'')::text AS grade,
    coalesce(details.battery_text,'')::text AS battery_text,
    details.diagnostic_date::text AS diagnostic_date,
    coalesce(passport.diagnostics_status,'')::text AS diagnostics_status,
    coalesce(passport.repair,'')::text AS repair,
    coalesce(passport.water,'')::text AS water,
    product.status::text AS product_status,
    product.stock_status::text AS stock_status,
    product.stock_quantity::integer AS quantity,
    product.price::numeric AS listing_price,
    inventory.purchase_price::numeric AS purchase_price,
    coalesce(inventory.eligibility_status,'')::text AS eligibility_status,
    coalesce(inventory.identity_status,'')::text AS identity_status,
    CASE WHEN details.diagnostic_date IS NOT NULL AND passport.diagnostics_status='Проверено'
      THEN true ELSE false END AS diagnostics_complete,
    0 AS source_rank,
    row_number() OVER (ORDER BY details.diagnostic_date DESC NULLS LAST, product.updated_at DESC, product.id) AS row_rank
  FROM products product
  JOIN device_models model ON model.id=product.device_model
  JOIN device_details details ON details.product=product.id
  LEFT JOIN device_passports passport ON passport.product=product.id
  LEFT JOIN normalized_inventory inventory ON inventory.product=product.id
  WHERE product.product_type='device'
    AND product.condition='used'
    AND model.slug IN (
      'iphone-13-pro','iphone-14-pro','iphone-14-pro-max','iphone-16-pro','iphone-16-pro-max'
    )
    AND product.price > 0
    AND inventory.purchase_price > 0
), unmatched_raw AS (
  SELECT
    md5(item.source_system || ':' || item.source_id)::text AS candidate_key,
    'pending_inventory'::text AS candidate_source,
    CASE
      WHEN item.source_title ~* 'iphone[[:space:]]+16[[:space:]]+pro[[:space:]]+max' THEN 'iphone-16-pro-max'
      WHEN item.source_title ~* 'iphone[[:space:]]+16[[:space:]]+pro' THEN 'iphone-16-pro'
      WHEN item.source_title ~* 'iphone[[:space:]]+14[[:space:]]+pro[[:space:]]+max' THEN 'iphone-14-pro-max'
      WHEN item.source_title ~* 'iphone[[:space:]]+14[[:space:]]+pro' THEN 'iphone-14-pro'
      WHEN item.source_title ~* 'iphone[[:space:]]+13[[:space:]]+pro' THEN 'iphone-13-pro'
      ELSE NULL
    END::text AS model_slug,
    CASE
      WHEN item.source_title ~* '1[[:space:]]*(тб|tb)' THEN '1 ТБ'
      WHEN item.source_title ~* '512[[:space:]]*(гб|gb)' THEN '512 ГБ'
      WHEN item.source_title ~* '256[[:space:]]*(гб|gb)' THEN '256 ГБ'
      WHEN item.source_title ~* '128[[:space:]]*(гб|gb)' THEN '128 ГБ'
      ELSE NULL
    END::text AS storage,
    ''::text AS grade,
    ''::text AS battery_text,
    ''::text AS diagnostic_date,
    ''::text AS diagnostics_status,
    ''::text AS repair,
    ''::text AS water,
    ''::text AS product_status,
    ''::text AS stock_status,
    item.quantity::integer AS quantity,
    item.retail_price::numeric AS listing_price,
    item.purchase_price::numeric AS purchase_price,
    item.eligibility_status::text AS eligibility_status,
    item.identity_status::text AS identity_status,
    false AS diagnostics_complete,
    1 AS source_rank,
    row_number() OVER (
      PARTITION BY
        CASE
          WHEN item.source_title ~* 'iphone[[:space:]]+16[[:space:]]+pro[[:space:]]+max' THEN 'iphone-16-pro-max'
          WHEN item.source_title ~* 'iphone[[:space:]]+16[[:space:]]+pro' THEN 'iphone-16-pro'
          WHEN item.source_title ~* 'iphone[[:space:]]+14[[:space:]]+pro[[:space:]]+max' THEN 'iphone-14-pro-max'
          WHEN item.source_title ~* 'iphone[[:space:]]+14[[:space:]]+pro' THEN 'iphone-14-pro'
          WHEN item.source_title ~* 'iphone[[:space:]]+13[[:space:]]+pro' THEN 'iphone-13-pro'
        END,
        CASE
          WHEN item.source_title ~* '1[[:space:]]*(тб|tb)' THEN '1 ТБ'
          WHEN item.source_title ~* '512[[:space:]]*(гб|gb)' THEN '512 ГБ'
          WHEN item.source_title ~* '256[[:space:]]*(гб|gb)' THEN '256 ГБ'
          WHEN item.source_title ~* '128[[:space:]]*(гб|gb)' THEN '128 ГБ'
        END
      ORDER BY item.updated_at DESC, md5(item.source_system || ':' || item.source_id)
    ) AS row_rank
  FROM inventory_items item
  WHERE item.product IS NULL
    AND item.condition='used'
    AND item.quantity > 0
    AND item.purchase_price > 0
    AND item.retail_price > 0
    AND item.source_title ~* 'iphone[[:space:]]+(13[[:space:]]+pro|14[[:space:]]+pro([[:space:]]+max)?|16[[:space:]]+pro([[:space:]]+max)?)'
), candidates AS (
  SELECT * FROM normalized
  UNION ALL
  SELECT * FROM unmatched_raw WHERE model_slug IS NOT NULL AND storage IS NOT NULL AND row_rank=1
)
SELECT
  candidate_key,candidate_source,model_slug,storage,grade,battery_text,diagnostic_date,
  diagnostics_status,repair,water,product_status,stock_status,quantity,
  listing_price,purchase_price,eligibility_status,identity_status,diagnostics_complete
FROM candidates
ORDER BY source_rank,row_rank,candidate_key
LIMIT 10;
`);
