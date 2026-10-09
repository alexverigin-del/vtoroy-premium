"""Synthetic nine-ad contracts, activation and guarded rollback regression tests."""
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
from pathlib import Path
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

import prepare_avito_followup_release as release
import activate_avito_expansion as operator
from test_avito_expansion_release import fixture as previous_fixture


def fixture():
    previous, old_xml, _, old_state = previous_fixture()
    old_ads = {a.findtext('Id'): a for a in ET.fromstring(old_xml)}
    source = deepcopy(previous['expected_before'])
    template = deepcopy(source['products'][0])
    rows, public = [], {'captured_at': '2026-10-09T10:00:00+00:00', 'ok': True,
                       'pages': [], 'certificates': [], 'images': {'ok': True, 'products': []}}
    root = ET.Element('Ads', formatVersion='3', target='Avito.ru')
    products = []
    for index, (identity, spec) in enumerate(release.IDENTITIES.items(), 1):
        p = deepcopy(next((p for p in source['products'] if p['id'] == spec[1]), template))
        ad = deepcopy(old_ads.get(identity, next(iter(old_ads.values()))))
        p.update(id=spec[1], sku=spec[7], price=spec[2])
        p['device_details'][0].update(diagnostic_date=spec[3], battery=spec[4], battery_cycles=spec[5])
        p['reports'][0].update(tested_at=spec[3], public_file=f'00000000-0000-4000-8000-{index*100+3:012}')
        p['inventory'][0].update(id=f'00000000-0000-4000-8000-{index*100+1:012}', source_sku=spec[7], retail_price=spec[2])
        p['offers'][0].update(id=f'00000000-0000-4000-8000-{index*100+2:012}', price=spec[2])
        ad.find('Id').text = identity
        ad.find('Price').text = str(spec[2])
        ad.find('Akb').text = spec[4].rstrip('%')
        images = ad.find('Images')
        images.clear()
        p['images'] = []
        for photo in range(spec[6]):
            asset = f'00000000-0000-4000-8000-{index*1000+photo:012}'
            p['images'].append({'id': asset, 'role': 'card' if photo == 0 else 'gallery', 'sort': photo, 'label': 'TEST'})
            ET.SubElement(images, 'Image', url='https://api.isvoi.ru/assets/'+asset+'?width=1600&height=1600&fit=inside&format=jpg&quality=90')
        p['listing_file'] = p['images'][0]['id']
        listing = p['listings'][0]
        listing.update(id=spec[0], external_id=identity, status='draft' if identity in release.NEW else 'active',
                       category_mapping=None if identity in release.NEW else release.MAPPING_ID,
                       title_override=None if identity in release.NEW else ad.findtext('Title'),
                       description_override=None if identity in release.NEW else ad.findtext('Description'),
                       attributes={} if identity in release.NEW else {k:v for k,v in release.attributes(ad).items() if k in release.EXPORT_ATTRS},
                       mapping_active=None if identity in release.NEW else True,
                       mapping_confirmed=None if identity in release.NEW else True,
                       mapping_version=None if identity in release.NEW else 'fixture-reviewed')
        rows.append({**listing, 'product': p['id'], 'notes': 'unowned fixture note', 'updated_at': '2026-10-09T00:00:00+00:00',
                     'attributes': {} if identity in release.NEW else release.attributes(ad)})
        public['pages'].append({'product_id': p['id'], 'ok': True})
        public['certificates'].append({'sku': p['sku'], 'ok': True})
        public['images']['products'].append({'product_id': p['id'], 'ok': True,
             'images': [{'asset_id': i['id'], 'sha256': '0'*64, 'ok': True} for i in p['images']]})
        products.append(p)
        root.append(ad)
    snapshot = {'captured_at': public['captured_at'], 'private_identifier_redactions': 0,
                'products': products, 'stores': source['stores']}
    xml = ET.tostring(root, encoding='utf-8', xml_declaration=True) + b'\n'
    old = ET.Element('Ads', dict(root.attrib))
    old.extend(deepcopy(root[:6]))
    existing = ET.tostring(old, encoding='utf-8', xml_declaration=True) + b'\n'
    xml_hash, old_hash = hashlib.sha256(xml).hexdigest(), hashlib.sha256(existing).hexdigest()
    validator = {'source': 'owner_chat_report', 'xml_sha256': xml_hash, 'validation_passed_owner_reported': True}
    approval = {'scope': 'exact_description_approval_and_offline_XML_only', 'entries': [
        {'external_id': a.findtext('Id'), 'title_sha256': hashlib.sha256(a.findtext('Title').encode()).hexdigest(),
         'description_sha256': hashlib.sha256(a.findtext('Description').encode()).hexdigest()} for a in root[6:]]}
    with patch.object(release, 'APPROVED_HASH', xml_hash), patch.object(release, 'EXISTING_HASH', old_hash):
        plan = release.make_plan(xml, snapshot, validator, approval, existing, public)
    return plan, xml, existing, {'listings': sorted(rows, key=lambda r:r['id']), 'mapping': old_state['mapping']}


