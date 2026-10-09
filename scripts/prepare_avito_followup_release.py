"""Exact nine-ad release contract; preparation never publishes anything."""
import argparse
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re

from activate_avito_pilot import CATEGORY_ID, MAPPING_ID, PILOT
from prepare_avito_expansion_release import NEW as PREVIOUS_NEW, EDIT_FIELDS, EXPORT_ATTRS
from prepare_avito_expansion_review import parse_ads
from prepare_avito_catalog_workbook import assess, image_urls, one

APPROVED_HASH = '77bdc8705f26d2555d4fb8db0fa956da7dde1b2acb9fb6ab91e0e4625e407e4f'
EXISTING_HASH = 'ced267b8c8d192ab174b4ec1473b21feb3e2083a3691952e963c8e239cd608d1'
EXISTING = {
    list(PREVIOUS_NEW)[0]: (*list(PREVIOUS_NEW.values())[0], 6, 'т13'),
    list(PILOT)[0]: (*list(PILOT.values())[0], '100%', 0, 6, 'т11'),
    list(PREVIOUS_NEW)[2]: (*list(PREVIOUS_NEW.values())[2], 6, 'т27'),
    list(PILOT)[1]: (*list(PILOT.values())[1], '100%', 0, 6, 'т29'),
    list(PILOT)[2]: (*list(PILOT.values())[2], '100%', 0, 6, 'т12'),
    list(PREVIOUS_NEW)[1]: (*list(PREVIOUS_NEW.values())[1], 6, 'т14'),
}
NEW = {
    'isvoi-9bdb8313-84b0-4884-9491-993c9516923b': ('7c0e49ae-ad5f-4392-ae55-90c2e24c1342',
        'iphone-15-pro-natural-titanium-256-t9', 53900, '2026-08-05', '100%', 0, 6, 'т9'),
    'isvoi-c476a8ff-21c7-4a22-946b-4b08aad229c0': ('7f79b855-6759-4902-8b49-8568cac31fd3',
        'apple-iphone-16-pro-max-512-black-titanium-c476a8ff', 80300, '2026-08-10', '92%', 307, 5, 'т24'),
    'isvoi-57d1ecdb-f2b1-4cf3-997a-f6ee1ba96a91': ('719628f2-ea40-4467-90b4-bd107b57169a',
        'apple-iphone-16-pro-256-white-titanium-57d1ecdb', 70500, '2026-08-10', '90%', 541, 5, 'т26'),
}
IDENTITIES = EXISTING | NEW
ALL_IDS = list(IDENTITIES)
EXISTING_IDS = list(EXISTING)
CODE_CAP = 9
RECEIPT_NAME = 'avito-nine-ad-receipt.json'


def attributes(ad):
    return {c.tag: c.text for c in ad if c.tag not in
            {'Id', 'Category', 'GoodsType', 'Title', 'Description', 'Price', 'Images'}}


def projection(source, desired, version):
    active = deepcopy(source)
    for row in desired:
        target = one([p for p in active['products'] if p['id'] == row['product']])['listings'][0]
        target.update({key: row[key] for key in EDIT_FIELDS})
        target['attributes'] = {key: value for key, value in row['attributes'].items() if key in EXPORT_ATTRS}
        target.update(mapping_active=True, mapping_confirmed=True, mapping_version=version)
    return active


