"""Guarded local Directus rollout of the approved three-phone Avito pilot.

Run on the VPS. This never calls Avito or changes products/inventory.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET


APPROVED_HASH = "269b73e93db8a4113033f5b764dc724ce1f454e1a784314c5ee8a19712cd632c"
MAPPING_ID = "9f879ec1-a29c-4d1e-80a4-221b2fac7d61"
CATEGORY_ID = "713682e9-94f1-4d35-867c-daa401573291"
PILOT = {
    "isvoi-87da52ec-4e2a-4018-baf8-79f14043cfa8": (
        "20460345-bd91-4840-9dfe-2f2844c2bc94",
        "iphone-15-pro-max-white-titanium-256-t11", 57900, "2026-08-05"),
    "isvoi-872f3638-c9d6-4c1d-b494-c4f5f02885c0": (
        "91eb3d9c-2583-4bbe-982f-cef6073e6a8b",
        "apple-iphone-14-pro-max-256-silver-872f3638", 51599, "2026-08-10"),
    "isvoi-e307d9cd-48aa-4475-a784-674749fde517": (
        "abe4cc23-9466-4287-9bc2-075625903f31",
        "iphone-15-pro-max-natural-titanium-256-t12", 57900, "2026-08-05"),
}
CHANGED_FIELDS = (
    "status", "title_override", "description_override", "category_mapping", "attributes"
)


def json_sql(value):
    encoded = json.dumps(value, ensure_ascii=True).encode().hex()
    return "convert_from(decode('" + encoded + "','hex'),'UTF8')::jsonb"


def db(sql):
    result = subprocess.run([
        "docker", "exec", "-i", "directus-beget-database-1", "psql",
        "-U", "isvoi", "-d", "isvoi", "-qAt", "-v", "ON_ERROR_STOP=1",
    ], input=sql, text=True, capture_output=True, timeout=60)
    if result.returncode:
        raise SystemExit("Pilot database guard failed; transaction rolled back")
    return json.loads(result.stdout) if result.stdout.strip() else None


def approved_rows(path):
    content = Path(path).read_bytes()
    if hashlib.sha256(content).hexdigest() != APPROVED_HASH:
        raise ValueError("XML does not match the approved pilot")
    ads = ET.fromstring(content).findall("Ad")
    if len(ads) != 3 or {a.findtext("Id") for a in ads} != set(PILOT):
        raise ValueError("Exactly three approved IDs required")
    rows = []
    for ad in ads:
        external_id = ad.findtext("Id")
        listing_id, product, price, tested_at = PILOT[external_id]
        rows.append({
            "id": listing_id, "product": product, "channel": "avito",
            "external_id": external_id, "status": "active",
            "title_override": ad.findtext("Title"),
            "description_override": ad.findtext("Description"),
            "category_mapping": MAPPING_ID,
            "attributes": {x.tag: x.text for x in ad if x.tag not in {
                "Id", "Category", "GoodsType", "Title", "Description", "Price", "Images"
            }},
            "expected_price": price, "expected_diagnostic_date": tested_at,
        })
    return rows


def read_state():
    ids = json_sql(list(PILOT))
    return db(f"""SELECT jsonb_build_object(
      'listings',(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]')
        FROM product_channel_listings l WHERE l.channel='avito'
        AND l.external_id IN (SELECT jsonb_array_elements_text({ids}))),
      'mapping',(SELECT to_jsonb(m) FROM channel_category_mappings m
        WHERE m.id='{MAPPING_ID}'));
    """)


def same_fields(actual, expected):
    return all(actual.get(k) == expected.get(k) for k in CHANGED_FIELDS)


def guard_sql(rows, before):
    return f"""
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TEMP TABLE pilot_input ON COMMIT DROP AS SELECT value AS row
 FROM jsonb_array_elements({json_sql(rows)});
SELECT FROM product_channel_listings WHERE id IN
 (SELECT (row->>'id')::uuid FROM pilot_input) FOR UPDATE;
SELECT FROM products WHERE id IN (SELECT row->>'product' FROM pilot_input) FOR UPDATE;
SELECT FROM inventory_items WHERE product IN
 (SELECT row->>'product' FROM pilot_input) FOR UPDATE;
SELECT FROM device_details WHERE product IN
 (SELECT row->>'product' FROM pilot_input) FOR UPDATE;
DO $guard$ BEGIN
 IF (SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]')
     FROM product_channel_listings l WHERE l.id IN
       (SELECT (row->>'id')::uuid FROM pilot_input)) IS DISTINCT FROM
       {json_sql(before['listings'])} THEN
   RAISE EXCEPTION 'Listing changed since preview';
 END IF;
 IF EXISTS(SELECT 1 FROM channel_category_mappings WHERE id='{MAPPING_ID}') THEN
   RAISE EXCEPTION 'Pilot mapping already exists';
 END IF;
 IF (SELECT count(*) FROM pilot_input x
   JOIN product_channel_listings l ON l.id=(x.row->>'id')::uuid
   JOIN products p ON p.id=x.row->>'product'
   WHERE l.product=p.id AND l.external_id=x.row->>'external_id' AND l.channel='avito'
     AND l.status='draft' AND l.category_mapping IS NULL AND l.price_override IS NULL
     AND p.status='published' AND p.content_status='ready' AND p.condition='used'
     AND p.category='{CATEGORY_ID}' AND p.stock_status='available' AND p.stock_quantity=1
     AND p.price=(x.row->>'expected_price')::numeric
     AND p.listing_file IS NOT NULL
     AND (SELECT count(*) FROM product_images WHERE product=p.id AND status='published')>=6
     AND (SELECT count(*) FROM inventory_items WHERE product=p.id)=1
     AND EXISTS(SELECT 1 FROM inventory_items i WHERE i.product=p.id AND i.quantity=1
       AND i.eligibility_status='eligible' AND i.authenticity_status='verified'
       AND i.identity_status='matched' AND i.review_override
       AND nullif(trim(i.review_note),'') IS NOT NULL)
     AND EXISTS(SELECT 1 FROM device_details d WHERE d.product=p.id AND d.grade='A'
       AND d.battery='100%' AND d.battery_cycles=0
       AND d.diagnostic_date::date=(x.row->>'expected_diagnostic_date')::date)
     AND EXISTS(SELECT 1 FROM product_offers o JOIN store_locations s ON s.id=o.location
       WHERE o.product=p.id AND o.status='published' AND o.stock_status='available'
       AND o.stock_quantity=1 AND o.price=p.price AND s.slug='belgorod')
 )<>3 THEN RAISE EXCEPTION 'Pilot source facts changed'; END IF;
