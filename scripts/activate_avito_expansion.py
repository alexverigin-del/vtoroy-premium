"""Server-only guarded three-row expansion; never edits env or calls Avito.

Default is read-only business preflight. --apply requires separate release and
stability evidence plus a verified fresh backup. Keep the live allowlist at three
until the separately authorized application/config rollout is complete.
"""

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
from urllib.request import urlopen, HTTPRedirectHandler, build_opener, ProxyHandler
import hashlib

from activate_avito_pilot import json_sql, db, MAPPING_ID, CATEGORY_ID, PILOT
from export_avito_catalog_snapshot import SQL
from prepare_avito_expansion_release import (
    ALL_IDS, NEW, EDIT_FIELDS, EXISTING_HASH, validate_plan, require_authorization,
)
from run_catalog_gallery_curation import TABLES


PROTECTED = list(dict.fromkeys([*TABLES, "product_images", "store_locations"]))
SOURCE_QUERY = "SELECT jsonb_build_object(" + SQL.split("SELECT jsonb_build_object(", 1)[1].split("\nROLLBACK;", 1)[0].strip().rstrip(";")
IMMUTABLE = ("id", "product", "channel", "external_id", "price_override")


def read_state():
    return db(f"""BEGIN READ ONLY;
SELECT jsonb_build_object(
 'listings',(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]') FROM product_channel_listings l
   WHERE l.channel='avito' AND l.external_id IN (SELECT jsonb_array_elements_text({json_sql(ALL_IDS)}))),
 'mapping',(SELECT to_jsonb(m) FROM channel_category_mappings m WHERE m.id='{MAPPING_ID}'));
ROLLBACK;""")


def validate_state(plan, state):
    rows, mapping = state.get("listings", []), state.get("mapping") or {}
    if (len(rows) != 6 or {r.get("external_id") for r in rows} != set(ALL_IDS)
            or mapping.get("channel") != "avito" or mapping.get("product_category") != CATEGORY_ID
            or mapping.get("external_category") != "Телефоны"
            or mapping.get("external_goods_type") != "Мобильные телефоны"
            or mapping.get("is_active") is not True or mapping.get("is_confirmed") is not True
            or mapping.get("template_version") != plan["mapping_version"]
            or mapping.get("default_attributes") != {}):
        raise ValueError("Existing mapping or six-row identity changed")
    for row in rows:
        spec = (NEW | PILOT)[row["external_id"]]
        if (row["id"] != spec[0] or row["product"] != spec[1] or row.get("price_override") is not None):
            raise ValueError("Channel identity or manual price changed")


def protection_sql():
    new_ids = json_sql([spec[0] for spec in NEW.values()])
    return f"""FOREACH table_name IN ARRAY ARRAY{json.dumps(PROTECTED).replace(chr(34), chr(39))} LOOP
 IF to_regclass('public.'||table_name) IS NOT NULL THEN
   condition := CASE WHEN table_name='product_channel_listings' THEN
     ' WHERE id NOT IN (SELECT jsonb_array_elements_text(' || quote_literal({new_ids}::text) || '::jsonb)::uuid)' ELSE '' END;
   EXECUTE 'SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id)::text,''null'')) FROM '
     || quote_ident(table_name) || ' t' || condition INTO digest;
   protected := protected || jsonb_build_object(table_name,digest);
 END IF;
END LOOP;"""