class FollowupTests(unittest.TestCase):
    def setUp(self):
        self.plan, self.xml, self.existing, self.state = fixture()
        for key, value in [('APPROVED_HASH', self.plan['xml_sha256']), ('EXISTING_HASH', self.plan['existing_feed_sha256'])]:
            p = patch.object(release, key, value)
            p.start()
            self.addCleanup(p.stop)

    def test_exact_nine_contract_and_five_photo_devices(self):
        release.validate_plan(self.plan, self.xml)
        self.assertEqual(len(self.plan['public_photo_sha256']), 52)
        self.assertEqual(len(self.plan['desired']), 3)
        self.assertEqual([len(a.findall('Images/Image')) for a in ET.fromstring(self.xml)[6:]], [6, 5, 5])

    def test_copy_hash_or_roster_changes_are_rejected(self):
        with self.assertRaises(ValueError): release.validate_plan(self.plan, self.xml+b' ')
        for field, value in [('allowed_ids', release.ALL_IDS[:-1]), ('xml_sha256', '0'*64), ('schema_version', 1)]:
            plan = deepcopy(self.plan)
            plan[field] = value
            with self.subTest(field=field), self.assertRaises(ValueError): release.validate_plan(plan, self.xml)

    def test_stock_battery_offer_and_serial_identity_drift_refused(self):
        for change in ('stock', 'battery', 'offer', 'identity', 'price', 'sku', 'grade'):
            plan = deepcopy(self.plan)
            p = next(p for p in plan['expected_before']['products'] if p['id'] == next(iter(release.NEW.values()))[1])
            if change == 'stock': p['stock_quantity'] = 0
            elif change == 'battery': p['device_details'][0]['battery_cycles'] = 999
            elif change == 'offer': p['offers'][0]['price'] = 1
            elif change == 'identity': p['inventory'][0]['duplicate_serial'] = True
            elif change == 'price': p['inventory'][0]['retail_price'] = 1
            elif change == 'sku': p['sku'] = 'wrong'
            else: p['device_details'][0]['grade'] = 'B'
            with self.subTest(change=change), self.assertRaises(ValueError): release.validate_plan(plan, self.xml)

    def test_existing_copy_and_new_fields_cannot_be_changed(self):
        for change in ('existing', 'new', 'projection', 'private_attr'):
            plan = deepcopy(self.plan)
            if change == 'existing':
                p = next(p for p in plan['expected_before']['products'] if p['id'] == next(iter(release.EXISTING.values()))[1])
                p['listings'][0]['description_override'] = 'changed'
            elif change == 'new': plan['desired'][0]['description_override'] = 'changed'
            elif change == 'private_attr': plan['desired'][0]['attributes']['PurchasePrice'] = 1
            else: plan['expected_active']['products'][0]['price'] = 1
            with self.subTest(change=change), self.assertRaises(ValueError): release.validate_plan(plan, self.xml)

    def test_authorization_and_waiver_are_exact_not_inherited(self):
        auth = {'source':'owner_release_authorization','authorized':True,'scope':'nine_ad_live_feed_expansion',
                'xml_sha256': self.plan['xml_sha256'], 'allowed_ids': release.ALL_IDS, 'no_unapproved_extra_costs': True}
        waiver = {'source':'owner_confirmation','xml_sha256':self.plan['xml_sha256'], 'kind':'explicit_72h_waiver','waived':True}
        release.require_authorization(self.plan, auth, waiver)
        for invalid in ({}, {**auth, 'scope':'six_ad_live_feed_expansion'}, {**auth, 'no_unapproved_extra_costs':False}):
            with self.assertRaises(ValueError): release.require_authorization(self.plan, invalid, waiver)
        with self.assertRaises(ValueError): release.require_authorization(self.plan, auth, {})

    def test_nine_row_transaction_only_updates_three_new_rows(self):
        sql = operator.transaction_sql(self.plan, self.state, self.xml, write=True,
                                       identities=release.IDENTITIES, new_rows=release.NEW)
        self.assertIn('Expected exactly three changes', sql)
        self.assertIn('Protected business data changed', sql)
        for table in ('products', 'inventory_items', 'product_offers', 'product_images', 'channel_category_mappings'):
            self.assertNotIn('UPDATE '+table, sql)
        self.assertTrue(sql.rstrip().endswith('ROLLBACK;'))
        with self.assertRaises(ValueError): operator.validate_state(self.plan, self.state)

    def test_six_id_environment_stays_until_switch(self):
        text='AVITO_FEED_ENABLED=1\nAVITO_PHONE_SCHEMA_VERIFIED=1\nAVITO_FEED_ALLOWED_IDS='+','.join(release.EXISTING_IDS)+'\n'
        with patch.object(Path, 'read_text', return_value=text): operator.require_id_environment(Path('/opt/isvoi'), release.EXISTING_IDS)
        with patch.object(Path, 'read_text', return_value=text), self.assertRaises(ValueError):
            operator.require_id_environment(Path('/opt/isvoi'), release.ALL_IDS)

    def test_rollback_preserves_notes_and_refuses_owned_edits(self):
        after = deepcopy(self.state)
        for row in self.plan['desired']:
            target = next(r for r in after['listings'] if r['id'] == row['id'])
            target.update({k:row[k] for k in release.EDIT_FIELDS})
        receipt = {'xml_sha256': self.plan['xml_sha256'], 'before': self.state,
                   'after': [deepcopy(r) for r in after['listings'] if r['external_id'] in release.NEW]}
        target = next(r for r in after['listings'] if r['external_id'] in release.NEW)
        target['notes'] = 'later note'
        sql = operator.rollback_sql(self.plan, after, receipt, release.NEW)
        self.assertNotIn('notes=old.notes', sql)
        target['title_override'] = 'later owned edit'
        with self.assertRaises(ValueError): operator.rollback_sql(self.plan, after, receipt, release.NEW)


if __name__ == '__main__':
    unittest.main()
