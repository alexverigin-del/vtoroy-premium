"""Prepare the validated six-ad release locally; never activate a channel."""

import argparse
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

from activate_avito_pilot import CATEGORY_ID, MAPPING_ID, PILOT
from prepare_avito_expansion_review import parse_ads


APPROVED_HASH = "b9f05e2aa9669b0ba0e300cb6c629f058ad938d6addaa5484d38058c8e23c285"
EXISTING_HASH = "9a8f0f124c04279d7c72e77fbb0defadf00d82db8b0c873406ff4a1e87d68fee"
NEW = {
    "isvoi-4f62161b-0ca6-49ef-82d5-8499a791968a": (
        "0f34a3c9-40dd-423a-a4d0-c3604fb2d2ae", "iphone-15-pro-max-natural-titanium-512-t13", 64100, "2026-08-05", "100%", 0),
    "isvoi-2435b3c8-b93a-4067-8958-4ecee4a9c330": (
        "f70804b1-b298-4931-b4c3-643bea6bcc70", "iphone-16-pro-max-desert-titanium-256-t14", 75900, "2026-08-05", "99%", 259),
    "isvoi-adbe2ed4-cdc0-42e8-a423-518575bdada2": (
        "5e7bc063-a9e4-4628-91ef-f8e4b11e4209", "iphone-15-pro-blue-titanium-512-t27", 60200, "2026-08-10", "100%", 0),
}
ALL_IDS = [*PILOT, *NEW]
EDIT_FIELDS = ("status", "title_override", "description_override", "category_mapping", "attributes")
EXPORT_ATTRS = {"AdType", "Vendor", "Model", "MemorySize", "Color", "RamSize", "BoxSealed",
                "Akb", "DeviceFlaws", "ScreenCondition", "CaseCondition", "Condition"}


def selected_source(snapshot):
    products = []
    for identity in ALL_IDS:
        specification = (NEW | PILOT)[identity]
        matches = [p for p in snapshot["products"] if p["id"] == specification[1]]
        if len(matches) != 1:
            raise ValueError("Missing/duplicate release product")
        products.append(deepcopy(matches[0]))
    stores = [s for s in snapshot["stores"] if s["slug"] == "belgorod"]
    if len(stores) != 1:
        raise ValueError("Missing/duplicate store")
    return {"products": sorted(products, key=lambda p: p["id"]), "stores": stores}


def make_plan(xml, snapshot, manifest, existing_xml, public):
    from prepare_avito_catalog_workbook import assess, image_urls, one
    if (hashlib.sha256(xml).hexdigest() != APPROVED_HASH
            or hashlib.sha256(existing_xml).hexdigest() != EXISTING_HASH
            or manifest.get("xml_sha256") != APPROVED_HASH
            or manifest.get("owner_format_validation", {}).get("format_validation_passed_per_owner") is not True
            or manifest.get("copy_approval", {}).get("copy_operator_approved") is not True
            or snapshot.get("private_identifier_redactions")
            or public.get("captured_at") != snapshot.get("captured_at")):
        raise ValueError("Missing exact approved XML/source/public evidence")
    root, ids = parse_ads(xml)
    previous, previous_ids = parse_ads(existing_xml)
    if ids != ALL_IDS or previous_ids != list(PILOT):
        raise ValueError("Release differs from exact cumulative roster/order")
    import xml.etree.ElementTree as ET
    if [ET.tostring(ad) for ad in list(root)[:3]] != [ET.tostring(ad) for ad in previous]:
        raise ValueError("Existing pilot ads changed")
    source = selected_source(snapshot)
    desired = []
    for ad in root:
        identity = ad.findtext("Id")
        specification = (NEW | PILOT)[identity]
        product = one([p for p in source["products"] if p["id"] == specification[1]])
        errors, _ = assess(product, public)
        listing, details = one(product["listings"]), one(product["device_details"])
        if (errors or product["category"]["id"] != CATEGORY_ID or product["stock_quantity"] != 1
                or product["price"] != specification[2] or int(ad.findtext("Price")) != product["price"]
                or listing.get("id") != specification[0] or listing.get("external_id") != identity
                or listing.get("price_override") is not None or listing.get("channel") != "avito"
                or details.get("grade") != "A" or details.get("diagnostic_date") != specification[3]
                or image_urls(product) != [image.get("url") for image in ad.findall("Images/Image")]):
            raise ValueError("Release source/price/media/diagnostic guard failed")
        if identity in PILOT:
            if (listing.get("status") != "active" or listing.get("category_mapping") != MAPPING_ID
                    or not listing.get("mapping_confirmed") or not listing.get("mapping_active")
                    or listing.get("title_override") != ad.findtext("Title")
                    or listing.get("description_override") != ad.findtext("Description")):
                raise ValueError("Existing pilot changed")
            continue
        if (listing.get("status") != "draft" or listing.get("category_mapping") is not None
                or listing.get("title_override") is not None or listing.get("description_override") is not None
                or listing.get("attributes") not in (None, {})
                or details.get("battery") != specification[4] or details.get("battery_cycles") != specification[5]):
            raise ValueError("New channel/diagnostic state changed")
        desired.append({"id": specification[0], "product": specification[1], "external_id": identity,
                        "channel": "avito", "status": "active", "category_mapping": MAPPING_ID,
                        "title_override": ad.findtext("Title"), "description_override": ad.findtext("Description"),
                        "attributes": {child.tag: child.text for child in ad if child.tag not in
                                       {"Id", "Category", "GoodsType", "Title", "Description", "Price", "Images"}}})
    active = deepcopy(source)
    version = one([p for p in source["products"] if p["id"] == PILOT[ALL_IDS[0]][1]])["listings"][0]["mapping_version"]
    for row in desired:
        listing = one([p for p in active["products"] if p["id"] == row["product"]])["listings"][0]
        listing.update({key: row[key] for key in EDIT_FIELDS})
        listing["attributes"] = {key: value for key, value in row["attributes"].items() if key in EXPORT_ATTRS}
        listing.update(mapping_confirmed=True, mapping_active=True, mapping_version=version)
    hashes={image['asset_id']:image.get('sha256') for item in public.get('images',{}).get('products',[])
            for image in item.get('images',[])}
    if len(hashes)!=36 or any(not isinstance(value,str) or len(value)!=64 for value in hashes.values()):
        raise ValueError('Fresh SHA-256 evidence for all 36 JPEGs required')
    return {"schema_version": 1, "xml_sha256": APPROVED_HASH, "existing_feed_sha256": EXISTING_HASH,
            "source_captured_at": snapshot["captured_at"], "existing_ids": list(PILOT), "new_ids": list(NEW),
            "allowed_ids": ALL_IDS, "mapping_id": MAPPING_ID, "mapping_version": version,
            "expected_before": source, "expected_active": active, "desired": desired,
            "public_photo_sha256": hashes,
            "format_validation_basis": "owner_chat_confirmation", "apply": False,
            "publication_authorized": False, "stability_72h_confirmed": False,
            "pending": ["fresh_backup_at_live_release", "72h_stability_or_explicit_waiver",
                        "explicit_live_release_authorization", "deploy_six_id_cap_before_activation"]}


