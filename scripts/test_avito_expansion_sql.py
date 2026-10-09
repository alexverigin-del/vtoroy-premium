"""Exercise expansion/rollback in an isolated, network-less PostgreSQL fixture.

Uses only an already installed postgres:16-alpine image. No production database,
credentials, mounts, ports or marketplace APIs are used.
"""

import argparse
from contextlib import ExitStack
from copy import deepcopy
from functools import partial
import json
import subprocess
import time
from unittest.mock import patch
import uuid

import activate_avito_expansion as operator
import prepare_avito_expansion_release as release
from activate_avito_pilot import json_sql
from test_avito_expansion_release import fixture, active_projection


SCHEMA = """
CREATE TABLE products(id text PRIMARY KEY,sku text,status text,content_status text,product_type text,
 condition text,title text,model text,color text,price numeric,stock_quantity integer,stock_status text,
 completeness text,warranty_text text,category uuid,listing_file uuid,sort integer);
CREATE TABLE product_categories(id uuid PRIMARY KEY,slug text,name text);
CREATE TABLE store_locations(id uuid PRIMARY KEY,slug text,status text,city text,address text);
CREATE TABLE device_details(id uuid PRIMARY KEY,product text,storage text,grade text,battery text,
 battery_cycles integer,diagnostic_date date,sim text,activation_lock text,mdm text);
CREATE TABLE device_passports(id uuid PRIMARY KEY,product text,diagnostics_status text,condition_note text,
 condition_notes jsonb,repair text,water text,summary_rows jsonb,diagnostics_checklist jsonb,story_facts jsonb);
CREATE TABLE device_diagnostic_reports(id uuid PRIMARY KEY,product text,provider text,tested_at date,
 status text,public_file uuid,public_note text);
CREATE TABLE product_images(id uuid PRIMARY KEY,product text,image uuid,role text,sort integer,label text,status text);
CREATE TABLE product_offers(id uuid PRIMARY KEY,product text,location uuid,status text,price numeric,
 stock_quantity integer,stock_status text);
CREATE TABLE inventory_items(id uuid PRIMARY KEY,product text,source_sku text,quantity integer,retail_price numeric,
 identity_status text,authenticity_status text,eligibility_status text,for_sale boolean,review_override boolean,
 review_note text,serial_full text,imei_full text);
CREATE TABLE inventory_receipt_lines(id uuid PRIMARY KEY,inventory_item uuid,serial_full text);
CREATE TABLE inventory_import_issues(id uuid PRIMARY KEY,inventory_item uuid,code text,resolved boolean);
CREATE TABLE channel_category_mappings(id uuid PRIMARY KEY,channel text,mapping_key text,product_category uuid,
 external_category text,external_goods_type text,template_version text,is_active boolean,is_confirmed boolean,
 default_attributes jsonb,note text);
CREATE TABLE product_channel_listings(id uuid PRIMARY KEY,product text,channel text,status text,external_id text,
 title_override text,description_override text,price_override numeric,category_mapping uuid,attributes jsonb,
 notes text,updated_at timestamptz);
"""


def insert(table,row):
    return f"INSERT INTO {table} SELECT * FROM jsonb_populate_record(NULL::{table},{json_sql(row)});"


def seed(plan,state):
    sql=[SCHEMA,insert('channel_category_mappings',{**state['mapping'],'mapping_key':'fixture-only','note':'unchanged mapping'})]
    store=plan['expected_before']['stores'][0]
    sql.append(insert('store_locations',store))
    sql.append(insert('product_categories',plan['expected_before']['products'][0]['category']))
    for index,p in enumerate(plan['expected_before']['products'],1):
        row=deepcopy(p); row.update(category=release.CATEGORY_ID,sort=index)
        sql.append(insert('products',row))
        sql.append(insert('device_details',{**p['device_details'][0],'product':p['id'],'id':str(uuid.uuid4())}))
        sql.append(insert('device_passports',{**p['passports'][0],'product':p['id'],'id':str(uuid.uuid4())}))
        sql.append(insert('device_diagnostic_reports',{**p['reports'][0],'product':p['id'],'id':str(uuid.uuid4())}))
        for image in p['images']:
            sql.append(insert('product_images',{**image,'id':str(uuid.uuid4()),'image':image['id'],'product':p['id'],'status':'published'}))
        for offer in p['offers']:
            sql.append(insert('product_offers',{**offer,'location':store['id'],'product':p['id']}))
        inv=p['inventory'][0]
        serial='QAONLYFIXTURESERIAL'+str(index)
        sql.append(insert('inventory_items',{**inv,'product':p['id'],'serial_full':serial,'imei_full':None,'review_note':'TEST ONLY'}))
        sql.append(insert('inventory_receipt_lines',{'id':str(uuid.uuid4()),'inventory_item':inv['id'],'serial_full':serial}))
    for row in state['listings']: sql.append(insert('product_channel_listings',row))
    return '\n'.join(sql)


