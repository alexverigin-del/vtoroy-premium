"""Exact sold-aware twelve-ID / eleven-available-ad release contract."""
import argparse
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re

from activate_avito_pilot import CATEGORY_ID, MAPPING_ID
import prepare_avito_followup_release as previous
from prepare_avito_available_batch_review import build_review
from prepare_avito_catalog_workbook import image_urls, one
from prepare_avito_expansion_review import parse_ads
from prepare_avito_expansion_release import EDIT_FIELDS, EXPORT_ATTRS

APPROVED_HASH = 'b90f6f21bf99356b474090f15d13f895c25d808984a4ebda7ccba388291f88d7'
EXISTING_HASH = '8c87691cfc96df6a7cacc27afa7bace63ec91bc005255164769bf9cea7ed4fec'
EXISTING = previous.IDENTITIES
EXISTING_IDS = list(EXISTING)
SOLD_ID = 'isvoi-87da52ec-4e2a-4018-baf8-79f14043cfa8'
AVAILABLE_EXISTING_IDS = [
    'isvoi-4f62161b-0ca6-49ef-82d5-8499a791968a',
    'isvoi-adbe2ed4-cdc0-42e8-a423-518575bdada2',
    'isvoi-57d1ecdb-f2b1-4cf3-997a-f6ee1ba96a91',
    'isvoi-9bdb8313-84b0-4884-9491-993c9516923b',
    'isvoi-c476a8ff-21c7-4a22-946b-4b08aad229c0',
    'isvoi-872f3638-c9d6-4c1d-b494-c4f5f02885c0',
    'isvoi-e307d9cd-48aa-4475-a784-674749fde517',
    'isvoi-2435b3c8-b93a-4067-8958-4ecee4a9c330',
]
NEW = {
    'isvoi-108fc901-0f04-4d0a-96d9-f811a21d4345': ('2822befa-00cb-4408-8dc1-b7918069aa29',
        'iphone-15-pro-max-natural-titanium-512-t20', 64100, '2026-08-06', '100%', 0, 6, 'т20'),
    'isvoi-1f97112b-2783-477d-86cb-0d5641d2f761': ('86dbb5c4-2014-4e21-9875-b41cb1ac27f6',
        'apple-iphone-14-pro-256-deep-purple-1f97112b', 44500, '2026-08-28', '95%', 247, 6, 'т39'),
    'isvoi-4fc186d3-8a48-460b-b45b-c4d1182f838b': ('04db4848-d5e6-4434-bd75-51590e8294ae',
        'iphone-15-pro-max-blue-titanium-256-t18', 56900, '2026-08-06', '88%', 711, 6, 'т18'),
}
IDENTITIES = EXISTING | NEW
ALL_IDS = list(IDENTITIES)
XML_IDS = AVAILABLE_EXISTING_IDS + list(NEW)
CODE_CAP = 12
RECEIPT_NAME = 'avito-eleven-available-receipt.json'
attributes = previous.attributes
projection = previous.projection


