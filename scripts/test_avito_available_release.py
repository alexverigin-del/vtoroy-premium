"""Synthetic sold-aware activation and rollback contract checks."""
from copy import deepcopy
import hashlib
from pathlib import Path
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

import prepare_avito_available_release as release
import activate_avito_expansion as operator
from prepare_avito_available_batch_review import REFERENCE_MODELS, build_review, digest
from prepare_avito_catalog_workbook import balanced_copy, image_urls
from test_avito_followup_release import fixture as previous_fixture


def fixture():
    previous, old_xml, _, old_state = previous_fixture()
    source = deepcopy(previous['expected_active'])
    old_ads = {a.findtext('Id'): a for a in ET.fromstring(old_xml)}
    sold = next(p for p in source['products'] if p['sku'] == 'т11')
    sold.update(stock_status='sold', stock_quantity=0)
    sold['offers'][0].update(stock_status='sold', stock_quantity=0)
    day = '2026-10-12'
    public = deepcopy(previous['public_preflight'])
    public['captured_at'] = day + 'T13:00:00+00:00'
    public['pages'] = [p for p in public['pages'] if p['product_id'] != sold['id']]
    public['certificates'] = [p for p in public['certificates'] if p['sku'] != 'т11']
    public['images']['products'] = [p for p in public['images']['products'] if p['product_id'] != sold['id']]
    rows = []
    for p in source['products']:
        l = p['listings'][0]
        row = deepcopy(next(r for r in old_state['listings'] if r['id'] == l['id']))
        row.update({k: l[k] for k in release.EDIT_FIELDS})
        row['attributes'] = release.attributes(old_ads[l['external_id']])
        rows.append(row)
    copy = {'source': 'owner_chat_confirmation', 'scope': 'exact_copy_and_physical_facts_not_publication',
            'confirmed_on': day, 'copy_operator_approved': True, 'publication_authorized': False, 'entries': []}
    template = deepcopy(source['products'][0])
    for index, (identity, spec) in enumerate(release.NEW.items(), 30):
        p = deepcopy(template)
        sku = spec[7]
        p.update(id=spec[1], sku=sku, price=spec[2], stock_status='available', stock_quantity=1,
                 model='iPhone 14 Pro' if sku == 'т39' else 'iPhone 15 Pro Max',
                 color={'т20': 'Natural Titanium', 'т39': 'Deep Purple', 'т18': 'Blue Titanium'}[sku])
        p['device_details'][0].update(storage='512 ГБ' if sku == 'т20' else '256 ГБ',
            grade='A' if sku == 'т20' else 'B', diagnostic_date=spec[3], battery=spec[4], battery_cycles=spec[5])
        p['reports'][0].update(tested_at=spec[3], public_file=f'00000000-0000-4000-8000-{index*100+3:012}')
        p['inventory'][0].update(id=f'00000000-0000-4000-8000-{index*100+1:012}', source_sku=sku, retail_price=spec[2])
        p['offers'][0].update(id=f'00000000-0000-4000-8000-{index*100+2:012}', price=spec[2],
                              stock_status='available', stock_quantity=1)
        p['passports'][0]['condition_note'] = {'т20': 'Грейд A. Нет замечаний по корпусу.',
            'т39': 'Грейд B из-за мелких потертостей и точечных следов на боковых гранях.',
            'т18': 'Грейд B из-за состояния аккумулятора 88%. Нет замечаний по корпусу.'}[sku]
        p['images'] = [{'id': f'00000000-0000-4000-8000-{index*1000+n:012}',
                        'role': 'card' if n == 0 else 'gallery', 'sort': n, 'label': 'TEST'} for n in range(6)]
        p['listing_file'] = p['images'][0]['id']
        p['listings'] = [{'id': spec[0], 'external_id': identity, 'channel': 'avito', 'status': 'draft',
            'category_mapping': None, 'title_override': None, 'description_override': None, 'price_override': None,
            'attributes': {}, 'mapping_active': None, 'mapping_confirmed': None, 'mapping_version': None}]
        rows.append({**p['listings'][0], 'product': p['id'], 'notes': 'unowned fixture note',
                     'updated_at': '2026-10-12T00:00:00+00:00'})
        public['pages'].append({'product_id': p['id'], 'ok': True})
        public['certificates'].append({'sku': sku, 'ok': True})
        public['images']['products'].append({'product_id': p['id'], 'ok': True,
            'images': [{'asset_id': i['id'], 'sha256': '0'*64, 'ok': True} for i in p['images']]})
        title, description = balanced_copy(p, source['stores'][0]['address'])
        copy['entries'].append({'sku': sku, 'external_id': identity, 'product_id': p['id'], 'price_rub': spec[2],
            'title_sha256': digest(title), 'description_sha256': digest(description),
            'grade': p['device_details'][0]['grade'], 'diagnostic_date': spec[3], 'battery_percent': int(spec[4][:-1]),
            'battery_cycles': spec[5], 'image_urls': image_urls(p), 'owner_facts_confirmed': True,
            'confirmed_phone_attributes': {'ScreenCondition': 'Без дефектов', 'BoxSealed': 'Нет',
                'CaseCondition': 'Мелкие царапины' if sku == 'т39' else 'Без дефектов'}})
        source['products'].append(p)
    old_root = ET.Element('Ads', formatVersion='3', target='Avito.ru')
    old_root.extend(deepcopy(old_ads[i]) for i in release.AVAILABLE_EXISTING_IDS)
    existing = ET.tostring(old_root, encoding='utf-8', xml_declaration=True) + b'\n'
    copy.update(existing_ids=release.AVAILABLE_EXISTING_IDS, existing_feed_sha256=hashlib.sha256(existing).hexdigest())
    references = {'scope': 'model_hardware_reference_not_avito_catalog_validation', 'checked_on': day,
                  'models': {m: {'attributes': {'RamSize': ram}, 'source_url': url} for m, (ram, url) in REFERENCE_MODELS.items()}}
    snapshot = {**source, 'captured_at': public['captured_at'], 'private_identifier_redactions': 0}
    xml, _ = build_review(snapshot, public, existing, copy, references)
    xhash = hashlib.sha256(xml).hexdigest()
    validator = {'source': 'owner_chat_report', 'xml_sha256': xhash, 'validation_passed_owner_reported': True}
    with patch.object(release, 'APPROVED_HASH', xhash), patch.object(release, 'EXISTING_HASH', copy['existing_feed_sha256']):
        plan = release.make_plan(xml, snapshot, validator, copy, existing, public, references)
    return plan, xml, existing, {'listings': sorted(rows, key=lambda r: r['id']), 'mapping': old_state['mapping']}