def validate_plan(plan, xml):
    if (plan.get("schema_version") != 1 or plan.get("xml_sha256") != APPROVED_HASH
            or hashlib.sha256(xml).hexdigest() != APPROVED_HASH or plan.get("allowed_ids") != ALL_IDS
            or plan.get("existing_ids") != list(PILOT) or plan.get("new_ids") != list(NEW)
            or plan.get("mapping_id") != MAPPING_ID or len(plan.get("desired", [])) != 3):
        raise ValueError("Invalid exact release plan")
    root, ids = parse_ads(xml)
    if ids != ALL_IDS:
        raise ValueError("Invalid cumulative XML")
    files={image.get('url').split('/assets/',1)[1].split('?',1)[0] for ad in root for image in ad.findall('Images/Image')}
    import re
    hashes=plan.get('public_photo_sha256') or {}
    if set(hashes)!=files or len(files)!=36 or any(not re.fullmatch('[0-9a-f]{64}',str(value)) for value in hashes.values()):
        raise ValueError('Invalid exact public-photo fingerprints')
    for row in plan["desired"]:
        specification = NEW.get(row.get("external_id"))
        ad = next((ad for ad in root if ad.findtext("Id") == row.get("external_id")), None)
        if (not specification or row["id"] != specification[0] or row["product"] != specification[1]
                or row.get("channel") != "avito" or row.get("status") != "active"
                or row.get("category_mapping") != MAPPING_ID or ad is None
                or row.get("title_override") != ad.findtext("Title")
                or row.get("description_override") != ad.findtext("Description")
                or row.get("attributes") != {c.tag: c.text for c in ad if c.tag not in
                                           {"Id", "Category", "GoodsType", "Title", "Description", "Price", "Images"}}):
            raise ValueError("Release plan changed approved fields")
    if {row["external_id"] for row in plan["desired"]} != set(NEW):
        raise ValueError("Duplicate/missing new channel row")
    source = plan.get("expected_before") or {}
    if (len(source.get("products", [])) != 6 or len(source.get("stores", [])) != 1
            or source["stores"][0].get("slug") != "belgorod" or source["stores"][0].get("status") != "published"):
        raise ValueError("Incomplete source contract")
    active = deepcopy(source)
    for ad in root:
        identity = ad.findtext("Id")
        spec = (NEW | PILOT)[identity]
        products = [p for p in source["products"] if p["id"] == spec[1]]
        if len(products) != 1:
            raise ValueError("Invalid source identity")
        p = products[0]
        if (p.get("status") != "published" or p.get("content_status") != "ready" or p.get("condition") != "used"
                or p.get("stock_status") != "available" or p.get("stock_quantity") != 1 or p.get("price") != spec[2]
                or p.get("category", {}).get("id") != CATEGORY_ID or p.get("category", {}).get("slug") != "smartphones"
                or p.get("model") != ad.findtext("Model") or p.get("color") not in ad.findtext("Description")
                or p.get("completeness") != "Устройство, коробка, кабель" or "90" not in (p.get("warranty_text") or "")):
            raise ValueError("Invalid source product contract")
        if len(p.get("inventory", [])) != 1 or len(p.get("device_details", [])) != 1 or len(p.get("listings", [])) != 1:
            raise ValueError("Ambiguous source relations")
        inv, details, listing = p["inventory"][0], p["device_details"][0], p["listings"][0]
        if (inv.get("quantity") != 1 or inv.get("source_sku") != p["sku"] or inv.get("identity_status") != "matched"
                or inv.get("eligibility_status") != "eligible" or inv.get("authenticity_status") != "verified"
                or not inv.get("review_override") or not inv.get("review_note_present") or not inv.get("for_sale")
                or inv.get("duplicate_serial") or inv.get("open_issue_codes") or not inv.get("serial_present")
                or details.get("grade") != "A" or details.get("diagnostic_date") != spec[3]
                or details.get("battery") != (spec[4] if identity in NEW else "100%")
                or details.get("battery_cycles") != (spec[5] if identity in NEW else 0)
                or details.get("storage") != ad.findtext("MemorySize")):
            raise ValueError("Invalid inventory/diagnostic contract")
        offers = [o for o in p.get("offers", []) if o.get("location") == "belgorod" and o.get("status") == "published"]
        if len(offers) != 1 or any(offers[0].get(key) != p[key] for key in ("price", "stock_status", "stock_quantity")):
            raise ValueError("Invalid store offer")
        photos = sorted(p.get("images", []), key=lambda i: (i.get("role") != "card", i.get("sort") or 0))
        files = list(dict.fromkeys([p.get("listing_file")] + [i["id"] for i in photos]))[:10]
        expected_urls = ["https://api.isvoi.ru/assets/" + f + "?width=1600&height=1600&fit=inside&format=jpg&quality=90" for f in files]
        if len(files) != 6 or expected_urls != [i.get("url") for i in ad.findall("Images/Image")]:
            raise ValueError("Unapproved photo set/order")
        if listing.get("id") != spec[0] or listing.get("external_id") != identity or listing.get("price_override") is not None:
            raise ValueError("Invalid source channel identity/price")
        if identity in NEW:
            if (listing.get("status") != "draft" or listing.get("category_mapping") is not None
                    or listing.get("title_override") is not None or listing.get("description_override") is not None
                    or listing.get("attributes") not in (None, {})):
                raise ValueError("Unreviewed source channel fields")
            desired = next(r for r in plan["desired"] if r["external_id"] == identity)
            target = next(r for r in active["products"] if r["id"] == p["id"])["listings"][0]
            target.update({key: desired[key] for key in EDIT_FIELDS})
            target["attributes"] = {key: value for key, value in desired["attributes"].items() if key in EXPORT_ATTRS}
            target.update(mapping_confirmed=True,mapping_active=True,mapping_version=plan["mapping_version"])
        elif (listing.get("status") != "active" or listing.get("category_mapping") != MAPPING_ID
                or listing.get("title_override") != ad.findtext("Title")
                or listing.get("description_override") != ad.findtext("Description")):
            raise ValueError("Existing pilot fields changed")
    if plan.get("expected_active") != active:
        raise ValueError("Active projection differs from exact three-field-set update")