def make_plan(xml, snapshot, validator, copy_approval, existing_xml, public):
    if (hashlib.sha256(xml).hexdigest() != APPROVED_HASH
            or hashlib.sha256(existing_xml).hexdigest() != EXISTING_HASH
            or validator.get('xml_sha256') != APPROVED_HASH
            or validator.get('validation_passed_owner_reported') is not True
            or validator.get('source') != 'owner_chat_report'
            or copy_approval.get('scope') != 'exact_description_approval_and_offline_XML_only'
            or public.get('captured_at') != snapshot.get('captured_at')
            or not public.get('ok') or snapshot.get('private_identifier_redactions')):
        raise ValueError('Exact validated XML/source/copy/public evidence required')
    root, ids = parse_ads(xml)
    previous, previous_ids = parse_ads(existing_xml)
    value = lambda ad: {c.tag: [dict(i.attrib) for i in c] if c.tag == 'Images' else c.text for c in ad}
    if ids != ALL_IDS or previous_ids != EXISTING_IDS or [value(a) for a in root[:6]] != [value(a) for a in previous]:
        raise ValueError('Existing six fields or exact nine-ID roster changed')
    products = [deepcopy(p) for p in snapshot['products'] if p['id'] in {s[1] for s in IDENTITIES.values()}]
    stores = [s for s in snapshot['stores'] if s['slug'] == 'belgorod']
    if len(products) != 9 or len(stores) != 1:
        raise ValueError('Ambiguous release source')
    source = {'products': sorted(products, key=lambda p: p['id']), 'stores': stores}
    version = one(one([p for p in products if p['id'] == next(iter(EXISTING.values()))[1]])['listings'])['mapping_version']
    desired = []
    for ad in root[6:]:
        identity = ad.findtext('Id')
        approved = one([e for e in copy_approval['entries'] if e['external_id'] == identity])
        if (approved.get('title_sha256') != hashlib.sha256(ad.findtext('Title').encode()).hexdigest()
                or approved.get('description_sha256') != hashlib.sha256(ad.findtext('Description').encode()).hexdigest()):
            raise ValueError('Approved exact copy differs from XML')
        desired.append({'id': NEW[identity][0], 'product': NEW[identity][1], 'external_id': identity,
                        'channel': 'avito', 'status': 'active', 'category_mapping': MAPPING_ID,
                        'title_override': ad.findtext('Title'), 'description_override': ad.findtext('Description'),
                        'attributes': attributes(ad)})
    hashes = {i['asset_id']: i['sha256'] for p in public['images']['products'] for i in p['images']}
    plan = {'schema_version': 9, 'xml_sha256': APPROVED_HASH, 'existing_feed_sha256': EXISTING_HASH,
            'source_captured_at': snapshot['captured_at'], 'existing_ids': EXISTING_IDS, 'new_ids': list(NEW),
            'allowed_ids': ALL_IDS, 'mapping_id': MAPPING_ID, 'mapping_version': version,
            'expected_before': source, 'expected_active': projection(source, desired, version), 'desired': desired,
            'public_photo_sha256': hashes, 'public_preflight': public, 'apply': False,
            'publication_authorized': False, 'format_validation_basis': 'owner_chat_report'}
    validate_plan(plan, xml)
    return plan


