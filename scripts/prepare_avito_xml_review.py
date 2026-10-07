"""Write an offline XML schema-review example; never publish or enable a feed."""

import argparse
from datetime import date
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

from prepare_avito_catalog_workbook import avito_color, image_urls, one, percentage, prepare


def build_review(pilot, snapshot, public, approved):
    if (pilot.get("selection_scope") != "pilot_preparation_only"
            or pilot.get("apply") is not False or pilot.get("ready_to_publish") is not False
            or pilot.get("captured_at") != snapshot.get("captured_at")
            or pilot.get("public_evidence_captured_at") != public.get("captured_at")
            or not pilot.get("unchanged_pilot_facts_verified")
            or snapshot.get("private_identifier_redactions")):
        raise ValueError("Missing safe pilot/source evidence")
    entries = pilot.get("entries") or []
    if (not 1 <= len(entries) <= 3 or len({e["sku"] for e in entries}) != len(entries)
            or [e["sku"] for e in entries] != pilot.get("selected_skus")
            or [e["external_id"] for e in entries] != pilot.get("proposed_pilot_external_ids")):
        raise ValueError("XML selection differs from explicit 1-3 SKU pilot")
    store = one([s for s in snapshot["stores"] if s["slug"] == "belgorod" and s["status"] == "published"])
    if not store.get("address"):
        raise ValueError("Missing published store")
    # Re-run catalog guards globally. Mapping flags and channel statuses are
    # never invented or changed: this output is serialization for schema QA only.
    refreshed = prepare(snapshot, public, approved)
    eligible = {e["sku"]: e for e in refreshed["entries"] if e["catalog_checks_pass"]}
    root = ET.Element("Ads", {"formatVersion": "3", "target": "Avito.ru"})
    root.append(ET.Comment(" ISVOI OFFLINE SCHEMA REVIEW ONLY; NOT APPROVED FOR UPLOAD "))
    rows = []
    ids = set()
    for entry in entries:
        source = eligible.get(entry["sku"])
        if (not source or source["product_id"] != entry["product_id"]
                or source["external_id"] != entry["external_id"]
                or source["price_rub"] != entry["price_rub"]
                or source["description_override"] != entry["description_override"]
                or source["title_override"] != entry["title_override"]
                or source["copy_operator_approved"] != entry["copy_operator_approved"]):
            raise ValueError("Pilot copy/price/identity changed or catalog guard failed")
        product = one([p for p in snapshot["products"] if p["id"] == entry["product_id"]])
        details = one(product.get("device_details"))
        inventory = one(product.get("inventory"))
        identity = entry["external_id"]
        if (not re.fullmatch(r"isvoi-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", identity)
                or identity in ids or inventory.get("identity_status") != "matched"):
            raise ValueError("Duplicate/invalid ID or unmatched pilot device")
        ids.add(identity)
        if not pilot.get("current_state_owner_confirmed"):
            raise ValueError("Pilot physical state requires owner confirmation")
        attrs = entry.get("confirmed_phone_attributes") or {}
        if attrs.get("ScreenCondition") != "Без дефектов" or attrs.get("CaseCondition") != "Без дефектов":
            raise ValueError("Screen/case facts are not confirmed")
        if not product["model"].startswith("iPhone"):
            raise ValueError("This minimal schema example is limited to the current Apple pilot")
        ram = entry.get("model_reference_attributes", {}).get("RamSize")
        reference = (pilot.get("model_reference") or {}).get("models", {}).get(product["model"], {})
        if ram not in ("6 ГБ", "8 ГБ") or reference.get("attributes", {}).get("RamSize") != ram:
            raise ValueError("Missing model RAM provenance")
        photos = image_urls(product)
        if photos != entry["image_urls"] or not 1 <= len(photos) <= 10:
            raise ValueError("Photo set/order changed")
        title, description, price = entry["title_override"], entry["description_override"], entry["price_rub"]
        if (not title or len(title) > 50 or not description or len(description) > 7500
                or type(price) not in (int, float) or price <= 0 or price != int(price)
                or re.search(r"[<>]|[\x00-\x08\x0b\x0c\x0e-\x1f]|\d{15}|\[redacted", title + description)
                or re.search(r"\b(?:IMEI|SERIAL|S/N)\s*[:#]?\s*[A-Z0-9]{8,}\b", title + description, re.I)):
            raise ValueError("Invalid public copy or price")
        battery = percentage(details.get("battery"))
        if battery is None:
            raise ValueError("Missing dated Apple battery reading")
        scalar = {
            "Id": identity, "Category": "Телефоны", "GoodsType": "Мобильные телефоны",
            "Address": store["address"], "Title": title, "Description": description,
            "Price": int(price), "AdType": "Товар приобретен на продажу", "Condition": "Б/у",
            "Vendor": "Apple", "Model": product["model"], "MemorySize": details["storage"],
            "Color": avito_color(product["model"], product["color"]), "RamSize": ram, "Akb": battery,
            "DeviceFlaws": "Включается", "ScreenCondition": attrs["ScreenCondition"],
            "CaseCondition": attrs["CaseCondition"],
        }
        if not scalar["Color"]:
            raise ValueError("Unmapped pilot color")
        ad = ET.SubElement(root, "Ad")
        for key, value in scalar.items():
            ET.SubElement(ad, key).text = str(value)
        images = ET.SubElement(ad, "Images")
        for url in photos:
            ET.SubElement(images, "Image", {"url": url})
        rows.append({"sku": entry["sku"], "external_id": identity, "photos": len(photos),
                     "copy_operator_approved": entry["copy_operator_approved"],
                     "source_channel_status": one(product.get("listings")).get("status"),
                     "diagnostic_date": details["diagnostic_date"]})
    ET.indent(root, space="  ")
    xml = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    parsed = ET.fromstring(xml)
    if [ad.findtext("Id") for ad in parsed.findall("Ad")] != [e["external_id"] for e in entries]:
        raise ValueError("XML round-trip identity mismatch")
    forbidden = {"Set", "BoxSealed", "IMEI", "Serial", "AvitoId", "ContactPhone", "PurchasePrice", "Margin"}
    if any(element.tag in forbidden for element in parsed.iter()) or re.search(rb"\d{15}", xml):
        raise ValueError("Forbidden field/identifier in XML example")
    manifest = {
        "source_captured_at": snapshot["captured_at"], "mode": "offline_schema_review_only",
        "xml_well_formed": True, "official_xml_schema_validated": False,
        "dependent_catalog_combinations_verified": False, "account_ingestion_verified": False,
        "ready_to_upload": False, "apply": False, "feed_enabled": False, "uploaded": False,
        "mapping_or_channel_records_changed": False, "historical_listing_reconciled": False,
        "rows": rows,
        "omitted_optional_fields": {
            "Set": "Optional in category API; checkbox XML structure unconfirmed. Confirmed kit stays in Description.",
            "BoxSealed": "Depends on Set; omitted together with Set. Open-box evidence remains in XLSX.",
            "SimConfig": "Regional SIM configuration not confirmed; optional field omitted.",
            "IMEI": "Optional private identifier; always omitted.",
        },
        "pending": ["dependent_model_memory_color_ram_catalog_qa", "official_xml_and_account_qa",
                    "historical_avito_listing_association", "mapping_drafts_and_separate_activation_approval"],
    }
    if any(not row["copy_operator_approved"] for row in rows):
        manifest["pending"].append("new_device_copy_approval")
    return xml, manifest


def main():
    parser = argparse.ArgumentParser()
    for name in ("pilot-review", "snapshot", "public-preflight", "approved-copy", "output-dir"):
        parser.add_argument("--" + name, required=True)
    args = parser.parse_args()
    load = lambda path: json.loads(Path(path).read_text(encoding="utf-8-sig"))
    xml, manifest = build_review(load(args.pilot_review), load(args.snapshot), load(args.public_preflight), load(args.approved_copy))
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    day = date.fromisoformat(manifest["source_captured_at"][:10]).isoformat()
    target = out / f"ISVOI_Avito_SCHEMA_REVIEW_{day}.xml"
    target.write_bytes(xml + b"\n")
    manifest["xml_sha256"] = hashlib.sha256(target.read_bytes()).hexdigest()
    (out / "xml-review-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"file": str(target), "rows": len(manifest["rows"]), "ready_to_upload": False}))


if __name__ == "__main__":
    main()
