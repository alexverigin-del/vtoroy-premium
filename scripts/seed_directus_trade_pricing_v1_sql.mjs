#!/usr/bin/env node

import {
  TRADE_PRICING_REFERENCE_DATE,
  TRADE_PRICING_REFERENCE_URL,
  TRADE_PRICING_VERSION,
  tradeConditionRules,
  tradePricingConfigs,
} from "./trade_pricing_v1_data.mjs";

const rehearse = process.argv.includes("--rehearse");
const sqlText = (value) => (value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`);
const bool = (value) => (value ? "true" : "false");

const configValues = tradePricingConfigs
  .map(
    (item) =>
      `(${sqlText(item.modelSlug)},${sqlText(item.storage)},${item.baseMin},${item.baseMax},${item.sort})`,
  )
  .join(",\n  ");

const ruleValues = tradeConditionRules
  .map(
    (item) =>
      `(${[
        sqlText(item.questionKey),
        sqlText(item.questionLabel),
        sqlText(item.questionHelp),
        item.questionSort,
        sqlText(item.optionValue),
        sqlText(item.optionLabel),
        item.optionSort,
        item.deltaMin,
        item.deltaMax,
        sqlText(item.factorLabel),
        sqlText(item.factorType),
        bool(item.manualEvaluation),
        bool(item.safetyStop),
      ].join(",")})`,
  )
  .join(",\n  ");

const finish = rehearse
  ? `ROLLBACK;\nSELECT 'trade_pricing_v1.rehearsal' AS check_name,'rolled_back' AS value;`
  : `COMMIT;

SELECT 'trade_pricing_v1.version' AS check_name,count(*)::text AS value
FROM trade_pricing_versions WHERE version=${sqlText(TRADE_PRICING_VERSION)} AND status='draft'
UNION ALL
SELECT 'trade_pricing_v1.configs',count(*)::text
FROM trade_device_configs c JOIN trade_pricing_versions v ON v.id=c.pricing_version
WHERE v.version=${sqlText(TRADE_PRICING_VERSION)} AND c.status='draft'
UNION ALL
SELECT 'trade_pricing_v1.rules',count(*)::text
FROM trade_condition_rules r JOIN trade_pricing_versions v ON v.id=r.pricing_version
WHERE v.version=${sqlText(TRADE_PRICING_VERSION)} AND r.status='draft'
UNION ALL
SELECT 'trade_pricing_v1.settings_draft',count(*)::text
FROM trade_settings s JOIN trade_pricing_versions v ON v.id=s.active_pricing_version
WHERE s.id=1 AND s.status='draft' AND s.quote_validity_days=7
  AND v.version=${sqlText(TRADE_PRICING_VERSION)};`;

process.stdout.write(String.raw`\set ON_ERROR_STOP on
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF to_regclass('public.trade_pricing_versions') IS NULL THEN
    RAISE EXCEPTION 'Trade-in schema is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM product_brands WHERE slug='apple') THEN
    RAISE EXCEPTION 'Apple brand is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM store_locations WHERE slug='belgorod' AND status='published') THEN
    RAISE EXCEPTION 'Published Belgorod store is missing';
  END IF;
END $$;

INSERT INTO device_models(slug,brand,name,family,year,is_active,sort)
SELECT 'iphone-13-pro',brand.id,'iPhone 13 Pro','iPhone',2021,true,130
FROM product_brands brand WHERE brand.slug='apple'
ON CONFLICT(slug) DO UPDATE SET
  name=EXCLUDED.name,family=EXCLUDED.family,year=EXCLUDED.year,is_active=true,sort=EXCLUDED.sort,updated_at=now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM device_models model JOIN product_brands brand ON brand.id=model.brand
    WHERE model.slug='iphone-13-pro' AND brand.slug='apple'
  ) THEN
    RAISE EXCEPTION 'iphone-13-pro conflicts with a non-Apple model';
  END IF;
END $$;

INSERT INTO trade_pricing_versions(version,status,published_at,published_by,change_reason)
VALUES (
  ${sqlText(TRADE_PRICING_VERSION)},'draft',NULL,NULL,
  ${sqlText(`Draft benchmark based on public maximum-grade Trade-in offers at ${TRADE_PRICING_REFERENCE_URL}, checked ${TRADE_PRICING_REFERENCE_DATE}. Requires Trade Desk approval before publication.`)}
)
ON CONFLICT(version) DO UPDATE SET
  change_reason=EXCLUDED.change_reason,updated_at=now()
WHERE trade_pricing_versions.status='draft';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM trade_pricing_versions
    WHERE version=${sqlText(TRADE_PRICING_VERSION)} AND status='draft'
  ) THEN
    RAISE EXCEPTION 'Pricing version exists but is not draft';
  END IF;
END $$;

WITH seed(model_slug,storage,base_min,base_max,sort) AS (VALUES
  ${configValues}
)
INSERT INTO trade_device_configs(status,pricing_version,device_model,storage,base_min,base_max,sort)
SELECT 'draft',version.id,model.id,seed.storage,seed.base_min,seed.base_max,seed.sort
FROM seed
JOIN device_models model ON model.slug=seed.model_slug
JOIN trade_pricing_versions version ON version.version=${sqlText(TRADE_PRICING_VERSION)}
ON CONFLICT(pricing_version,device_model,storage) DO UPDATE SET
  status='draft',base_min=EXCLUDED.base_min,base_max=EXCLUDED.base_max,sort=EXCLUDED.sort,updated_at=now();

WITH seed(
  question_key,question_label,question_help,question_sort,
  option_value,option_label,option_sort,delta_min,delta_max,
  factor_label,factor_type,manual_evaluation,safety_stop
) AS (VALUES
  ${ruleValues}
)
INSERT INTO trade_condition_rules(
  status,pricing_version,question_key,question_label,question_help,question_sort,
  option_value,option_label,option_sort,delta_min,delta_max,factor_label,factor_type,
  manual_evaluation,safety_stop
)
SELECT
  'draft',version.id,seed.question_key,seed.question_label,seed.question_help,seed.question_sort,
  seed.option_value,seed.option_label,seed.option_sort,seed.delta_min,seed.delta_max,
  seed.factor_label,seed.factor_type,seed.manual_evaluation,seed.safety_stop
FROM seed
JOIN trade_pricing_versions version ON version.version=${sqlText(TRADE_PRICING_VERSION)}
ON CONFLICT(pricing_version,question_key,option_value) DO UPDATE SET
  status='draft',question_label=EXCLUDED.question_label,question_help=EXCLUDED.question_help,
  question_sort=EXCLUDED.question_sort,option_label=EXCLUDED.option_label,option_sort=EXCLUDED.option_sort,
  delta_min=EXCLUDED.delta_min,delta_max=EXCLUDED.delta_max,factor_label=EXCLUDED.factor_label,
  factor_type=EXCLUDED.factor_type,manual_evaluation=EXCLUDED.manual_evaluation,
  safety_stop=EXCLUDED.safety_stop,updated_at=now();

INSERT INTO trade_settings(id,status,active_pricing_version,quote_validity_days,default_store,updated_at)
SELECT 1,'draft',version.id,7,store.id,now()
FROM trade_pricing_versions version
CROSS JOIN LATERAL (
  SELECT id FROM store_locations WHERE slug='belgorod' AND status='published' LIMIT 1
) store
WHERE version.version=${sqlText(TRADE_PRICING_VERSION)}
ON CONFLICT(id) DO UPDATE SET
  status='draft',active_pricing_version=EXCLUDED.active_pricing_version,
  quote_validity_days=7,default_store=EXCLUDED.default_store,updated_at=now();

${finish}
`);