class AvailableReleaseTests(unittest.TestCase):
    def setUp(self):
        self.plan, self.xml, self.existing, self.state = fixture()
        for key, value in [('APPROVED_HASH', self.plan['xml_sha256']), ('EXISTING_HASH', self.plan['existing_feed_sha256'])]:
            handle = patch.object(release, key, value)
            handle.start()
            self.addCleanup(handle.stop)

    def test_twelve_registered_eleven_available_and_grade_b(self):
        release.validate_plan(self.plan, self.xml)
        self.assertEqual(len(self.plan['allowed_ids']), 12)
        self.assertEqual(len(self.plan['xml_ids']), 11)
        self.assertEqual(len(self.plan['public_photo_sha256']), 64)
        self.assertNotIn(release.SOLD_ID, self.plan['xml_ids'])
        self.assertEqual(self.plan['desired'][1]['attributes']['CaseCondition'], 'Мелкие царапины')
        self.assertEqual(self.plan['desired'][2]['attributes']['CaseCondition'], 'Без дефектов')

    def test_fact_copy_projection_and_roster_drift_fail_closed(self):
        for change in ('sold_restore', 'grade', 'battery', 'inventory', 'case', 'copy', 'projection', 'roster', 'fingerprint'):
            plan = deepcopy(self.plan)
            p = next(p for p in plan['expected_before']['products'] if p['sku'] == 'т39')
            if change == 'sold_restore': next(p for p in plan['expected_before']['products'] if p['sku'] == 'т11')['stock_quantity'] = 1
            if change == 'grade': p['device_details'][0]['grade'] = 'A'
            if change == 'battery': p['device_details'][0]['battery_cycles'] = 999
            if change == 'inventory': p['inventory'][0]['duplicate_serial'] = True
            if change == 'case': plan['desired'][1]['attributes']['CaseCondition'] = 'Без дефектов'
            if change == 'copy': plan['copy_approval']['entries'][1]['description_sha256'] = '0'*64
            if change == 'projection': plan['expected_active']['products'][0]['price'] = 1
            if change == 'roster': plan['allowed_ids'] = plan['xml_ids']
            if change == 'fingerprint': plan['public_photo_sha256'].pop(next(iter(plan['public_photo_sha256'])))
            with self.subTest(change=change), self.assertRaises(ValueError): release.validate_plan(plan, self.xml)

    def test_authorization_and_waiver_are_not_inherited(self):
        auth = {'source': 'owner_release_authorization', 'authorized': True, 'scope': 'eleven_available_ad_live_feed_expansion',
                'xml_sha256': self.plan['xml_sha256'], 'allowed_ids': release.ALL_IDS, 'no_unapproved_extra_costs': True}
        waiver = {'source': 'owner_confirmation', 'xml_sha256': self.plan['xml_sha256'], 'kind': 'explicit_72h_waiver', 'waived': True}
        release.require_authorization(self.plan, auth, waiver)
        for invalid in ({}, {**auth, 'scope': 'nine_ad_live_feed_expansion'}, {**auth, 'allowed_ids': release.XML_IDS}):
            with self.assertRaises(ValueError): release.require_authorization(self.plan, invalid, waiver)
        with self.assertRaises(ValueError): release.require_authorization(self.plan, auth, {})

    def test_twelve_row_transaction_only_updates_three_and_rollback_preserves_notes(self):
        sql = operator.transaction_sql(self.plan, self.state, self.xml, write=True,
                                       identities=release.IDENTITIES, new_rows=release.NEW)
        self.assertTrue(sql.rstrip().endswith('ROLLBACK;'))
        self.assertIn('Expected exactly three changes', sql)
        for table in ('products', 'product_offers', 'inventory_items', 'product_images'):
            self.assertNotIn('UPDATE ' + table, sql)
        after = deepcopy(self.state)
        for row in self.plan['desired']:
            next(r for r in after['listings'] if r['id'] == row['id']).update({k: row[k] for k in release.EDIT_FIELDS})
        receipt = {'xml_sha256': self.plan['xml_sha256'], 'before': self.state,
                   'after': deepcopy([r for r in after['listings'] if r['external_id'] in release.NEW])}
        target = next(r for r in after['listings'] if r['external_id'] in release.NEW)
        target['notes'] = 'later note'
        self.assertNotIn('notes=old.notes', operator.rollback_sql(self.plan, after, receipt, release.NEW))
        target['title_override'] = 'later edit'
        with self.assertRaises(ValueError): operator.rollback_sql(self.plan, after, receipt, release.NEW)

    def test_environment_retains_nine_including_sold_until_switch(self):
        text = 'AVITO_FEED_ENABLED=1\nAVITO_PHONE_SCHEMA_VERIFIED=1\nAVITO_FEED_ALLOWED_IDS=' + ','.join(release.EXISTING_IDS)
        with patch.object(Path, 'read_text', return_value=text): operator.require_id_environment(Path('/opt/isvoi'), release.EXISTING_IDS)
        with patch.object(Path, 'read_text', return_value=text), self.assertRaises(ValueError):
            operator.require_id_environment(Path('/opt/isvoi'), release.ALL_IDS)


if __name__ == '__main__':
    unittest.main()
