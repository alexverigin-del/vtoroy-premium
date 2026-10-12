"""Offline eight-plus-three XML review, preserving the sold historical member."""

import argparse
from copy import deepcopy
from datetime import date
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

from prepare_avito_catalog_workbook import avito_color, image_urls, one, percentage, prepare
from prepare_avito_expansion_review import parse_ads


NEW_IDS = {
    "т20": "isvoi-108fc901-0f04-4d0a-96d9-f811a21d4345",
    "т39": "isvoi-1f97112b-2783-477d-86cb-0d5641d2f761",
    "т18": "isvoi-4fc186d3-8a48-460b-b45b-c4d1182f838b",
}
EXISTING_IDS = {
    "т11": "isvoi-87da52ec-4e2a-4018-baf8-79f14043cfa8",
    "т12": "isvoi-e307d9cd-48aa-4475-a784-674749fde517",
    "т29": "isvoi-872f3638-c9d6-4c1d-b494-c4f5f02885c0",
    "т13": "isvoi-4f62161b-0ca6-49ef-82d5-8499a791968a",
    "т14": "isvoi-2435b3c8-b93a-4067-8958-4ecee4a9c330",
    "т27": "isvoi-adbe2ed4-cdc0-42e8-a423-518575bdada2",
    "т9": "isvoi-9bdb8313-84b0-4884-9491-993c9516923b",
    "т24": "isvoi-c476a8ff-21c7-4a22-946b-4b08aad229c0",
    "т26": "isvoi-57d1ecdb-f2b1-4cf3-997a-f6ee1ba96a91",
}
EXISTING_SKUS = set(EXISTING_IDS)
REFERENCE_MODELS = {
    "iPhone 15 Pro Max": ("8 ГБ", "https://www.ifixit.com/Teardown/iPhone+15+Pro+Max+Chip+ID/165320"),
    "iPhone 14 Pro": ("6 ГБ", "https://www.ifixit.com/Device/iPhone_14_Pro"),
}


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def build_review(snapshot, public, existing_xml, approval, references):
    if (snapshot.get("private_identifier_redactions") != 0 or not public.get("ok")
            or public.get("captured_at") != snapshot.get("captured_at")):
        raise ValueError("Missing safe current catalog/public evidence")
    day = snapshot["captured_at"][:10]
    if (approval.get("source") != "owner_chat_confirmation"
            or approval.get("scope") != "exact_copy_and_physical_facts_not_publication"
            or approval.get("confirmed_on") != day or approval.get("copy_operator_approved") is not True
            or approval.get("publication_authorized") is not False
            or [e.get("sku") for e in approval.get("entries", [])] != list(NEW_IDS)):
        raise ValueError("Exact current batch approval required")
    if (references.get("scope") != "model_hardware_reference_not_avito_catalog_validation"
            or references.get("checked_on") != day or set(references.get("models", {})) != set(REFERENCE_MODELS)):
        raise ValueError("Missing model RAM provenance")
    for model, (ram, url) in REFERENCE_MODELS.items():
        ref = references["models"][model]
        if ref.get("attributes") != {"RamSize": ram} or ref.get("source_url") != url:
            raise ValueError("Unrecognized RAM reference")
    if hashlib.sha256(existing_xml).hexdigest() != approval.get("existing_feed_sha256"):
        raise ValueError("Live capture changed; refresh review")
    existing, existing_ids = parse_ads(existing_xml)
    if existing_ids != approval.get("existing_ids") or len(existing_ids) != 8:
        raise ValueError("Expected exact existing eight-ID roster")
    reviewed = prepare(snapshot, public, {})
    eligible = {e["sku"]: e for e in reviewed["entries"] if e["catalog_checks_pass"]}
    products = snapshot["products"]
    historical = [p for p in products if p["sku"] in EXISTING_SKUS]
    if (len(historical) != 9 or {p["sku"] for p in historical} != EXISTING_SKUS
            or any(one(p.get("listings")).get("external_id") != EXISTING_IDS[p["sku"]] for p in historical)):
        raise ValueError("Historical registered roster changed")
    sold = one([p for p in historical if p["sku"] == "т11"])
    sold_id = one(sold.get("listings")).get("external_id")
    if sold.get("stock_status") != "sold" or sold.get("stock_quantity") != 0 or sold_id in existing_ids:
        raise ValueError("Sold historical member must stay excluded")
    historical_ids = [one(p.get("listings")).get("external_id") for p in historical]
    if len(set(historical_ids)) != 9 or set(existing_ids) != set(historical_ids) - {sold_id}:
        raise ValueError("Existing capture omits or adds a registered device")
    for ad in existing:
        p = one([p for p in historical if one(p.get("listings")).get("external_id") == ad.findtext("Id")])
        listing = one(p.get("listings"))
        if (p.get("sku") not in eligible or listing.get("status") != "active"
                or listing.get("mapping_active") is not True or listing.get("mapping_confirmed") is not True
                or ad.findtext("Title") != listing.get("title_override")
                or ad.findtext("Description") != listing.get("description_override")
                or int(ad.findtext("Price")) != p["price"]
                or ad.findtext("Model") != p["model"]
                or ad.findtext("MemorySize") != one(p.get("device_details")).get("storage")
                or ad.findtext("Color") != avito_color(p["model"], p["color"])
                or ad.findtext("Akb") != str(percentage(one(p.get("device_details")).get("battery")))
                or [i.get("url") for i in ad.findall("./Images/Image")] != image_urls(p)):
            raise ValueError("Existing available ad differs from current catalog/channel")
    store = one([s for s in snapshot["stores"] if s["slug"] == "belgorod" and s["status"] == "published"])
    if not store.get("address"):
        raise ValueError("Missing published store")
    root = ET.Element("Ads", dict(existing.attrib))
    root.append(ET.Comment(" ISVOI OFFLINE ELEVEN-AD REVIEW; LIVE PUBLICATION NOT AUTHORIZED "))
    for ad in existing:
        root.append(deepcopy(ad))
    rows = []
    for confirmed in approval["entries"]:
        sku = confirmed["sku"]
        source = eligible.get(sku)
        p = one([p for p in products if p["sku"] == sku])
        d, inventory, listing = one(p.get("device_details")), one(p.get("inventory")), one(p.get("listings"))
        if (not source or source["external_id"] != NEW_IDS[sku] or NEW_IDS[sku] in historical_ids
                or listing.get("status") != "draft" or inventory.get("identity_status") != "matched"
                or source["price_source"] != "site" or p.get("stock_quantity") != 1
                or "photo_asset_shared_with_other_product" in source["warnings"]):
            raise ValueError("New device identity, draft channel, stock or gallery guard failed")
        attrs = confirmed.get("confirmed_phone_attributes") or {}
        expected = {"ScreenCondition": "Без дефектов", "BoxSealed": "Нет",
                    "CaseCondition": "Мелкие царапины" if sku == "т39" else "Без дефектов"}
        if (attrs != expected or confirmed.get("owner_facts_confirmed") is not True
                or confirmed.get("product_id") != source["product_id"]
                or confirmed.get("external_id") != source["external_id"]
                or confirmed.get("price_rub") != source["price_rub"]
                or confirmed.get("title_sha256") != digest(source["title_override"])
                or confirmed.get("description_sha256") != digest(source["description_override"])
                or confirmed.get("diagnostic_date") != d.get("diagnostic_date")
                or confirmed.get("battery_percent") != percentage(d.get("battery"))
                or confirmed.get("battery_cycles") != d.get("battery_cycles")
                or confirmed.get("grade") != d.get("grade")
                or confirmed.get("image_urls") != source["image_urls"]
                or p.get("completeness") != "Устройство, коробка, кабель"
                or p.get("warranty_text") != "Гарантия 90 дней"):
            raise ValueError("Approved text, physical facts, kit or photos changed")
        description = source["description_override"]
        if ((sku == "т39" and (d["grade"] != "B" or "мелких потертостей" not in description
                               or "точечных следов" not in description))
                or (sku == "т18" and (d["grade"] != "B" or "аккумулятора 88%" not in description))
                or (sku == "т20" and d["grade"] != "A")
                or re.search(r"уточн\w* наличи|цена.*(?:уточн|измен|курс)", description, re.I)):
            raise ValueError("Approved condition nuance or price/stock copy guard failed")
        model = p["model"]
        if model not in REFERENCE_MODELS:
            raise ValueError("Unsupported model in current batch")
        color = avito_color(model, p["color"])
        if not color:
            raise ValueError("Unmapped model color")
        scalar = {
            "Id": source["external_id"], "Category": "Телефоны", "GoodsType": "Мобильные телефоны",
            "Address": store["address"], "Title": source["title_override"], "Description": description,
            "Price": int(source["price_rub"]), "AdType": "Товар приобретен на продажу", "Condition": "Б/у",
            "Vendor": "Apple", "Model": model, "MemorySize": d["storage"], "Color": color,
            "RamSize": references["models"][model]["attributes"]["RamSize"],
            "Akb": percentage(d["battery"]), "DeviceFlaws": "Включается",
            "ScreenCondition": attrs["ScreenCondition"], "CaseCondition": attrs["CaseCondition"],
        }
        ad = ET.SubElement(root, "Ad")
        for key, value in scalar.items():
            ET.SubElement(ad, key).text = str(value)
        images = ET.SubElement(ad, "Images")
        for url in source["image_urls"]:
            ET.SubElement(images, "Image", {"url": url})
        rows.append({"sku": sku, "external_id": source["external_id"], "price": source["price_rub"],
                     "photos": len(source["image_urls"]), "case": attrs["CaseCondition"],
                     "description_sha256": digest(description), "copy_operator_approved": True})
    xml = ET.tostring(root, encoding="utf-8", xml_declaration=True) + b"\n"
    parsed, ids = parse_ads(xml)
    if (ids != existing_ids + list(NEW_IDS.values()) or sold_id in ids or len(ids) != 11
            or [ET.tostring(ad) for ad in list(parsed)[:8]] != [ET.tostring(ad) for ad in existing]):
        raise ValueError("Cumulative identity order or preserved ad subtrees changed")
    manifest = {
        "mode": "offline_eleven_available_ad_review", "source_captured_at": snapshot["captured_at"],
        "existing_feed_sha256": approval["existing_feed_sha256"], "xml_sha256": hashlib.sha256(xml).hexdigest(),
        "ads": 11, "photos": sum(len(ad.findall("./Images/Image")) for ad in parsed),
        "existing_ids": existing_ids, "new_ids": list(NEW_IDS.values()), "rows": rows,
        "historical_sold_id_excluded": sold_id, "historical_configured_ids_after_release": 12,
        "existing_ads_preserved": True, "copy_operator_approved": True,
        "official_xml_schema_validated": False, "dependent_catalog_combinations_verified": False,
        "publication_authorized": False, "ready_to_upload": False, "live_feed_expanded": False,
        "apply": False, "uploaded": False, "mapping_or_channel_records_changed": False,
        "omitted_optional_fields": ["Set", "BoxSealed", "SimConfig", "IMEI"],
        "pending": ["owner_avito_validator_acceptance", "separate_live_release_approval",
                    "batch_stability_decision", "fresh_backup_and_guarded_release_rehearsal"],
    }
    return xml, manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("snapshot", "public-preflight", "existing-feed", "approval", "model-reference", "output-dir"):
        parser.add_argument("--" + name, required=True)
    args = parser.parse_args()
    load = lambda p: json.loads(Path(p).read_text(encoding="utf-8-sig"))
    xml, manifest = build_review(load(args.snapshot), load(args.public_preflight),
        Path(args.existing_feed).read_bytes(), load(args.approval), load(args.model_reference))
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    target = out / ("ISVOI_Avito_ELEVEN_AD_REVIEW_" + date.fromisoformat(manifest["source_captured_at"][:10]).isoformat() + ".xml")
    target.write_bytes(xml)
    (out / "eleven-ad-review-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"file": str(target), "ads": manifest["ads"], "photos": manifest["photos"], "ready_to_upload": False}))


if __name__ == "__main__":
    main()
