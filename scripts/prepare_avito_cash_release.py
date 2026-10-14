"""Exact fifteen-registered / fourteen-available release with cash stock proof."""
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import re

from activate_avito_pilot import CATEGORY_ID, MAPPING_ID, json_sql
import prepare_avito_available_release as prior
from prepare_avito_catalog_workbook import assess, avito_color, image_urls, one, percentage
from prepare_avito_expansion_review import parse_ads
from prepare_avito_expansion_release import EDIT_FIELDS

APPROVED_HASH = "a611be062fae0ff9881eb0bcb0bdafdf29152e6eb2f0efa784645786efcaa53b"
EXISTING_HASH = "854f195cf953abbfa949433a2dfc7fd8cc487a460f165cd968defb4049265b90"
EXISTING = prior.IDENTITIES
EXISTING_IDS = list(EXISTING)
SOLD_ID = prior.SOLD_ID
NEW = {
    "isvoi-e697a34e-751c-4457-ae3e-fd489c5bf487": ("b0dd483b-257f-41ac-bbde-b16b52a38699",
        "apple-iphone-16-pro-256-desert-titanium-e697a34e", 70500, "2026-08-10", "97%", 262, 5, "т25"),
    "isvoi-710af179-9f6b-4a1f-bb0f-6d90b1362e23": ("1e822e44-364d-4dfa-95a4-4f3e4e02b0af",
        "samsung-galaxy-s23-ultra-cream-256-t34", 47995, "2026-08-21", "85%", 786, 6, "т34"),
    "isvoi-ec52dfa6-0062-493a-9f3f-b022e7784526": ("de859bca-542d-4071-9698-a01ae040f790",
        "samsung-galaxy-s24-ultra-titanium-black-256-t36", 60998, "2026-08-21", "96%", 432, 6, "т36"),
}
IDENTITIES = EXISTING | NEW
ALL_IDS = list(IDENTITIES)
CODE_CAP = 15
RECEIPT_NAME = "avito-fourteen-cash-receipt.json"
attributes = prior.attributes
projection = prior.projection
MODELS = {"т25": ("Apple", "iPhone 16 Pro", "золотистый", "8 ГБ"),
          "т34": ("Samsung", "Galaxy S23 Ultra", "бежевый", "12 ГБ"),
          "т36": ("Samsung", "Galaxy S24 Ultra", "черный", "12 ГБ")}


