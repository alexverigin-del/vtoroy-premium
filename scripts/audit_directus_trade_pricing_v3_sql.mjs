#!/usr/bin/env node

import { TRADE_PRICING_VERSION_V3, tradePricingConfigsV3 } from "./trade_pricing_v3_data.mjs";

const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`;
const expectedValues = tradePricingConfigsV3
  .map(
    (item) =>
      `(${sqlText(item.modelSlug)},${sqlText(item.storage)},${item.baseMin},${item.baseMax},${item.sort})`,
  )
  .join(",\n  ");

process.stdout.write(String.raw`
WITH expected(model_slug,storage,base_min,base_max,sort) AS (VALUES
  ${expectedValues}
), actual AS (
  SELECT model.slug AS model_slug,config.storage,config.base_min,config.base_max,config.sort,config.status
  FROM trade_device_configs config
  JOIN trade_pricing_versions version ON version.id=config.pricing_version
  JOIN device_models model ON model.id=config.device_model
  WHERE version.version=${sqlText(TRADE_PRICING_VERSION_V3)} AND version.status='draft'
), config_mismatches AS (
  SELECT expected.model_slug AS expected_model,actual.model_slug AS actual_model
  FROM expected FULL JOIN actual USING(model_slug,storage)
  WHERE expected.model_slug IS NULL OR actual.model_slug IS NULL OR actual.status<>'draft'
    OR expected.base_min<>actual.base_min OR expected.base_max<>actual.base_max OR expected.sort<>actual.sort
)
SELECT 'trade_pricing_v3.version_missing' AS check_name,(1-count(*))::text AS value
FROM trade_pricing_versions WHERE version=${sqlText(TRADE_PRICING_VERSION_V3)} AND status='draft'
UNION ALL
SELECT 'trade_pricing_v3.config_mismatches',count(*)::text FROM config_mismatches
UNION ALL
SELECT 'trade_pricing_v3.rules_invalid',
  CASE WHEN count(*)=21 AND count(*) FILTER(WHERE rule.status='draft')=21 THEN '0' ELSE '1' END
FROM trade_condition_rules rule JOIN trade_pricing_versions version ON version.id=rule.pricing_version
WHERE version.version=${sqlText(TRADE_PRICING_VERSION_V3)} AND version.status='draft'
UNION ALL
SELECT 'trade_pricing_v3.settings_invalid',(1-count(*))::text
FROM trade_settings settings
JOIN trade_pricing_versions version ON version.id=settings.active_pricing_version
JOIN store_locations store ON store.id=settings.default_store
WHERE settings.id=1 AND settings.status='draft' AND settings.quote_validity_days=7
  AND version.version=${sqlText(TRADE_PRICING_VERSION_V3)} AND version.status='draft'
  AND store.status='published'
UNION ALL
SELECT 'trade_pricing_v3.published_rows',
  ((SELECT count(*) FROM trade_pricing_versions WHERE status='published')
   +(SELECT count(*) FROM trade_device_configs WHERE status='published')
   +(SELECT count(*) FROM trade_condition_rules WHERE status='published'))::text
UNION ALL
SELECT 'trade_pricing_v3.previous_v2_invalid',
  CASE WHEN
    (SELECT count(*) FROM trade_pricing_versions WHERE version='trade-pricing-v2-draft' AND status='draft')=1
    AND (SELECT count(*) FROM trade_device_configs config JOIN trade_pricing_versions version ON version.id=config.pricing_version WHERE version.version='trade-pricing-v2-draft' AND config.status='draft')=19
    AND (SELECT count(*) FROM trade_condition_rules rule JOIN trade_pricing_versions version ON version.id=rule.pricing_version WHERE version.version='trade-pricing-v2-draft' AND rule.status='draft')=21
  THEN '0' ELSE '1' END;
`);