def transaction_sql(plan, before, xml, write=False, commit=False):
    validate_state(plan, before)
    projection = f"""jsonb_build_object(
 'products',(SELECT jsonb_agg(value ORDER BY value->>'id') FROM jsonb_array_elements(src->'products')
   WHERE value->>'id' IN (SELECT value->>'id' FROM jsonb_array_elements({json_sql(plan['expected_before']['products'])}))),
 'stores',(SELECT jsonb_agg(value) FROM jsonb_array_elements(src->'stores') WHERE value->>'slug'='belgorod'))"""
    return f"""BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
CREATE TEMP TABLE expansion_result (data jsonb) ON COMMIT DROP;
DO $expansion$
DECLARE src jsonb; current_source jsonb; protected jsonb='{{}}'; protected_before jsonb;
 table_name text; digest text; condition text; changed integer=0; already boolean=false;
 normalized_xml text=regexp_replace(upper({json_sql(xml.decode())}#>>'{{}}'),'[^A-Z0-9]','','g');
BEGIN
 FOREACH table_name IN ARRAY ARRAY{json.dumps(PROTECTED).replace(chr(34), chr(39))} LOOP
  IF to_regclass('public.'||table_name) IS NOT NULL THEN
   EXECUTE 'LOCK TABLE '||quote_ident(table_name)||' IN SHARE ROW EXCLUSIVE MODE';
  END IF;
 END LOOP;
 IF (SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]') FROM product_channel_listings l
     WHERE l.channel='avito' AND l.external_id IN (SELECT jsonb_array_elements_text({json_sql(ALL_IDS)})))
     IS DISTINCT FROM {json_sql(before['listings'])}
    OR (SELECT to_jsonb(m) FROM channel_category_mappings m WHERE id='{MAPPING_ID}')
     IS DISTINCT FROM {json_sql(before['mapping'])} THEN
  RAISE EXCEPTION 'Channel/mapping changed after preflight';
 END IF;
 src := ({SOURCE_QUERY});
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(src->'_private_identifiers') v
    WHERE length(regexp_replace(upper(v),'[^A-Z0-9]','','g'))>=8
    AND position(regexp_replace(upper(v),'[^A-Z0-9]','','g') in normalized_xml)>0) THEN
  RAISE EXCEPTION 'Private identifier in approved XML';
 END IF;
 current_source := {projection};
 IF current_source={json_sql(plan['expected_active'])} THEN
  already:=true;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements({json_sql(plan['desired'])}) x
     JOIN product_channel_listings l ON l.id=(x->>'id')::uuid
     WHERE to_jsonb(l)->'attributes' IS DISTINCT FROM x->'attributes'
       OR l.status IS DISTINCT FROM 'active' OR l.title_override IS DISTINCT FROM x->>'title_override'
       OR l.description_override IS DISTINCT FROM x->>'description_override'
       OR l.category_mapping IS DISTINCT FROM '{MAPPING_ID}'::uuid) THEN
   RAISE EXCEPTION 'Already-active rows differ from approved release';
  END IF;
 ELSIF current_source IS DISTINCT FROM {json_sql(plan['expected_before'])} THEN
  RAISE EXCEPTION 'Product/inventory/offer/diagnostic/photo facts changed';
 ELSE
  IF EXISTS(SELECT 1 FROM product_channel_listings l WHERE l.external_id IN
       (SELECT jsonb_array_elements_text({json_sql(list(NEW))}))
       AND (l.status<>'draft' OR l.category_mapping IS NOT NULL OR l.price_override IS NOT NULL
         OR l.title_override IS NOT NULL OR l.description_override IS NOT NULL
         OR coalesce(l.attributes,'{{}}'::jsonb)<>'{{}}'::jsonb)) THEN
   RAISE EXCEPTION 'Unreviewed channel fields present';
  END IF;
 END IF;
 {protection_sql()}
 protected_before:=protected;
 IF {str(write).lower()} AND NOT already THEN
  UPDATE product_channel_listings l SET status='active', title_override=x->>'title_override',
   description_override=x->>'description_override',category_mapping='{MAPPING_ID}',
   attributes=x->'attributes',updated_at=now()
   FROM jsonb_array_elements({json_sql(plan['desired'])}) x WHERE l.id=(x->>'id')::uuid;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>3 THEN RAISE EXCEPTION 'Expected exactly three changes'; END IF;
  src := ({SOURCE_QUERY});
  current_source := {projection};
  IF current_source IS DISTINCT FROM {json_sql(plan['expected_active'])} THEN
   RAISE EXCEPTION 'Active source differs from approved release';
  END IF;
 END IF;
 protected:='{{}}';
 {protection_sql()}
 IF protected IS DISTINCT FROM protected_before THEN RAISE EXCEPTION 'Protected business data changed'; END IF;
 INSERT INTO expansion_result VALUES (jsonb_build_object('guards_passed',true,'changed',changed,
  'already_applied',already,'protected_unchanged',true,'new_after',
  (SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM product_channel_listings l WHERE l.external_id IN
    (SELECT jsonb_array_elements_text({json_sql(list(NEW))})))));
END $expansion$;
SELECT data FROM expansion_result;
{'COMMIT' if commit else 'ROLLBACK'};"""