END $guard$;
"""


def write_sql():
    return f"""INSERT INTO channel_category_mappings
 (id,channel,mapping_key,product_category,external_category,external_goods_type,
 template_version,is_active,is_confirmed,default_attributes,note)
 VALUES ('{MAPPING_ID}','avito','smartphones-pilot-2026-10-04','{CATEGORY_ID}',
 'Телефоны','Мобильные телефоны','phone-template-129639-2026-10-04-xml-v3',
 true,true,'{{}}','Three-phone XML validator accepted; cabinet upload is separate');
UPDATE product_channel_listings l SET status='active',
 title_override=x.row->>'title_override',description_override=x.row->>'description_override',
 category_mapping='{MAPPING_ID}',attributes=x.row->'attributes',updated_at=now()
 FROM pilot_input x WHERE l.id=(x.row->>'id')::uuid;
"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--xml", required=True)
    parser.add_argument("--backup-dir", required=True)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--rollback", action="store_true")
    mode.add_argument("--rehearsal", action="store_true")
    args = parser.parse_args()
    os.umask(0o077)
    rows = approved_rows(args.xml)
    backup = Path(args.backup_dir).resolve()
    if not backup.is_relative_to(Path("/opt/isvoi/backups")):
        raise SystemExit("Backup must be inside /opt/isvoi/backups")
    state_file = backup / "avito-pilot-before.json"
    before = read_state()
    if args.rollback:
        saved = json.loads(state_file.read_text())
        if len(before["listings"]) != 3 or not all(
            same_fields(actual, next(r for r in rows if r["id"] == actual["id"]))
            for actual in before["listings"]
        ):
            raise SystemExit("Rollback refused: pilot rows edited since rollout")
        changes = []
        for row in saved["listings"]:
            assignments = ",".join(f"{k}=old.{k}" for k in CHANGED_FIELDS)
            changes.append(f"UPDATE product_channel_listings l SET {assignments},updated_at=now() "
                           f"FROM jsonb_populate_record(NULL::product_channel_listings,{json_sql(row)}) old "
                           "WHERE l.id=old.id;")
        sql = f"""BEGIN;
LOCK TABLE product_channel_listings IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$ BEGIN
 IF (SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM product_channel_listings l
 WHERE l.id IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements({json_sql(before['listings'])})))
 IS DISTINCT FROM {json_sql(before['listings'])} THEN RAISE EXCEPTION 'Rollback conflict'; END IF;
END $rollback$;
{''.join(changes)}
DELETE FROM channel_category_mappings WHERE id='{MAPPING_ID}'
 AND NOT EXISTS(SELECT 1 FROM product_channel_listings WHERE category_mapping='{MAPPING_ID}');
COMMIT;"""
        db(sql)
        print(json.dumps({"rolled_back": True, "listings": 3, "avito_called": False}))
        return
    if len(before["listings"]) != 3:
        raise SystemExit("Expected exactly three existing listings")
    if all(same_fields(actual, next(r for r in rows if r["id"] == actual["id"]))
           for actual in before["listings"]):
        print(json.dumps({"already_applied": True, "listings": 3, "avito_called": False}))
        return
    sql = guard_sql(rows, before)
    if args.rehearsal:
        result = db(sql + write_sql() + f"""
SELECT jsonb_build_object('rehearsal_active',count(*)) FROM product_channel_listings
 WHERE category_mapping='{MAPPING_ID}' AND status='active';
ROLLBACK;""")
        if result["rehearsal_active"] != 3 or read_state() != before:
            raise SystemExit("Rehearsal did not restore the original state")
        print(json.dumps({"rehearsal": True, "rows": 3, "restored": True}))
        return
    if not args.apply:
        db(sql + "ROLLBACK;")
        print(json.dumps({"dry_run": True, "guards_passed": True, "listings": 3}))
        return
    for archive in ("postgres.sql.gz", "uploads.tar.gz", "SHA256SUMS"):
        if not (backup / archive).is_file():
            raise SystemExit("Verified database/uploads backup required")
    subprocess.run(["sha256sum", "-c", "SHA256SUMS"], cwd=backup, check=True,
                   stdout=subprocess.DEVNULL)
    with state_file.open("x", encoding="utf-8") as out:
        json.dump(before, out, ensure_ascii=True, indent=2)
    db(sql + write_sql() + "COMMIT;")
    print(json.dumps({"applied": True, "listings": 3, "avito_called": False}))


if __name__ == "__main__":
    main()