def validate_plan(plan, xml):
    if (plan.get('schema_version') != 9 or hashlib.sha256(xml).hexdigest() != APPROVED_HASH
            or plan.get('xml_sha256') != APPROVED_HASH or plan.get('allowed_ids') != ALL_IDS
            or plan.get('existing_ids') != EXISTING_IDS or plan.get('new_ids') != list(NEW)
            or plan.get('mapping_id') != MAPPING_ID or plan.get('existing_feed_sha256') != EXISTING_HASH):
        raise ValueError('Invalid exact nine-ad plan')
    root, ids = parse_ads(xml)
    if ids != ALL_IDS:
        raise ValueError('Unapproved XML roster')
    source, public = plan.get('expected_before') or {}, plan.get('public_preflight') or {}
    if (len(source.get('products', [])) != 9 or len(source.get('stores', [])) != 1
            or source['stores'][0].get('slug') != 'belgorod' or source['stores'][0].get('status') != 'published'
            or public.get('captured_at') != plan.get('source_captured_at') or public.get('ok') is not True):
        raise ValueError('Incomplete release source/public contract')
    files = {i.get('url').split('/assets/', 1)[1].split('?', 1)[0] for a in root for i in a.findall('Images/Image')}
    hashes = plan.get('public_photo_sha256') or {}
    if len(files) != 52 or set(hashes) != files or any(not re.fullmatch('[0-9a-f]{64}', str(h)) for h in hashes.values()):
        raise ValueError('Exact 52-photo fingerprints required')
    desired = plan.get('desired') or []
    if len(desired) != 3 or {r.get('external_id') for r in desired} != set(NEW):
        raise ValueError('Exactly three distinct new rows required')
    for ad in root:
        identity = ad.findtext('Id')
        spec = IDENTITIES[identity]
        p = one([p for p in source['products'] if p['id'] == spec[1]])
        errors, _ = assess(p, public)
        listing, d, inv = one(p.get('listings')), one(p.get('device_details')), one(p.get('inventory'))
        if (errors or p.get('sku') != spec[7] or p.get('category', {}).get('id') != CATEGORY_ID
                or p.get('stock_quantity') != 1 or p.get('price') != spec[2] or int(ad.findtext('Price')) != spec[2]
                or inv.get('quantity') != 1 or inv.get('retail_price') != spec[2] or inv.get('identity_status') != 'matched'
                or not inv.get('serial_present') or d.get('grade') != 'A'
                or (d.get('diagnostic_date'), d.get('battery'), d.get('battery_cycles')) != spec[3:6]
                or d.get('storage') != ad.findtext('MemorySize') or p.get('model') != ad.findtext('Model')
                or p.get('color') not in ad.findtext('Description')
                or p.get('completeness') != 'Устройство, коробка, кабель' or '90' not in (p.get('warranty_text') or '')
                or listing.get('id') != spec[0] or listing.get('external_id') != identity
                or listing.get('channel') != 'avito' or listing.get('price_override') is not None
                or len(image_urls(p)) != spec[6] or image_urls(p) != [i.get('url') for i in ad.findall('Images/Image')]):
            raise ValueError('Source identity/stock/price/diagnostics/photos changed')
        if identity in NEW:
            if (listing.get('status') != 'draft' or listing.get('category_mapping') is not None
                    or listing.get('title_override') is not None or listing.get('description_override') is not None
                    or listing.get('attributes') not in (None, {})):
                raise ValueError('New channel is not an unchanged empty draft')
            expected = {'id': spec[0], 'product': spec[1], 'external_id': identity, 'channel': 'avito',
                        'status': 'active', 'category_mapping': MAPPING_ID, 'title_override': ad.findtext('Title'),
                        'description_override': ad.findtext('Description'), 'attributes': attributes(ad)}
            if one([r for r in desired if r['external_id'] == identity]) != expected:
                raise ValueError('Unapproved new channel fields')
        elif (listing.get('status') != 'active' or listing.get('category_mapping') != MAPPING_ID
                or not listing.get('mapping_confirmed') or not listing.get('mapping_active')
                or listing.get('mapping_version') != plan.get('mapping_version')
                or listing.get('title_override') != ad.findtext('Title')
                or listing.get('description_override') != ad.findtext('Description')):
            raise ValueError('Existing six ads changed')
    if plan.get('expected_active') != projection(source, desired, plan['mapping_version']):
        raise ValueError('Forged active projection')


def require_authorization(plan, evidence, stability, now=None, rollback=False):
    scope = 'rollback_new_avito_batch' if rollback else 'nine_ad_live_feed_expansion'
    if (evidence.get('source') != 'owner_release_authorization' or evidence.get('authorized') is not True
            or evidence.get('scope') != scope or evidence.get('xml_sha256') != APPROVED_HASH
            or evidence.get('allowed_ids') != ALL_IDS or evidence.get('no_unapproved_extra_costs') is not True):
        raise ValueError('Exact nine-ad live authorization required')
    if rollback:
        return
    if stability.get('source') != 'owner_confirmation' or stability.get('xml_sha256') != APPROVED_HASH:
        raise ValueError('Exact stability evidence required')
    if stability.get('kind') == 'explicit_72h_waiver' and stability.get('waived') is True:
        return
    now = now or datetime.now(timezone.utc)
    start, end = (datetime.fromisoformat(stability.get(k, '')) for k in ('observed_since', 'confirmed_at'))
    if (stability.get('kind') != 'observed_72h' or stability.get('no_sync_issues') is not True
            or start.tzinfo is None or end.tzinfo is None or not start <= end <= now
            or (end - start).total_seconds() < 72 * 3600):
        raise ValueError('72-hour stability not established')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('xml', 'snapshot', 'validator', 'copy-approval', 'existing-feed', 'public-preflight', 'output'):
        parser.add_argument('--' + name, required=True)
    args = parser.parse_args()
    load = lambda path: json.loads(Path(path).read_text(encoding='utf-8-sig'))
    plan = make_plan(Path(args.xml).read_bytes(), load(args.snapshot), load(args.validator), load(args.copy_approval),
                     Path(args.existing_feed).read_bytes(), load(args.public_preflight))
    Path(args.output).write_text(json.dumps(plan, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'prepared': True, 'existing': 6, 'new': 3, 'apply': False}))


if __name__ == '__main__':
    main()