def make_plan(xml, snapshot, validator, copy_approval, existing_xml, public, references):
    if (hashlib.sha256(xml).hexdigest() != APPROVED_HASH
            or hashlib.sha256(existing_xml).hexdigest() != EXISTING_HASH
            or validator.get('source') != 'owner_chat_report'
            or validator.get('xml_sha256') != APPROVED_HASH
            or validator.get('validation_passed_owner_reported') is not True):
        raise ValueError('Exact owner-validated eleven-ad XML required')
    generated, _ = build_review(snapshot, public, existing_xml, copy_approval, references)
    if generated != xml:
        raise ValueError('Current facts or approved copy differ from validated XML')
    root, ids = parse_ads(xml)
    if ids != XML_IDS:
        raise ValueError('Exact eleven-available-ID order required')
    products = [deepcopy(p) for p in snapshot['products'] if p['id'] in {s[1] for s in IDENTITIES.values()}]
    stores = [deepcopy(s) for s in snapshot['stores'] if s['slug'] == 'belgorod']
    if len(products) != 12 or len(stores) != 1:
        raise ValueError('Ambiguous twelve-product source')
    source = {'products': sorted(products, key=lambda p: p['id']), 'stores': stores}
    version = one(one([p for p in products if p['id'] == EXISTING[SOLD_ID][1]])['listings'])['mapping_version']
    desired = [{
        'id': NEW[ad.findtext('Id')][0], 'product': NEW[ad.findtext('Id')][1],
        'external_id': ad.findtext('Id'), 'channel': 'avito', 'status': 'active', 'category_mapping': MAPPING_ID,
        'title_override': ad.findtext('Title'), 'description_override': ad.findtext('Description'),
        'attributes': attributes(ad),
    } for ad in root[8:]]
    hashes = {i['asset_id']: i['sha256'] for p in public['images']['products'] for i in p['images']}
    plan = {'schema_version': 12, 'xml_sha256': APPROVED_HASH, 'existing_feed_sha256': EXISTING_HASH,
            'source_captured_at': snapshot['captured_at'], 'existing_ids': EXISTING_IDS,
            'available_existing_ids': AVAILABLE_EXISTING_IDS, 'new_ids': list(NEW), 'allowed_ids': ALL_IDS,
            'xml_ids': XML_IDS, 'sold_id': SOLD_ID, 'mapping_id': MAPPING_ID, 'mapping_version': version,
            'expected_before': source, 'expected_active': projection(source, desired, version), 'desired': desired,
            'public_photo_sha256': hashes, 'public_preflight': public,
            'existing_xml': existing_xml.decode('utf-8'), 'copy_approval': copy_approval,
            'model_reference': references, 'apply': False, 'publication_authorized': False,
            'format_validation_basis': 'owner_chat_report'}
    validate_plan(plan, xml)
    return plan


