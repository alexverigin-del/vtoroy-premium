#!/usr/bin/env node
/** Atomically publish the reviewed Trade-in pricing v3 snapshot. */

import {
  TRADE_PRICING_VERSION_V3,
  tradeConditionRules,
  tradePricingConfigsV3,
} from "./trade_pricing_v3_data.mjs";

const rehearse = process.argv.includes("--rehearse");
const sqlText = (value) => (value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`);
const bool = (value) => (value ? "true" : "false");

const configValues = tradePricingConfigsV3
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
  ? "ROLLBACK;\nSELECT 'trade_pricing_v3_publish.rehearsal' AS check_name,'rolled_back' AS value;"
  : `COMMIT;
SELECT 'trade_pricing_v3_publish.version' AS check_name,version || ' · ' || status AS value
FROM trade_pricing_versions WHERE version=${sqlText(TRADE_PRICING_VERSION_V3)}
UNION ALL
SELECT 'trade_pricing_v3_publish.configs',count(*)::text
FROM trade_device_configs config JOIN trade_pricing_versions version ON version.id=config.pricing_version
WHERE version.version=${sqlText(TRADE_PRICING_VERSION_V3)} AND config.status='published'
UNION ALL
SELECT 'trade_pricing_v3_publish.rules',count(*)::text
FROM trade_condition_rules rule JOIN trade_pricing_versions version ON version.id=rule.pricing_version
WHERE version.version=${sqlText(TRADE_PRICING_VERSION_V3)} AND rule.status='published'
UNION ALL
SELECT 'trade_pricing_v3_publish.settings',settings.status || ' · ' || settings.quote_validity_days || ' days'
FROM trade_settings settings JOIN trade_pricing_versions version ON version.id=settings.active_pricing_version
WHERE settings.id=1 AND version.version=${sqlText(TRADE_PRICING_VERSION_V3)};`;

process.stdout.write(String.raw`\set ON_ERROR_STOP on
BEGIN;
LOCK TABLE trade_pricing_versions,trade_device_configs,trade_condition_rules,trade_settings IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE expected_trade_configs(
  model_slug varchar(255),storage varchar(80),base_min integer,base_max integer,sort integer
) ON COMMIT DROP;
INSERT INTO expected_trade_configs VALUES
  ${configValues};

CREATE TEMP TABLE expected_trade_rules(
  question_key varchar(80),question_label varchar(255),question_help text,question_sort integer,
  option_value varchar(32),option_label varchar(120),option_sort integer,delta_min integer,delta_max integer,
  factor_label varchar(255),factor_type varchar(32),manual_evaluation boolean,safety_stop boolean
) ON COMMIT DROP;
INSERT INTO expected_trade_rules VALUES
  ${ruleValues};

DO $$
DECLARE
  version_id uuid;
  current_status varchar(32);
  approver uuid;
  mismatch_count integer;
BEGIN
  SELECT id,status INTO version_id,current_status
  FROM trade_pricing_versions
  WHERE version=${sqlText(TRADE_PRICING_VERSION_V3)};

  IF version_id IS NULL OR current_status NOT IN ('draft','published') THEN
    RAISE EXCEPTION 'Trade-in pricing v3 must exist as draft or already-published snapshot';
  END IF;
  IF EXISTS(SELECT 1 FROM trade_pricing_versions WHERE status='published' AND id<>version_id) THEN
    RAISE EXCEPTION 'Another pricing version is already published';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM trade_settings settings
    JOIN store_locations store ON store.id=settings.default_store
    WHERE settings.id=1 AND settings.active_pricing_version=version_id
      AND settings.status=current_status AND settings.quote_validity_days=7
      AND settings.economics_status='approved' AND settings.tax_treatment_confirmed=true
      AND settings.primary_document_status='approved' AND settings.kkt_workflow_status='approved'
      AND settings.economics_approved_by IS NOT NULL AND settings.economics_approved_at IS NOT NULL
      AND settings.legal_status='approved' AND settings.legal_approved_by IS NOT NULL
      AND settings.legal_approved_at IS NOT NULL AND store.status='published'
  ) THEN
    RAISE EXCEPTION 'Trade-in settings, approvals or default store are not release-ready';
  END IF;

  SELECT coalesce(economics_approved_by,legal_approved_by) INTO approver
  FROM trade_settings WHERE id=1;
  IF NOT EXISTS(SELECT 1 FROM directus_users WHERE id=approver AND status='active') THEN
    RAISE EXCEPTION 'The recorded Trade-in approver is not an active Directus user';
  END IF;

  SELECT count(*) INTO mismatch_count
  FROM expected_trade_configs expected
  FULL JOIN (
    SELECT model.slug AS model_slug,config.storage,config.base_min,config.base_max,config.sort,config.status
    FROM trade_device_configs config
    JOIN device_models model ON model.id=config.device_model
    WHERE config.pricing_version=version_id
  ) actual USING(model_slug,storage)
  WHERE expected.model_slug IS NULL OR actual.model_slug IS NULL OR actual.status<>current_status
    OR expected.base_min<>actual.base_min OR expected.base_max<>actual.base_max OR expected.sort<>actual.sort;
  IF mismatch_count<>0 OR (SELECT count(*) FROM trade_device_configs WHERE pricing_version=version_id)<>24 THEN
    RAISE EXCEPTION 'Trade-in pricing v3 configuration snapshot differs from the approved 24 rows';
  END IF;

  SELECT count(*) INTO mismatch_count
  FROM expected_trade_rules expected
  FULL JOIN (
    SELECT question_key,question_label,question_help,question_sort,option_value,option_label,option_sort,
      delta_min,delta_max,factor_label,factor_type,manual_evaluation,safety_stop,status
    FROM trade_condition_rules WHERE pricing_version=version_id
  ) actual USING(question_key,option_value)
  WHERE expected.question_key IS NULL OR actual.question_key IS NULL OR actual.status<>current_status
    OR expected.question_label IS DISTINCT FROM actual.question_label
    OR expected.question_help IS DISTINCT FROM actual.question_help
    OR expected.question_sort<>actual.question_sort OR expected.option_label<>actual.option_label
    OR expected.option_sort<>actual.option_sort OR expected.delta_min<>actual.delta_min
    OR expected.delta_max<>actual.delta_max OR expected.factor_label IS DISTINCT FROM actual.factor_label
    OR expected.factor_type<>actual.factor_type OR expected.manual_evaluation<>actual.manual_evaluation
    OR expected.safety_stop<>actual.safety_stop;
  IF mismatch_count<>0 OR (SELECT count(*) FROM trade_condition_rules WHERE pricing_version=version_id)<>21 THEN
    RAISE EXCEPTION 'Trade-in pricing v3 rule snapshot differs from the approved 21 rows';
  END IF;

  IF current_status='draft' THEN
    UPDATE trade_device_configs SET status='published',updated_at=now() WHERE pricing_version=version_id;
    UPDATE trade_condition_rules SET status='published',updated_at=now() WHERE pricing_version=version_id;
    UPDATE trade_pricing_versions
      SET status='published',published_at=now(),published_by=approver,updated_at=now()
      WHERE id=version_id;
    UPDATE trade_settings SET status='published',updated_at=now()
      WHERE id=1 AND active_pricing_version=version_id;
  END IF;
END $$;

${finish}
`);