def validate_plan(plan, xml):
    if (plan.get("schema_version") != 15 or hashlib.sha256(xml).hexdigest() != APPROVED_HASH
            or plan.get("xml_sha256") != APPROVED_HASH or plan.get("existing_feed_sha256") != EXISTING_HASH
            or plan.get("allowed_ids") != ALL_IDS or plan.get("existing_ids") != EXISTING_IDS
            or plan.get("new_ids") != list(NEW) or plan.get("mapping_id") != MAPPING_ID):
        raise ValueError("Exact owner-validated fifteen-ID contract required")
    root, ids = parse_ads(xml)
    old, old_ids = parse_ads(plan["existing_xml"].encode())
    values = lambda ad: {c.tag: [dict(i.attrib) for i in c] if c.tag == "Images" else c.text for c in ad}
    if (hashlib.sha256(plan["existing_xml"].encode()).hexdigest() != EXISTING_HASH
            or len(old_ids) != 11 or set(old_ids) != set(EXISTING) - {SOLD_ID}
            or ids != old_ids + list(NEW) or len(ids) != 14 or plan.get("xml_ids") != ids
            or [values(ad) for ad in list(root)[:11]] != [values(ad) for ad in old]):
        raise ValueError("Historical ads or cumulative roster changed")
    source, public = plan["expected_before"], plan["public_preflight"]
    if (len(source["products"]) != 15 or len(source["stores"]) != 1
            or public.get("captured_at") != plan["source_captured_at"] or public.get("ok") is not True):
        raise ValueError("Incomplete source/public proof")
    proofs = plan.get("cash_stock_approvals") or {}
    cash = plan.get("cash_stock_confirmation") or {}
    if (proofs.get("version") != 1 or proofs.get("authority") != "cash_snapshot_owner_confirmation"
            or set(proofs.get("entries", {})) != set(list(NEW)[1:])
            or cash.get("source") != "owner_cash_snapshot_confirmation"
            or cash.get("scope") != "stock_not_receipt_identity_or_publication"
            or cash.get("cash_file_sha256") != "537b5a85e0ed837f3cf28e38fd6d7408bcb3118072654f0618cef69074107c67"
            or cash.get("snapshot_captured_at") != plan["source_captured_at"]
            or cash.get("confirmed_on") != plan["source_captured_at"][:10]):
        raise ValueError("Exact current cash stock provenance required")
    desired = []
    for identity, spec in IDENTITIES.items():
        product = one([p for p in source["products"] if p["id"] == spec[1]])
        listing, detail, inventory = one(product.get("listings")), one(product.get("device_details")), one(product.get("inventory"))
        grade = "B" if spec[7] in ("т39", "т18") else "A"
        if (product.get("sku") != spec[7] or product.get("category", {}).get("id") != CATEGORY_ID
                or product.get("price") != spec[2] or inventory.get("retail_price") != spec[2]
                or inventory.get("quantity") != 1 or not inventory.get("serial_present")
                or inventory.get("duplicate_serial") or inventory.get("open_issue_codes")
                or detail.get("grade") != grade or (detail.get("diagnostic_date"), detail.get("battery"), detail.get("battery_cycles")) != spec[3:6]
                or listing.get("id") != spec[0] or listing.get("external_id") != identity
                or listing.get("channel") != "avito" or listing.get("price_override") is not None
                or len(image_urls(product)) != spec[6]):
            raise ValueError("Identity, stock, diagnostic or media facts drifted")
        cash_row = one([r for r in cash.get("entries", []) if r["sku"] == spec[7]])
        if identity != SOLD_ID and assess(product, public, cash_row)[0]:
            raise ValueError("Catalog or cash-source guards failed")
        if identity in proofs["entries"]:
            proof = proofs["entries"][identity]
            if (proof.get("productId") != spec[1] or proof.get("inventoryId") != inventory["id"]
                    or proof.get("sourceId") != identity.removeprefix("isvoi-") or proof.get("sku") != spec[7]
                    or set(proof) != {"productId", "inventoryId", "sourceId", "sku", "barcodeSha256", "serialSha256"}
                    or any(not re.fullmatch("[0-9a-f]{64}", proof.get(key, "")) for key in ("barcodeSha256", "serialSha256"))):
                raise ValueError("Cash runtime binding or hashes invalid")
        elif inventory.get("identity_status") != "matched":
            raise ValueError("Historical/iPhone identity is not matched")
        if identity in NEW:
            if (listing.get("status") != "draft" or listing.get("category_mapping") is not None
                    or listing.get("title_override") is not None or listing.get("description_override") is not None
                    or listing.get("attributes") not in (None, {})):
                raise ValueError("New rows must remain untouched empty drafts")
            ad = next(a for a in root if a.findtext("Id") == identity)
            copied = one([r for r in plan["copy_approval"]["entries"] if r["external_id"] == identity])
            if (copied.get("title_sha256") != hashlib.sha256(ad.findtext("Title").encode()).hexdigest()
                    or copied.get("description_sha256") != hashlib.sha256(ad.findtext("Description").encode()).hexdigest()
                    or plan["copy_approval"].get("copy_operator_approved") is not True
                    or plan["physical_confirmation"].get("source") != "owner_chat_confirmation"
                    or plan["physical_confirmation"].get("confirmed_skus") != ["т25", "т34", "т36"]
                    or plan["physical_confirmation"].get("confirmed_on") != plan["source_captured_at"][:10]):
                raise ValueError("Exact copy/current physical confirmation required")
            vendor, model, color, ram = MODELS[spec[7]]
            if product.get("model") != model or avito_color(model, product.get("color")) != color:
                raise ValueError("Product model/color differs from validated attributes")
            if any(ad.findtext(key) != value for key, value in {
                    "Vendor": vendor, "Model": model, "Color": color, "RamSize": ram, "MemorySize": "256 ГБ",
                    "Price": str(spec[2]), "Akb": str(percentage(detail["battery"])),
                    "ScreenCondition": "Без дефектов", "CaseCondition": "Без дефектов"}.items()):
                raise ValueError("Validated model-specific attributes changed")
            if [i.get("url") for i in ad.findall("./Images/Image")] != image_urls(product):
                raise ValueError("Approved photo order changed")
            desired.append({"id": spec[0], "product": spec[1], "external_id": identity, "channel": "avito",
                "status": "active", "category_mapping": MAPPING_ID, "title_override": ad.findtext("Title"),
                "description_override": ad.findtext("Description"), "attributes": attributes(ad)})
        else:
            if (listing.get("status") != "active" or listing.get("category_mapping") != MAPPING_ID
                    or listing.get("mapping_active") is not True or listing.get("mapping_confirmed") is not True
                    or listing.get("mapping_version") != plan["mapping_version"]):
                raise ValueError("Historical mapping or channel changed")
            if identity == SOLD_ID:
                offer = one(product.get("offers"))
                if (product.get("stock_status") != "sold" or product.get("stock_quantity") != 0
                        or offer.get("stock_status") != "sold" or offer.get("stock_quantity") != 0):
                    raise ValueError("Sold historical device restored")
            else:
                ad = next(a for a in old if a.findtext("Id") == identity)
                if (ad.findtext("Title") != listing["title_override"] or ad.findtext("Description") != listing["description_override"]
                        or ad.findtext("Price") != str(spec[2]) or ad.findtext("Model") != product.get("model")
                        or ad.findtext("MemorySize") != detail.get("storage")
                        or ad.findtext("Color") != avito_color(product.get("model"), product.get("color"))
                        or ad.findtext("Akb") != str(percentage(detail["battery"]))
                        or image_urls(product) != [i.get("url") for i in ad.findall("./Images/Image")]):
                    raise ValueError("Existing available copy/price/gallery changed")
    files = {i.get("url").split("/assets/")[1].split("?")[0] for ad in root for i in ad.findall("./Images/Image")}
    hashes = plan["public_photo_sha256"]
    if len(files) != 81 or set(hashes) != files or any(not re.fullmatch("[0-9a-f]{64}", value) for value in hashes.values()):
        raise ValueError("Exact 81 JPEG fingerprints required")
    if plan["desired"] != desired or plan["expected_active"] != projection(source, desired, plan["mapping_version"]):
        raise ValueError("Desired mutations or projection differ")