def validate_plan(plan, xml):
    if (plan.get('schema_version') != 12 or hashlib.sha256(xml).hexdigest() != APPROVED_HASH
            or plan.get('xml_sha256') != APPROVED_HASH or plan.get('existing_feed_sha256') != EXISTING_HASH
            or plan.get('allowed_ids') != ALL_IDS or plan.get('existing_ids') != EXISTING_IDS
            or plan.get('available_existing_ids') != AVAILABLE_EXISTING_IDS or plan.get('xml_ids') != XML_IDS
            or plan.get('new_ids') != list(NEW) or plan.get('sold_id') != SOLD_ID or plan.get('mapping_id') != MAPPING_ID):
        raise ValueError('Invalid exact twelve-ID sold-aware plan')
    source, public = plan.get('expected_before') or {}, plan.get('public_preflight') or {}
    if (len(source.get('products', [])) != 12 or len(source.get('stores', [])) != 1
            or public.get('captured_at') != plan.get('source_captured_at') or public.get('ok') is not True):
        raise ValueError('Incomplete source/public contract')
    current = {**source, 'captured_at': plan['source_captured_at'], 'private_identifier_redactions': 0}
    generated, _ = build_review(current, public, plan['existing_xml'].encode('utf-8'),
                                plan['copy_approval'], plan['model_reference'])
    if generated != xml:
        raise ValueError('Forged source/copy or existing capture')
    root, _ = parse_ads(xml)
    files = {i.get('url').split('/assets/', 1)[1].split('?', 1)[0] for a in root for i in a.findall('Images/Image')}
    hashes = plan.get('public_photo_sha256') or {}
    if len(files) != 64 or set(hashes) != files or any(not re.fullmatch('[0-9a-f]{64}', str(h)) for h in hashes.values()):
        raise ValueError('Exact 64 JPEG fingerprints required')
    for identity, spec in IDENTITIES.items():
        p = one([p for p in source['products'] if p['id'] == spec[1]])
        listing, d, inv = one(p.get('listings')), one(p.get('device_details')), one(p.get('inventory'))
        expected_grade = 'B' if identity in (list(NEW)[1], list(NEW)[2]) else 'A'
        if (p.get('sku') != spec[7] or p.get('category', {}).get('id') != CATEGORY_ID
                or p.get('price') != spec[2] or inv.get('quantity') != 1 or inv.get('retail_price') != spec[2]
                or inv.get('identity_status') != 'matched' or not inv.get('serial_present')
                or inv.get('duplicate_serial') or inv.get('open_issue_codes')
                or d.get('grade') != expected_grade
                or (d.get('diagnostic_date'), d.get('battery'), d.get('battery_cycles')) != spec[3:6]
                or listing.get('id') != spec[0] or listing.get('external_id') != identity
                or listing.get('channel') != 'avito' or listing.get('price_override') is not None
                or len(image_urls(p)) != spec[6]):
            raise ValueError('Exact identity/stock/price/diagnostic/media source changed')
        if identity in NEW:
            if (listing.get('status') != 'draft' or listing.get('category_mapping') is not None
                    or listing.get('title_override') is not None or listing.get('description_override') is not None
                    or listing.get('attributes') not in (None, {})):
                raise ValueError('New channel must remain an unchanged empty draft')
        elif (listing.get('status') != 'active' or listing.get('category_mapping') != MAPPING_ID
                or listing.get('mapping_version') != plan.get('mapping_version')
                or listing.get('mapping_active') is not True or listing.get('mapping_confirmed') is not True):
            raise ValueError('Historical channel or mapping changed')
        if identity == SOLD_ID:
            offer = one(p.get('offers'))
            if (p.get('stock_status') != 'sold' or p.get('stock_quantity') != 0
                    or offer.get('stock_status') != 'sold' or offer.get('stock_quantity') != 0):
                raise ValueError('Sold historical device was restored')
    desired = [{
        'id': NEW[a.findtext('Id')][0], 'product': NEW[a.findtext('Id')][1], 'external_id': a.findtext('Id'),
        'channel': 'avito', 'status': 'active', 'category_mapping': MAPPING_ID,
        'title_override': a.findtext('Title'), 'description_override': a.findtext('Description'), 'attributes': attributes(a),
    } for a in root[8:]]
    if (plan.get('desired') != desired
            or plan.get('expected_active') != projection(source, desired, plan['mapping_version'])):
        raise ValueError('Unapproved desired fields or active projection')


def require_authorization(plan, evidence, stability, now=None, rollback=False):
    scope = 'rollback_new_avito_batch' if rollback else 'eleven_available_ad_live_feed_expansion'
    if (evidence.get('source') != 'owner_release_authorization' or evidence.get('authorized') is not True
            or evidence.get('scope') != scope or evidence.get('xml_sha256') != APPROVED_HASH
            or evidence.get('allowed_ids') != ALL_IDS or evidence.get('no_unapproved_extra_costs') is not True):
        raise ValueError('Exact current-batch live authorization required')
    if rollback:
        return
    if stability.get('source') != 'owner_confirmation' or stability.get('xml_sha256') != APPROVED_HASH:
        raise ValueError('Current batch stability decision required')
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
    for name in ('xml', 'snapshot', 'validator', 'copy-approval', 'existing-feed', 'public-preflight', 'model-reference', 'output'):
        parser.add_argument('--' + name, required=True)
    args = parser.parse_args()
    load = lambda p: json.loads(Path(p).read_text(encoding='utf-8-sig'))
    plan = make_plan(Path(args.xml).read_bytes(), load(args.snapshot), load(args.validator), load(args.copy_approval),
                     Path(args.existing_feed).read_bytes(), load(args.public_preflight), load(args.model_reference))
    Path(args.output).write_text(json.dumps(plan, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'prepared': True, 'existing_registered': 9, 'existing_available': 8, 'new': 3, 'apply': False}))


if __name__ == '__main__':
    main()
