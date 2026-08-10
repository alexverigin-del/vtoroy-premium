#!/usr/bin/env node
/** Print idempotent Manual Flows for inventory snapshot dry-run and apply. */

const secret = process.env.INVENTORY_IMPORT_WEBHOOK_SECRET || "";
const webhookUrl =
  process.env.INVENTORY_IMPORT_WEBHOOK_URL || "https://isvoi.ru/api/admin/inventory-import/run";

if (!secret) {
  console.error("INVENTORY_IMPORT_WEBHOOK_SECRET must be set.");
  process.exit(1);
}

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const flowOptions = JSON.stringify({
  collections: ["inventory_import_batches"],
  location: "item",
  requireSelection: false,
});

function requestOptions(apply) {
  return JSON.stringify({
    url: webhookUrl,
    method: "POST",
    headers: [
      { header: "Content-Type", value: "application/json" },
      { header: "x-isvoi-import-secret", value: secret },
    ],
    body: JSON.stringify({ batch_id: "{{$trigger.key}}", apply }),
  });
}

process.stdout.write(String.raw`
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION isvoi_inventory_manual_flow(
  p_name text, p_icon text, p_color text, p_description text,
  p_key text, p_operation_name text, p_operation_options json
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_flow uuid; v_operation uuid;
BEGIN
  SELECT id INTO v_flow FROM directus_flows WHERE name=p_name LIMIT 1;
  IF v_flow IS NULL THEN
    v_flow := gen_random_uuid();
    INSERT INTO directus_flows(
      id,name,icon,color,description,status,trigger,accountability,options,date_created
    ) VALUES(
      v_flow,p_name,p_icon,p_color,p_description,'active','manual','all',${sql(flowOptions)}::json,now()
    );
  ELSE
    UPDATE directus_flows SET icon=p_icon,color=p_color,description=p_description,
      status='active',trigger='manual',accountability='all',options=${sql(flowOptions)}::json
    WHERE id=v_flow;
  END IF;

  SELECT id INTO v_operation FROM directus_operations WHERE flow=v_flow AND key=p_key LIMIT 1;
  IF v_operation IS NULL THEN
    v_operation := gen_random_uuid();
    INSERT INTO directus_operations(
      id,name,key,type,position_x,position_y,options,flow,date_created
    ) VALUES(v_operation,p_operation_name,p_key,'request',19,1,p_operation_options,v_flow,now());
  ELSE
    UPDATE directus_operations SET name=p_operation_name,type='request',options=p_operation_options
    WHERE id=v_operation;
  END IF;
  UPDATE directus_flows SET operation=v_operation WHERE id=v_flow;
END $$;

SELECT isvoi_inventory_manual_flow(
  'ISVOI: проверить товарный snapshot','fact_check','#2563eb',
  'Проверяет полную выгрузку и поступление без записи складских строк.',
  'isvoi_inventory_dry_run','Проверить snapshot',${sql(requestOptions(false))}::json
);
SELECT isvoi_inventory_manual_flow(
  'ISVOI: применить товарный snapshot','warehouse','#0f766e',
  'Записывает приватный staging; конфликтные товары не попадают в публичный каталог.',
  'isvoi_inventory_apply','Применить snapshot',${sql(requestOptions(true))}::json
);

DROP FUNCTION isvoi_inventory_manual_flow(text,text,text,text,text,text,json);
COMMIT;

SELECT 'inventory.flows.missing' AS check_name, (2-count(*))::text AS value
FROM directus_flows
WHERE name IN ('ISVOI: проверить товарный snapshot','ISVOI: применить товарный snapshot')
  AND status='active' AND trigger='manual';
`);