def make_plan(xml, snapshot, validator, copy_approval, physical, existing_xml, public, cash, proofs):
    if (validator.get("xml_sha256") != APPROVED_HASH or validator.get("owner_reported_validator_accepted") is not True
            or validator.get("source") != "owner_chat_confirmation" or snapshot.get("private_identifier_redactions")):
        raise ValueError("Owner validator/source evidence missing")
    root, ids = parse_ads(xml)
    products = sorted([deepcopy(p) for p in snapshot["products"] if p["id"] in {s[1] for s in IDENTITIES.values()}], key=lambda p: p["id"])
    stores = [deepcopy(s) for s in snapshot["stores"] if s["slug"] == "belgorod"]
    source = {"products": products, "stores": stores}
    version = one(one([p for p in products if p["id"] == EXISTING[SOLD_ID][1]])["listings"])["mapping_version"]
    desired = [{"id": NEW[a.findtext("Id")][0], "product": NEW[a.findtext("Id")][1], "external_id": a.findtext("Id"),
        "channel": "avito", "status": "active", "category_mapping": MAPPING_ID, "title_override": a.findtext("Title"),
        "description_override": a.findtext("Description"), "attributes": attributes(a)} for a in list(root)[11:]]
    hashes = {i["asset_id"]: i["sha256"] for p in public["images"]["products"] for i in p["images"]}
    plan = {"schema_version": 15, "xml_sha256": APPROVED_HASH, "existing_feed_sha256": EXISTING_HASH,
        "source_captured_at": snapshot["captured_at"], "existing_ids": EXISTING_IDS, "new_ids": list(NEW),
        "allowed_ids": ALL_IDS, "xml_ids": ids, "mapping_id": MAPPING_ID, "mapping_version": version,
        "expected_before": source, "expected_active": projection(source, desired, version), "desired": desired,
        "public_photo_sha256": hashes, "public_preflight": public, "existing_xml": existing_xml.decode(),
        "copy_approval": copy_approval, "physical_confirmation": physical, "cash_stock_confirmation": cash,
        "cash_stock_approvals": proofs, "apply": False, "publication_authorized": False}
    validate_plan(plan, xml)
    return plan


def transaction_guards(plan):
    entries = json_sql(plan["cash_stock_approvals"]["entries"])
    return f"""
 IF EXISTS(SELECT 1 FROM jsonb_each({entries}) x
 LEFT JOIN inventory_items i ON i.id=(x.value->>'inventoryId')::uuid
 LEFT JOIN products p ON p.id=x.value->>'productId'
 WHERE i.id IS NULL OR p.id IS NULL OR i.product IS DISTINCT FROM p.id OR i.source_id IS DISTINCT FROM (x.value->>'sourceId')
 OR p.source_id IS DISTINCT FROM (x.value->>'sourceId') OR i.source_sku IS DISTINCT FROM (x.value->>'sku') OR p.sku IS DISTINCT FROM (x.value->>'sku')
 OR i.identity_status IS DISTINCT FROM 'unmatched' OR i.for_sale IS DISTINCT FROM true OR i.quantity IS DISTINCT FROM 1
 OR encode(sha256(convert_to(trim(coalesce(i.barcode,'')),'UTF8')),'hex')<>x.value->>'barcodeSha256'
 OR encode(sha256(convert_to(regexp_replace(upper(coalesce(i.serial_full,'')),'[^A-Z0-9]','','g'),'UTF8')),'hex')<>x.value->>'serialSha256'
 OR EXISTS(SELECT 1 FROM inventory_import_issues iss WHERE iss.inventory_item=i.id AND NOT iss.resolved))
 THEN RAISE EXCEPTION 'Cash UUID/SKU/barcode/serial proof changed'; END IF;
"""


def require_authorization(plan, evidence, stability, now=None, rollback=False):
    scope = "rollback_new_avito_batch" if rollback else "fourteen_cash_ad_live_feed_expansion"
    if (evidence.get("source") != "owner_release_authorization" or evidence.get("authorized") is not True
            or evidence.get("scope") != scope or evidence.get("xml_sha256") != APPROVED_HASH
            or evidence.get("allowed_ids") != ALL_IDS or evidence.get("no_unapproved_extra_costs") is not True):
        raise ValueError("Separate exact fourteen-ad publication authorization required")
    if rollback:
        return
    if (stability.get("source") != "owner_confirmation" or stability.get("xml_sha256") != APPROVED_HASH
            or stability.get("kind") != "explicit_72h_waiver" or stability.get("waived") is not True):
        raise ValueError("Current batch explicit waiting decision required")
