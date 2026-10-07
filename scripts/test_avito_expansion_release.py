"""Synthetic expansion contracts: authorization is not inferred from preparation."""

from copy import deepcopy
from datetime import datetime, timezone
import hashlib
from io import BytesIO
from pathlib import Path
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

import prepare_avito_expansion_release as release
import activate_avito_expansion as operator


def fixture():
    root = ET.Element('Ads',formatVersion='3',target='Avito.ru')
    source = {'products':[], 'stores':[{'id':'00000000-0000-4000-8000-000000000100',
              'slug':'belgorod','status':'published','city':'TEST','address':'TEST ADDRESS'}]}
    rows=[]
    for index, identity in enumerate(release.ALL_IDS,1):
        spec=(release.NEW|release.PILOT)[identity]
        model='iPhone 16 Pro Max' if index==5 else 'iPhone 15 Pro Max'
        color='Desert Titanium' if index==5 else 'Natural Titanium'
        battery=spec[4] if identity in release.NEW else '100%'
        cycles=spec[5] if identity in release.NEW else 0
        scalar={'Id':identity,'Category':'Телефоны','GoodsType':'Мобильные телефоны',
                'Address':'TEST ADDRESS','Title':model+' 256 ГБ '+color,
                'Description':model+', 256 ГБ, '+color+'. TEST ONLY.', 'Price':str(spec[2]),
                'AdType':'Товар приобретен на продажу','Condition':'Б/у','Vendor':'Apple',
                'Model':model,'MemorySize':'256 ГБ','Color':'золотистый' if index==5 else 'серый',
                'RamSize':'8 ГБ','Akb':battery.rstrip('%'),'DeviceFlaws':'Включается',
                'ScreenCondition':'Без дефектов','CaseCondition':'Без дефектов'}
        ad=ET.SubElement(root,'Ad')
        for key,value in scalar.items(): ET.SubElement(ad,key).text=value
        photos=[]
        images=ET.SubElement(ad,'Images')
        for photo in range(6):
            file_id=f'00000000-0000-4000-8000-{index*1000+photo:012}'
            url='https://api.isvoi.ru/assets/'+file_id+'?width=1600&height=1600&fit=inside&format=jpg&quality=90'
            ET.SubElement(images,'Image',url=url)
            photos.append({'id':file_id,'role':'card' if photo==0 else 'gallery','sort':photo,'label':'TEST'})
        attributes={k:v for k,v in scalar.items() if k not in {'Id','Category','GoodsType','Title','Description','Price'}}
        listing={'id':spec[0],'channel':'avito','external_id':identity,'status':'draft' if identity in release.NEW else 'active',
                 'category_mapping':None if identity in release.NEW else release.MAPPING_ID,'price_override':None,
                 'title_override':None if identity in release.NEW else scalar['Title'],
                 'description_override':None if identity in release.NEW else scalar['Description'],
                 'attributes':{} if identity in release.NEW else {k:v for k,v in attributes.items() if k in release.EXPORT_ATTRS},
                 'mapping_active':None if identity in release.NEW else True,
                 'mapping_confirmed':None if identity in release.NEW else True,
                 'mapping_version':None if identity in release.NEW else 'fixture-reviewed'}
        p={'id':spec[1],'sku':f'TEST-{index}','status':'published','content_status':'ready','condition':'used',
           'product_type':'device','model':model,'color':color,'title':scalar['Title'],
           'stock_status':'available','stock_quantity':1,'price':spec[2],
           'completeness':'Устройство, коробка, кабель','warranty_text':'Гарантия 90 дней',
           'category':{'id':release.CATEGORY_ID,'slug':'smartphones','name':'TEST PHONES'},
           'listing_file':photos[0]['id'],'images':photos,'listings':[listing],
           'device_details':[{'grade':'A','storage':'256 ГБ','battery':battery,'battery_cycles':cycles,
                              'diagnostic_date':spec[3],'sim':None,'activation_lock':None,'mdm':None}],
           'inventory':[{'id':f'00000000-0000-4000-8000-{index*100+1:012}','source_sku':f'TEST-{index}',
                         'quantity':1,'retail_price':spec[2],'identity_status':'matched','eligibility_status':'eligible',
                         'authenticity_status':'verified','for_sale':True,'review_override':True,'review_note_present':True,
                         'serial_present':True,'imei_present':False,'duplicate_serial':False,'linked_receipts':1,
                         'exact_serial_receipts':1,'open_issue_codes':[]}],
           'offers':[{'id':f'00000000-0000-4000-8000-{index*100+2:012}','location':'belgorod',
                      'status':'published','price':spec[2],'stock_quantity':1,'stock_status':'available'}],
           'passports':[{'diagnostics_status':'complete','condition_note':'TEST','condition_notes':[],
                          'repair':'TEST','water':None,'summary_rows':[],'diagnostics_checklist':[],'story_facts':[]}],
           'reports':[{'status':'current','public_file':f'00000000-0000-4000-8000-{index*100+3:012}',
                        'provider':'TEST','tested_at':spec[3],'public_note':'TEST'}]}
        source['products'].append(p)
        rows.append({**listing,'product':p['id'],'notes':'unowned fixture note','updated_at':'2026-10-07T00:00:00+00:00'})
        rows[-1]['attributes']={} if identity in release.NEW else attributes
    xml=ET.tostring(root,encoding='utf-8',xml_declaration=True)+b'\n'
    old=ET.Element('Ads',dict(root.attrib))
    for ad in list(root)[:3]: old.append(deepcopy(ad))
    existing=ET.tostring(old,encoding='utf-8',xml_declaration=True)+b'\n'
    desired=[]
    for ad in list(root)[3:]:
        spec=release.NEW[ad.findtext('Id')]
        desired.append({'id':spec[0],'product':spec[1],'external_id':ad.findtext('Id'),'channel':'avito',
                        'status':'active','category_mapping':release.MAPPING_ID,
                        'title_override':ad.findtext('Title'),'description_override':ad.findtext('Description'),
                        'attributes':{c.tag:c.text for c in ad if c.tag not in
                                      {'Id','Category','GoodsType','Title','Description','Price','Images'}}})
    source['products'].sort(key=lambda p:p['id'])
    plan={'schema_version':1,'xml_sha256':hashlib.sha256(xml).hexdigest(),
          'existing_feed_sha256':hashlib.sha256(existing).hexdigest(),'source_captured_at':'2026-10-07T00:00:00+00:00',
          'existing_ids':list(release.PILOT),'new_ids':list(release.NEW),'allowed_ids':release.ALL_IDS,
          'mapping_id':release.MAPPING_ID,'mapping_version':'fixture-reviewed','expected_before':source,'desired':desired}
    plan['public_photo_sha256']={image.get('url').split('/assets/',1)[1].split('?',1)[0]:'0'*64
                                 for ad in root for image in ad.findall('Images/Image')}
    plan['expected_active']=active_projection(plan)
    state={'listings':sorted(rows,key=lambda r:r['id']),
           'mapping':{'id':release.MAPPING_ID,'channel':'avito','product_category':release.CATEGORY_ID,
                      'external_category':'Телефоны','external_goods_type':'Мобильные телефоны',
                      'template_version':'fixture-reviewed','default_attributes':{},'is_active':True,'is_confirmed':True}}
    return plan,xml,existing,state


