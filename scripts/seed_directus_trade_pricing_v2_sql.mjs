#!/usr/bin/env node

import {
  TRADE_PRICING_CHANGE_REASON_V2,
  TRADE_PRICING_REFERENCE_DATE_V2,
  TRADE_PRICING_VERSION_V2,
  tradeConditionRules,
  tradePricingConfigsV2,
} from "./trade_pricing_v2_data.mjs";

const rehearse = process.argv.includes("--rehearse");
const sqlText = (value) => (value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`);
const bool = (value) => (value ? "true" : "false");

const configValues = tradePricingConfigsV2
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
  ? `ROLLBACK;\nSELECT 'trade_pricing_v2.rehearsal' AS check_name,'rolled_back' AS value;`
  : `COMMIT;

SELECT 'trade_pricing_v2.version' AS check_name,count(*)::text AS value
FROM trade_pricing_versions WHERE version=${sqlText(TRADE_PRICING_VERSION_V2)} AND status='draft'
UNION ALL
SELECT 'trade_pricing_v2.configs',count(*)::text
FROM trade_device_configs c JOIN trade_pricing_versions v ON v.id=c.pricing_version
WHERE v.version=${sqlText(TRADE_PRICING_VERSION_V2)} AND c.status='draft'
UNION ALL
SELECT 'trade_pricing_v2.rules',count(*)::text
FROM trade_condition_rules r JOIN trade_pricing_versions v ON v.id=r.pricing_version
WHERE v.version=${sqlText(TRADE_PRICING_VERSION_V2)} AND r.status='draft'
UNION ALL
SELECT 'trade_pricing_v2.settings_draft',count(*)::text
FROM trade_settings s JOIN trade_pricing_versions v ON v.id=s.active_pricing_version
WHERE s.id=1 AND s.status='draft' AND s.quote_validity_days=7
  AND v.version=${sqlText(TRADE_PRICING_VERSION_V2)}
UNION ALL
SELECT 'trade_pricing_v2.published_rows',
  ((SELECT count(*) FROM trade_pricing_versions WHERE status='published')
   +(SELECT count(*) FROM trade_device_configs WHERE status='published')
   +(SELECT count(*) FROM trade_condition_rules WHERE status='published'))::text
UNION ALL
SELECT 'trade_pricing_v2.previous_draft_preserved',count(*)::text
FROM trade_pricing_versions WHERE version='trade-mvp-2026-08-29-draft' AND status='draft';`;

process.stdout.write(String.raw`\set ON_ERROR_STOP on
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF to_regclass('public.trade_pricing_versions') IS NULL THEN
    RAISE EXCEPTION 'Trade-in schema is missing';
  END IF;
  IF (SELECT count(*) FROM device_models WHERE is_active=true AND slug IN (
    'iphone-13-pro','iphone-14-pro','iphone-14-pro-max','iphone-16-pro','iphone-16-pro-max'
  )) <> 5 THEN
    RAISE EXCEPTION 'One or more pilot device models are missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM trade_settings WHERE id=1 AND status='draft') THEN
    RAISE EXCEPTION 'Trade settings must exist and remain draft';
  END IF;
END $$;

INSERT INTO trade_pricing_versions(version,status,published_at,published_by,change_reason)
VALUES (
  ${sqlText(TRADE_PRICING_VERSION_V2)},'draft',NULL,NULL,
  ${sqlText(`${TRADE_PRICING_CHANGE_REASON_V2} Benchmark date: ${TRADE_PRICING_REFERENCE_DATE_V2}.`)}
)
ON CONFLICT(version) DO UPDATE SET
  change_reason=EXCLUDED.change_reason,updated_at=now()
WHERE trade_pricing_versions.status='draft';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM trade_pricing_versions
    WHERE version=${sqlText(TRADE_PRICING_VERSION_V2)} AND status='draft'
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
JOIN trade_pricing_versions version ON version.version=${sqlText(TRADE_PRICING_VERSION_V2)}
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
JOIN trade_pricing_versions version ON version.version=${sqlText(TRADE_PRICING_VERSION_V2)}
ON CONFLICT(pricing_version,question_key,option_value) DO UPDATE SET
  status='draft',question_label=EXCLUDED.question_label,question_help=EXCLUDED.question_help,
  question_sort=EXCLUDED.question_sort,option_label=EXCLUDED.option_label,option_sort=EXCLUDED.option_sort,
  delta_min=EXCLUDED.delta_min,delta_max=EXCLUDED.delta_max,factor_label=EXCLUDED.factor_label,
  factor_type=EXCLUDED.factor_type,manual_evaluation=EXCLUDED.manual_evaluation,
  safety_stop=EXCLUDED.safety_stop,updated_at=now();

UPDATE trade_settings settings
SET status='draft',active_pricing_version=version.id,quote_validity_days=7,updated_at=now()
FROM trade_pricing_versions version
WHERE settings.id=1 AND version.version=${sqlText(TRADE_PRICING_VERSION_V2)};

${finish}
`);