def require_authorization(plan, evidence, stability, now=None, rollback=False):
    now = now or datetime.now(timezone.utc)
    if (evidence.get("source") != "owner_release_authorization" or evidence.get("authorized") is not True
            or evidence.get("scope") != ("rollback_new_avito_batch" if rollback else "six_ad_live_feed_expansion")
            or evidence.get("xml_sha256") != APPROVED_HASH or evidence.get("allowed_ids") != ALL_IDS
            or evidence.get("no_unapproved_extra_costs") is not True):
        raise ValueError("Explicit live publication/cost authorization required")
    if rollback:
        return
    if stability.get("xml_sha256") != APPROVED_HASH or stability.get("source") != "owner_confirmation":
        raise ValueError("Exact owner stability evidence required")
    if stability.get("kind") == "explicit_72h_waiver" and stability.get("waived") is True:
        return
    start = datetime.fromisoformat(stability.get("observed_since", ""))
    confirmed = datetime.fromisoformat(stability.get("confirmed_at", ""))
    if (stability.get("kind") != "observed_72h" or stability.get("no_sync_issues") is not True
            or start.tzinfo is None or confirmed.tzinfo is None
            or not 72 * 3600 <= (confirmed - start).total_seconds() or not start <= confirmed <= now):
        raise ValueError("72-hour stability is not established")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("xml", "snapshot", "manifest", "existing-feed", "public-preflight", "output"):
        parser.add_argument("--" + name, required=True)
    args = parser.parse_args()
    load = lambda path: json.loads(Path(path).read_text(encoding="utf-8-sig"))
    plan = make_plan(Path(args.xml).read_bytes(), load(args.snapshot), load(args.manifest),
                     Path(args.existing_feed).read_bytes(), load(args.public_preflight))
    validate_plan(plan, Path(args.xml).read_bytes())
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"prepared": True, "existing": 3, "new": 3, "apply": False, "file": str(out)}))


if __name__ == "__main__":
    main()