def rollback_sql(plan, current, receipt):
    if receipt.get("xml_sha256") != plan["xml_sha256"]:
        raise ValueError("Rollback receipt belongs to another release")
    saved = [r for r in receipt["before"]["listings"] if r["external_id"] in NEW]
    expected = receipt["after"]
    rows = [r for r in current["listings"] if r["external_id"] in NEW]
    if (len(saved) != 3 or len(expected) != 3 or len(rows) != 3
            or {r["id"] for r in saved} != {spec[0] for spec in NEW.values()}):
        raise ValueError("Invalid rollback identity set")
    for row in rows:
        previous = next(r for r in expected if r["id"] == row["id"])
        if any(row.get(key) != previous.get(key) for key in (*IMMUTABLE, *EDIT_FIELDS)):
            raise ValueError("Rollback refused: owned fields edited after release")
    for row in saved:
        if (row.get('status')!='draft' or row.get('category_mapping') is not None
                or row.get('title_override') is not None or row.get('description_override') is not None
                or row.get('attributes') not in (None,{})):
            raise ValueError('Rollback receipt does not contain the original empty drafts')
    assignments = ','.join(f'{field}=old.{field}' for field in EDIT_FIELDS)
    return f"""BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $rollback$
DECLARE table_name text; condition text; digest text; protected jsonb='{{}}'; protected_before jsonb; changed integer;
BEGIN
 FOREACH table_name IN ARRAY ARRAY{json.dumps(PROTECTED).replace(chr(34), chr(39))} LOOP
  IF to_regclass('public.'||table_name) IS NOT NULL THEN
   EXECUTE 'LOCK TABLE '||quote_ident(table_name)||' IN SHARE ROW EXCLUSIVE MODE';
  END IF;
 END LOOP;
 IF (SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM product_channel_listings l WHERE l.external_id IN
     (SELECT jsonb_array_elements_text({json_sql(list(NEW))}))) IS DISTINCT FROM {json_sql(sorted(rows,key=lambda r:r['id']))} THEN
  RAISE EXCEPTION 'Rollback concurrent edit';
 END IF;
 {protection_sql()}
 protected_before:=protected;
UPDATE product_channel_listings l SET {assignments}, updated_at=now()
 FROM jsonb_populate_recordset(NULL::product_channel_listings,{json_sql(saved)}) old WHERE l.id=old.id;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>3 THEN RAISE EXCEPTION 'Expected three rollback rows'; END IF;
 protected:='{{}}';
 {protection_sql()}
 IF protected IS DISTINCT FROM protected_before THEN RAISE EXCEPTION 'Rollback changed protected business data'; END IF;
END $rollback$;
COMMIT;"""


def require_three_id_environment(repo):
    keys = {}
    for line in (repo / "apps/web/.env.local").read_text().splitlines():
        key, separator, value = line.partition('=')
        if separator and key in {"AVITO_FEED_ENABLED", "AVITO_PHONE_SCHEMA_VERIFIED", "AVITO_FEED_ALLOWED_IDS"}:
            if key in keys:
                raise ValueError("Duplicate feed config key")
            keys[key] = value.strip().strip('"').strip("'")
    if (keys.get("AVITO_FEED_ENABLED") != "1" or keys.get("AVITO_PHONE_SCHEMA_VERIFIED") != "1"
            or set(keys.get("AVITO_FEED_ALLOWED_IDS", "").split(',')) != set(PILOT)
            or len(keys.get("AVITO_FEED_ALLOWED_IDS", "").split(',')) != 3):
        raise ValueError("Keep the existing three-ID allowlist before activation or rollback")


def require_fresh_backup(folder, now=None):
    folder = folder.resolve()
    if not folder.is_relative_to(Path('/opt/isvoi/backups/directus')):
        raise ValueError("Backup outside the protected Directus backup root")
    now = now or datetime.now(timezone.utc).timestamp()
    for name in ("postgres.sql.gz", "uploads.tar.gz", "SHA256SUMS"):
        path = folder / name
        if not path.is_file() or not 0 <= now - path.stat().st_mtime <= 24 * 3600:
            raise ValueError("Verified backup less than 24 hours old required")
    subprocess.run(['sha256sum', '-c', 'SHA256SUMS'], cwd=folder, check=True, stdout=subprocess.DEVNULL)
    subprocess.run(['gzip','-t','postgres.sql.gz'], cwd=folder, check=True)
    subprocess.run(['tar','-tzf','uploads.tar.gz'], cwd=folder, check=True, stdout=subprocess.DEVNULL)


def require_six_id_code(repo):
    code = "const m=await import('file://" + str(repo / 'apps/web/lib/avito-feed.ts') + "'); if(m.parseAvitoPilotIds('a,b,c,d,e,f').length!==6)process.exit(1);"
    result = subprocess.run(['node','--disable-warning=MODULE_TYPELESS_PACKAGE_JSON','--experimental-strip-types',
                             '--input-type=module','-e',code],capture_output=True,timeout=30)
    build_id=repo / 'apps/web/.next/BUILD_ID'
    sources=[repo / 'apps/web/lib/avito-feed.ts',repo / 'apps/web/app/integrations/avito/feed.xml/route.ts']
    if (result.returncode or not build_id.is_file()
            or build_id.stat().st_mtime < max(source.stat().st_mtime for source in sources)):
        raise ValueError('Deploy and build six-ID application support before activation')