def run(followup=False):
    name='isvoi-avito-expansion-qa-'+uuid.uuid4().hex[:10]
    created=False
    phases=[]
    def db(sql):
        result=subprocess.run(['docker','exec','-e','PGPASSWORD=fixture-not-a-real-credential','-i',name,
                               'psql','-h','127.0.0.1','-X','-qAt','-U','postgres',
                               '-v','ON_ERROR_STOP=1'],input=sql,text=True,capture_output=True,timeout=60)
        if result.returncode:
            raise RuntimeError(result.stderr.splitlines()[0] if result.stderr else 'Fixture SQL failed')
        return json.loads(result.stdout) if result.stdout.strip() else None
    def rejected(action,label):
        try: action()
        except (ValueError,RuntimeError): phases.append(label); return
        raise AssertionError('Expected refusal: '+label)
    try:
        subprocess.run(['docker','image','inspect','postgres:16-alpine'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        subprocess.run(['docker','run','--pull=never','--rm','-d','--network','none','--name',name,
                        '-e','POSTGRES_PASSWORD=fixture-not-a-real-credential','postgres:16-alpine'],
                       check=True,stdout=subprocess.DEVNULL)
        created=True
        for _ in range(40):
            # The image's initialization server listens only on a Unix socket.
            ready=subprocess.run(['docker','exec',name,'pg_isready','-h','127.0.0.1','-U','postgres'],capture_output=True)
            if ready.returncode==0: break
            time.sleep(0.5)
        else: raise RuntimeError('Isolated fixture did not become ready')
        contract, build_fixture = release, fixture
        if followup:
            import prepare_avito_followup_release as contract
            from test_avito_followup_release import fixture as build_fixture
        plan,xml,_,state=build_fixture()
        db(seed(plan,state))
        with ExitStack() as context:
            context.enter_context(patch.object(operator,'db',db))
            context.enter_context(patch.object(contract,'APPROVED_HASH',plan['xml_sha256']))
            if followup:
                context.enter_context(patch.object(contract,'EXISTING_HASH',plan['existing_feed_sha256']))
                context.enter_context(patch.object(operator,'read_state',partial(operator.read_state,contract.ALL_IDS)))
                context.enter_context(patch.object(operator,'transaction_sql',partial(operator.transaction_sql,
                    identities=contract.IDENTITIES,new_rows=contract.NEW)))
                context.enter_context(patch.object(operator,'rollback_sql',partial(operator.rollback_sql,new_rows=contract.NEW)))
            source=db(operator.SOURCE_QUERY)
            source.pop('_private_identifiers')
            if followup:
                plan['expected_before']={'products':sorted([p for p in source['products'] if p['id'] in
                    {s[1] for s in contract.IDENTITIES.values()}],key=lambda p:p['id']),
                    'stores':[s for s in source['stores'] if s['slug']=='belgorod']}
                plan['expected_active']=contract.projection(plan['expected_before'],plan['desired'],plan['mapping_version'])
            else:
                plan['expected_before']=release.selected_source(source)
                plan['expected_active']=active_projection(plan)
            contract.validate_plan(plan,xml)
            before=operator.read_state()
            result=db(operator.transaction_sql(plan,before,xml))
            assert result['changed']==0 and operator.read_state()==before
            phases.append('dry_run_no_change')
            result=db(operator.transaction_sql(plan,before,xml,write=True))
            assert result['changed']==3 and operator.read_state()==before
            phases.append('transactional_rehearsal_rolled_back')
            target=plan['desired'][0]
            product=target['product']
            db(f"UPDATE products SET stock_quantity=0 WHERE id='{product}';")
            rejected(lambda:db(operator.transaction_sql(plan,before,xml,write=True,commit=True)),'sold_or_zero_stock_refused')
            assert operator.read_state()==before
            db(f"UPDATE products SET stock_quantity=1 WHERE id='{product}';")
            db(f"UPDATE device_details SET battery_cycles=999 WHERE product='{product}';")
            rejected(lambda:db(operator.transaction_sql(plan,before,xml,write=True,commit=True)),'diagnostic_drift_refused')
            db(f"UPDATE device_details SET battery_cycles=0 WHERE product='{product}';")
            db(f"UPDATE product_images SET sort=99 WHERE product='{product}' AND sort=1;")
            rejected(lambda:db(operator.transaction_sql(plan,before,xml,write=True,commit=True)),'photo_drift_refused')
            db(f"UPDATE product_images SET sort=1 WHERE product='{product}' AND sort=99;")
            db(f"UPDATE product_channel_listings SET attributes='{{\"PurchasePrice\":1}}' WHERE id='{target['id']}';")
            rejected(lambda:db(operator.transaction_sql(plan,operator.read_state(),xml,write=True,commit=True)),'unfiltered_private_attributes_refused')
            db(f"UPDATE product_channel_listings SET attributes='{{}}' WHERE id='{target['id']}';")
            old_id=next(r['id'] for r in before['listings'] if r['external_id'] in plan['existing_ids'])
            db(f"UPDATE product_channel_listings SET notes='concurrent fixture edit' WHERE id='{old_id}';")
            rejected(lambda:db(operator.transaction_sql(plan,before,xml,write=True,commit=True)),'concurrent_pilot_edit_refused')
            db(f"UPDATE product_channel_listings SET notes='unowned fixture note' WHERE id='{old_id}';")
            db("INSERT INTO products(id,price) VALUES('qa-unrelated',10); CREATE FUNCTION qa_sideeffect() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN UPDATE products SET price=11 WHERE id='qa-unrelated'; RETURN NEW; END$$; CREATE TRIGGER qa_sideeffect AFTER UPDATE ON product_channel_listings FOR EACH ROW EXECUTE FUNCTION qa_sideeffect();")
            rejected(lambda:db(operator.transaction_sql(plan,before,xml,write=True,commit=True)),'collateral_trigger_mutation_rolled_back')
            assert db("SELECT to_jsonb(price) FROM products WHERE id='qa-unrelated';")==10
            assert operator.read_state()==before
            db('DROP TRIGGER qa_sideeffect ON product_channel_listings; DROP FUNCTION qa_sideeffect();')
            result=db(operator.transaction_sql(plan,before,xml,write=True,commit=True))
            assert result['changed']==3 and result['protected_unchanged']
            after=operator.read_state()
            assert [r for r in after['listings'] if r['external_id'] in plan['existing_ids']]==[r for r in before['listings'] if r['external_id'] in plan['existing_ids']]
            assert after['mapping']==before['mapping']
            phases.append('only_new_three_applied_originals_and_mapping_preserved')
            result=db(operator.transaction_sql(plan,after,xml,write=True,commit=True))
            assert result['changed']==0 and result['already_applied']
            phases.append('apply_is_idempotent')
            receipt={'xml_sha256':plan['xml_sha256'],'before':before,'after':result['new_after']}
            db("CREATE FUNCTION qa_rollback_sideeffect() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN UPDATE products SET price=12 WHERE id='qa-unrelated'; RETURN NEW; END$$; CREATE TRIGGER qa_rollback_sideeffect AFTER UPDATE ON product_channel_listings FOR EACH ROW EXECUTE FUNCTION qa_rollback_sideeffect();")
            rejected(lambda:db(operator.rollback_sql(plan,operator.read_state(),receipt)),'rollback_collateral_trigger_refused')
            assert db("SELECT to_jsonb(price) FROM products WHERE id='qa-unrelated';")==10
            assert operator.read_state()==after
            db('DROP TRIGGER qa_rollback_sideeffect ON product_channel_listings; DROP FUNCTION qa_rollback_sideeffect();')
            db(f"UPDATE product_channel_listings SET title_override='later owned edit' WHERE id='{target['id']}';")
            rejected(lambda:operator.rollback_sql(plan,operator.read_state(),receipt),'rollback_owned_edit_refused')
            title=target['title_override']
            db(f"UPDATE product_channel_listings SET title_override=({json_sql(title)}#>>'{{}}'),notes='later unowned note' WHERE id='{target['id']}';")
            db(operator.rollback_sql(plan,operator.read_state(),receipt))
            rolled=operator.read_state()
            for row in rolled['listings']:
                previous=next(r for r in before['listings'] if r['id']==row['id'])
                assert all(row[key]==previous[key] for key in release.EDIT_FIELDS)
            assert next(r for r in rolled['listings'] if r['id']==target['id'])['notes']=='later unowned note'
            assert rolled['mapping']==before['mapping']
            phases.append('rollback_restores_new_drafts_preserves_unowned_notes_and_mapping')
        return {'ok':True,'phases':phases,'ads':len(plan['allowed_ids']),'fixture_network':'none','production_database_used':False,'avito_called':False}
    finally:
        if created:
            assert name.startswith('isvoi-avito-expansion-qa-')
            subprocess.run(['docker','rm','-f',name],check=True,stdout=subprocess.DEVNULL)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--followup',action='store_true',help='Exercise the nine-ad contract instead of the historical six-ad contract')
    args=parser.parse_args()
    print(json.dumps(run(args.followup)))
