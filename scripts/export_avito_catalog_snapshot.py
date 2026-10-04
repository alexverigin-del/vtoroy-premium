"""Read-only sanitized catalog evidence via SSH; no credentials or private identifiers exported."""

import argparse
import base64
import json
from pathlib import Path
import subprocess


SQL = r"""
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT jsonb_build_object(
 'captured_at', now(),
 'stores', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'slug',slug,
   'status',status,'city',city,'address',address)), '[]') FROM store_locations),
 'products', (SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',p.id,'sku',p.sku,'status',p.status,'content_status',p.content_status,
   'product_type',p.product_type,'condition',p.condition,'title',p.title,
   'model',p.model,'color',p.color,'price',p.price,'stock_quantity',p.stock_quantity,
   'stock_status',p.stock_status,'completeness',p.completeness,'warranty_text',p.warranty_text,
   'category',jsonb_build_object('id',c.id,'slug',c.slug,'name',c.name),
   'listing_file',p.listing_file,
   'device_details',(SELECT jsonb_agg(jsonb_build_object('storage',d.storage,'grade',d.grade,
      'battery',d.battery,'battery_cycles',d.battery_cycles,'diagnostic_date',d.diagnostic_date,
      'sim',d.sim,'activation_lock',d.activation_lock,'mdm',d.mdm))
      FROM device_details d WHERE d.product=p.id),
   'passports',(SELECT jsonb_agg(jsonb_build_object('diagnostics_status',dp.diagnostics_status,
      'condition_note',dp.condition_note,'condition_notes',dp.condition_notes,
      'repair',dp.repair,'water',dp.water,'summary_rows',dp.summary_rows,
      'diagnostics_checklist',dp.diagnostics_checklist,'story_facts',dp.story_facts))
      FROM device_passports dp WHERE dp.product=p.id),
   'reports',(SELECT jsonb_agg(jsonb_build_object('provider',r.provider,'tested_at',r.tested_at,
      'status',r.status,'public_file',r.public_file,'public_note',r.public_note))
      FROM device_diagnostic_reports r WHERE r.product=p.id),
   'images',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',pi.image,'role',pi.role,
      'sort',pi.sort,'label',pi.label) ORDER BY pi.sort,pi.id),'[]')
      FROM product_images pi WHERE pi.product=p.id AND pi.status='published'),
   'offers',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'location',l.slug,
      'status',o.status,'price',o.price,'stock_quantity',o.stock_quantity,'stock_status',o.stock_status)),'[]')
      FROM product_offers o JOIN store_locations l ON l.id=o.location WHERE o.product=p.id),
   'inventory',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'source_sku',i.source_sku,
      'quantity',i.quantity,'retail_price',i.retail_price,'identity_status',i.identity_status,
      'authenticity_status',i.authenticity_status,'eligibility_status',i.eligibility_status,
      'for_sale',i.for_sale,'review_override',i.review_override,
      'review_note_present',nullif(trim(i.review_note),'') IS NOT NULL,
      'serial_present',nullif(trim(i.serial_full),'') IS NOT NULL,
      'imei_present',nullif(trim(i.imei_full),'') IS NOT NULL,
      'duplicate_serial',nullif(trim(i.serial_full),'') IS NOT NULL AND EXISTS(
        SELECT 1 FROM inventory_items j WHERE j.id<>i.id AND upper(trim(j.serial_full))=upper(trim(i.serial_full))),
      'linked_receipts',(SELECT count(*) FROM inventory_receipt_lines rl WHERE rl.inventory_item=i.id),
      'exact_serial_receipts',(SELECT count(*) FROM inventory_receipt_lines rl
        WHERE nullif(trim(i.serial_full),'') IS NOT NULL AND upper(trim(rl.serial_full))=upper(trim(i.serial_full))),
      'open_issue_codes',(SELECT coalesce(jsonb_agg(DISTINCT iss.code),'[]') FROM inventory_import_issues iss
        WHERE iss.inventory_item=i.id AND NOT iss.resolved))), '[]') FROM inventory_items i WHERE i.product=p.id),
   'listings',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',cl.id,'channel',cl.channel,
      'status',cl.status,'external_id',cl.external_id,'title_override',cl.title_override,
      'description_override',cl.description_override,'price_override',cl.price_override,
      'attributes',(SELECT coalesce(jsonb_object_agg(a.key,a.value),'{}')
        FROM jsonb_each(CASE WHEN jsonb_typeof(cl.attributes)='object' THEN cl.attributes ELSE '{}'::jsonb END) a
        WHERE a.key IN ('AdType','Vendor','Model','MemorySize','Color','RamSize','BoxSealed',
          'Akb','DeviceFlaws','ScreenCondition','CaseCondition','Condition')),
      'category_mapping',cl.category_mapping,
      'mapping_confirmed',cm.is_confirmed,'mapping_active',cm.is_active,
      'mapping_version',cm.template_version)), '[]')
      FROM product_channel_listings cl LEFT JOIN channel_category_mappings cm ON cm.id=cl.category_mapping
      WHERE cl.product=p.id AND cl.channel='avito')
 ) ORDER BY p.sort,p.id),'[]') FROM products p LEFT JOIN product_categories c ON c.id=p.category
 WHERE p.product_type='device' OR EXISTS(SELECT 1 FROM device_details d WHERE d.product=p.id)),
 '_private_identifiers',(SELECT coalesce(jsonb_agg(v),'[]') FROM (
   SELECT serial_full v FROM inventory_items WHERE nullif(trim(serial_full),'') IS NOT NULL
   UNION SELECT imei_full FROM inventory_items WHERE nullif(trim(imei_full),'') IS NOT NULL
 ) identifiers)
);
ROLLBACK;
"""


def remote_source():
    return """
import json,re,subprocess,sys
sql = SQL_VALUE
r=subprocess.run(['docker','exec','-i','directus-beget-database-1','psql','-U','isvoi','-d','isvoi',
    '-v','ON_ERROR_STOP=1','-q','-A','-t'],input=sql.encode('utf-8'),capture_output=True,timeout=60)
if r.returncode: raise SystemExit('Read-only catalog query failed')
data=json.loads(r.stdout.decode('utf-8'))
normalize=lambda v:re.sub('[^A-Z0-9]','',v.upper())
private=[normalize(v) for v in data.pop('_private_identifiers') if len(normalize(v))>=8]
redactions=0
def scrub(value):
    global redactions
    if isinstance(value,dict): return {k:scrub(v) for k,v in value.items()}
    if isinstance(value,list): return [scrub(v) for v in value]
    if isinstance(value,str):
        normalized=normalize(value)
        if re.search(r'(?<!\\d)\\d{15}(?!\\d)',value) or any(v in normalized for v in private):
            redactions+=1
            return '[redacted: private identifier]'
    return value
data=scrub(data)
data['private_identifier_redactions']=redactions
print(json.dumps(data,ensure_ascii=True))
""".replace("SQL_VALUE", repr(SQL))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="deploy@217.114.14.32")
    parser.add_argument("--key", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    encoded = base64.b64encode(remote_source().encode("utf-8")).decode("ascii")
    command = "python3 -c 'import base64,sys; exec(base64.b64decode(sys.argv[1]))' " + encoded
    result = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15",
                             "-i", args.key, args.host, command], capture_output=True, timeout=90)
    if result.returncode:
        raise SystemExit("Read-only catalog export failed; no snapshot written")
    data = json.loads(result.stdout)
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"products": len(data["products"]),
                      "redactions": data["private_identifier_redactions"], "output": str(target)}))


if __name__ == "__main__":
    main()