def active_projection(plan):
    active=deepcopy(plan['expected_before'])
    for row in plan['desired']:
        target=next(p for p in active['products'] if p['id']==row['product'])['listings'][0]
        target.update({key:row[key] for key in release.EDIT_FIELDS})
        target['attributes']={k:v for k,v in row['attributes'].items() if k in release.EXPORT_ATTRS}
        target.update(mapping_active=True,mapping_confirmed=True,mapping_version=plan['mapping_version'])
    return active


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.plan,self.xml,self.existing,self.state=fixture()
        self.hash_patch=patch.object(release,'APPROVED_HASH',self.plan['xml_sha256'])
        self.hash_patch.start()
        self.addCleanup(self.hash_patch.stop)

    def test_exact_three_new_rows_and_t14_variable_battery(self):
        release.validate_plan(self.plan,self.xml)
        self.assertEqual(len(self.plan['desired']),3)
        self.assertEqual(next(r for r in self.plan['desired'] if r['external_id']==release.ALL_IDS[4])['attributes']['Akb'],'99')
        self.assertEqual(next(p for p in self.plan['expected_before']['products'] if p['id']==release.NEW[release.ALL_IDS[4]][1])['device_details'][0]['battery_cycles'],259)

    def test_changed_xml_or_desired_attributes_rejected(self):
        with self.assertRaises(ValueError): release.validate_plan(self.plan,self.xml+b' ')
        for key,value in [('status','draft'),('attributes',{'Color':'бежевый'}),('description_override','changed')]:
            plan=deepcopy(self.plan); plan['desired'][1][key]=value
            with self.subTest(key=key),self.assertRaises(ValueError): release.validate_plan(plan,self.xml)

    def test_bad_source_and_forged_active_projection_rejected(self):
        for action in ('sold','price','inventory','battery','photos','active','offer'):
            plan=deepcopy(self.plan); product=plan['expected_before']['products'][0]
            if action=='sold': product['stock_status']='sold'
            elif action=='price': product['price']=1
            elif action=='inventory': product['inventory'][0]['eligibility_status']='blocked'
            elif action=='battery': product['device_details'][0]['battery_cycles']=999
            elif action=='photos': product['images'].reverse()
            elif action=='active': plan['expected_active']['products'][0]['price']=1
            else: product['offers'][0]['stock_quantity']=0
            if action=='photos':
                product['images'][1]['id']='00000000-0000-4000-8000-000000090909'
            with self.subTest(action=action),self.assertRaises(ValueError): release.validate_plan(plan,self.xml)

    def test_apply_authorization_is_separate_and_72h_is_real(self):
        auth={'source':'owner_release_authorization','authorized':True,'scope':'six_ad_live_feed_expansion',
              'xml_sha256':self.plan['xml_sha256'],'allowed_ids':release.ALL_IDS,'no_unapproved_extra_costs':True}
        evidence={'source':'owner_confirmation','xml_sha256':self.plan['xml_sha256'],'kind':'observed_72h',
                  'observed_since':'2026-10-07T10:00:00+00:00','confirmed_at':'2026-10-10T10:00:00+00:00','no_sync_issues':True}
        now=datetime(2026,10,10,11,tzinfo=timezone.utc)
        release.require_authorization(self.plan,auth,evidence,now)
        with self.assertRaises(ValueError): release.require_authorization(self.plan,{},evidence,now)
        short={**evidence,'confirmed_at':'2026-10-07T11:00:00+00:00'}
        with self.assertRaises(ValueError): release.require_authorization(self.plan,auth,short,now)
        with self.assertRaises(ValueError): release.require_authorization(self.plan,{**auth,'no_unapproved_extra_costs':False},evidence,now)
        waiver={'source':'owner_confirmation','xml_sha256':self.plan['xml_sha256'],'kind':'explicit_72h_waiver','waived':True}
        release.require_authorization(self.plan,auth,waiver,now)
        with self.assertRaises(ValueError): release.require_authorization(self.plan,auth,{**waiver,'waived':False},now)
        with self.assertRaises(ValueError): release.require_authorization(self.plan,auth,{},now,rollback=True)
        release.require_authorization(self.plan,{**auth,'scope':'rollback_new_avito_batch'},{},now,rollback=True)

    def test_sql_updates_only_three_channels_and_preserves_mapping(self):
        sql=operator.transaction_sql(self.plan,self.state,self.xml,write=True)
        self.assertIn('UPDATE product_channel_listings',sql)
        self.assertIn('LOCK TABLE',sql)
        self.assertIn('Protected business data changed',sql)
        self.assertTrue(sql.rstrip().endswith('ROLLBACK;'))
        for forbidden in ('UPDATE products','UPDATE inventory_items','UPDATE product_offers','INSERT INTO channel_category_mappings','DELETE FROM channel_category_mappings'):
            self.assertNotIn(forbidden,sql)
        self.assertNotIn('UPDATE product_channel_listings',operator.transaction_sql(self.plan,self.state,self.xml).split('IF false')[0])

    def test_mapping_and_channel_identity_guard(self):
        for action in ('mapping','price','duplicate'):
            state=deepcopy(self.state)
            if action=='mapping': state['mapping']['is_confirmed']=False
            elif action=='price': state['listings'][0]['price_override']=1
            else: state['listings'].append(deepcopy(state['listings'][0]))
            with self.subTest(action=action),self.assertRaises(ValueError): operator.validate_state(self.plan,state)

    def test_rollback_preserves_unowned_notes_and_refuses_owned_edits(self):
        current=deepcopy(self.state)
        for desired in self.plan['desired']:
            row=next(r for r in current['listings'] if r['id']==desired['id'])
            row.update({key:desired[key] for key in release.EDIT_FIELDS})
        receipt={'xml_sha256':self.plan['xml_sha256'],'before':self.state,
                 'after':[deepcopy(r) for r in current['listings'] if r['external_id'] in release.NEW]}
        row=next(r for r in current['listings'] if r['external_id'] in release.NEW)
        row['notes']='later unowned note'
        sql=operator.rollback_sql(self.plan,current,receipt)
        self.assertNotIn('notes=old.notes',sql)
        self.assertNotIn('DELETE FROM channel_category_mappings',sql)
        row['description_override']='later editorial change'
        with self.assertRaises(ValueError): operator.rollback_sql(self.plan,current,receipt)

    def test_backup_path_rejected_before_commands(self):
        with self.assertRaises(ValueError): operator.require_fresh_backup(Path('/unapproved/backup'))

    def test_public_media_hash_is_checked_without_auth_or_redirects(self):
        body=b'\xff\xd8\xffsynthetic-fixture'
        plan=deepcopy(self.plan)
        plan['public_photo_sha256']={key:hashlib.sha256(body).hexdigest() for key in plan['public_photo_sha256']}
        calls=[]
        class Headers:
            def get_content_type(self): return 'image/jpeg'
        class Response(BytesIO):
            status=200
            headers=Headers()
        class Opener:
            def open(self,url,timeout):
                calls.append(url)
                assert timeout==30 and isinstance(url,str) and url.startswith('https://api.isvoi.ru/assets/')
                return Response(body)
        with patch.object(operator,'build_opener',return_value=Opener()):
            operator.verify_public_images(plan)
            self.assertEqual(len(calls),36)
            plan['public_photo_sha256'][next(iter(plan['public_photo_sha256']))]='0'*64
            with self.assertRaises(ValueError): operator.verify_public_images(plan)

    def test_environment_stays_at_the_existing_three_ids(self):
        text='AVITO_FEED_ENABLED=1\nAVITO_PHONE_SCHEMA_VERIFIED=1\nAVITO_FEED_ALLOWED_IDS='+','.join(release.PILOT)+'\nUNRELATED_SECRET=fixture\n'
        with patch.object(Path,'read_text',return_value=text): operator.require_three_id_environment(Path('/opt/isvoi'))
        for malformed in (text+'AVITO_FEED_ENABLED=1\n',text.replace(','.join(release.PILOT),','.join(release.ALL_IDS))):
            with patch.object(Path,'read_text',return_value=malformed),self.assertRaises(ValueError):
                operator.require_three_id_environment(Path('/opt/isvoi'))


if __name__=='__main__': unittest.main()