def verify_public_images(plan):
    class NoRedirect(HTTPRedirectHandler):
        def redirect_request(self,*args):
            return None
    opener=build_opener(ProxyHandler({}),NoRedirect())
    for asset,digest in plan['public_photo_sha256'].items():
        url='https://api.isvoi.ru/assets/'+asset+'?width=1600&height=1600&fit=inside&format=jpg&quality=90'
        with opener.open(url,timeout=30) as response:
            body=response.read(25*1024*1024+1)
            if (response.status!=200 or response.headers.get_content_type()!='image/jpeg'
                    or len(body)>25*1024*1024 or not body.startswith(b'\xff\xd8\xff')
                    or hashlib.sha256(body).hexdigest()!=digest):
                raise ValueError('Public photo bytes changed; refresh review/preflight')


def require_recent_source(plan):
    captured=datetime.fromisoformat(plan['source_captured_at'])
    if captured.tzinfo is None or not 0 <= (datetime.now(timezone.utc)-captured).total_seconds() <= 3600:
        raise ValueError('Release snapshot older than one hour; regenerate preflight/plan')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', required=True)
    parser.add_argument('--xml', required=True)
    parser.add_argument('--backup-dir')
    parser.add_argument('--authorization')
    parser.add_argument('--stability')
    parser.add_argument('--receipt',help='Rollback-only original receipt; may differ from the fresh backup directory')
    parser.add_argument('--confirm-publication', action='store_true')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--apply', action='store_true')
    mode.add_argument('--rollback', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    repo = Path('/opt/isvoi')
    load = lambda path: json.loads(Path(path).read_text(encoding='utf-8-sig'))
    plan, xml = load(args.plan), Path(args.xml).read_bytes()
    validate_plan(plan, xml)
    require_three_id_environment(repo)
    if args.apply or args.rollback:
        if not args.confirm_publication or not args.authorization or not args.backup_dir or (args.apply and not args.stability):
            raise SystemExit('Separate authorization and fresh backup required; apply also needs stability evidence')
        require_authorization(plan, load(args.authorization), load(args.stability) if args.stability else {},rollback=args.rollback)
        require_fresh_backup(Path(args.backup_dir))
        if args.apply:
            require_six_id_code(repo)
    if not args.rollback:
        require_recent_source(plan)
        with urlopen('http://127.0.0.1:3000/integrations/avito/feed.xml', timeout=30) as response:
            content = response.read(1024 * 1024 + 1)
        if hashlib.sha256(content).hexdigest() != EXISTING_HASH:
            raise SystemExit('Connected pilot feed changed; refresh review')
        verify_public_images(plan)
        require_recent_source(plan)
    before = read_state()
    if args.rollback:
        receipt_path=Path(args.receipt or (Path(args.backup_dir) / 'avito-expansion-receipt.json')).resolve()
        if not receipt_path.is_relative_to(Path('/opt/isvoi/backups/directus')):
            raise SystemExit('Rollback receipt must remain inside the protected VPS backup root')
        receipt = load(receipt_path)
        db(rollback_sql(plan, before, receipt))
        print(json.dumps({'rolled_back':True,'rows':3,'mapping_retained':True,'env_changed':False,'avito_called':False}))
        return
    if args.receipt:
        raise SystemExit('--receipt is only valid with --rollback')
    validate_state(plan, before)
    if args.apply:
        # Receipt stays inside the VPS backup, never in a public artifact.
        receipt_file = Path(args.backup_dir) / 'avito-expansion-receipt.json'
        if receipt_file.exists():
            saved = load(receipt_file)
            result = db(transaction_sql(plan, before, xml))
            if saved.get('xml_sha256') != plan['xml_sha256'] or not result['already_applied']:
                raise SystemExit('Existing release receipt must not be overwritten')
            if saved.get('phase') == 'prepared':
                saved.update(after=result['new_after'],phase='applied',recovered_after_commit=True)
                temporary = receipt_file.with_suffix('.tmp')
                temporary.write_text(json.dumps(saved,ensure_ascii=True,indent=2),encoding='utf-8')
                temporary.replace(receipt_file)
        else:
            receipt = {'xml_sha256':plan['xml_sha256'],'before':before,'phase':'prepared'}
            with receipt_file.open('x',encoding='utf-8') as out:
                json.dump(receipt,out,ensure_ascii=True,indent=2)
            result = db(transaction_sql(plan,before,xml,write=True,commit=True))
            receipt.update(after=result['new_after'],phase='applied')
            temporary = receipt_file.with_suffix('.tmp')
            temporary.write_text(json.dumps(receipt,ensure_ascii=True,indent=2),encoding='utf-8')
            temporary.replace(receipt_file)
    else:
        result = db(transaction_sql(plan,before,xml))
    print(json.dumps({key:result[key] for key in ('guards_passed','changed','already_applied','protected_unchanged')}
                     | {'dry_run':not args.apply,'env_changed':False,'avito_called':False}))


if __name__ == '__main__':
    main()
