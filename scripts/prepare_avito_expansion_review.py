"""Append a guarded offline batch to an exact captured three-ad live feed."""

import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET



SCALARS = {
    "Id", "Category", "GoodsType", "Address", "Title", "Description", "Price",
    "AdType", "Condition", "Vendor", "Model", "MemorySize", "Color", "RamSize",
    "Akb", "DeviceFlaws", "ScreenCondition", "CaseCondition",
}


def parse_ads(xml):
    if re.search(rb"<!DOCTYPE|<!ENTITY", xml, re.I):
        raise ValueError("XML entities are not accepted")
    root = ET.fromstring(xml)
    if root.tag != "Ads" or root.attrib != {"formatVersion": "3", "target": "Avito.ru"}:
        raise ValueError("Unexpected Avito XML format")
    ads = list(root)
    ids = []
    for ad in ads:
        tags = [child.tag for child in ad]
        if (ad.tag != "Ad" or ad.attrib or len(tags) != len(set(tags))
                or set(tags) != SCALARS | {"Images"}):
            raise ValueError("Unexpected, private or duplicate XML field")
        identity = ad.findtext("Id") or ""
        if not re.fullmatch(r"isvoi-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", identity):
            raise ValueError("Invalid stable XML ID")
        ids.append(identity)
        for child in ad:
            if child.tag in SCALARS and (child.attrib or list(child) or not child.text):
                raise ValueError("Invalid scalar field")
        if (ad.findtext("Category") != "Телефоны" or ad.findtext("Condition") != "Б/у"
                or ad.findtext("GoodsType") != "Мобильные телефоны"
                or not re.fullmatch(r"[1-9][0-9]*", ad.findtext("Price") or "")):
            raise ValueError("Unexpected category, condition or price")
        images = ad.find("Images")
        if images.attrib or not 1 <= len(images) <= 10:
            raise ValueError("Missing or excessive photos")
        urls = []
        for image in images:
            url = image.get("url", "")
            parsed = urlsplit(url)
            if (image.tag != "Image" or set(image.attrib) != {"url"} or list(image)
                    or parsed.scheme != "https" or parsed.hostname != "api.isvoi.ru"
                    or parsed.username or parsed.password or parsed.fragment
                    or parsed.port not in (None, 443)
                    or not re.fullmatch(r"/assets/[0-9a-f-]{36}", parsed.path)
                    or parsed.query != "width=1600&height=1600&fit=inside&format=jpg&quality=90"):
                raise ValueError("Unexpected public JPEG URL")
            urls.append(url)
        if len(set(urls)) != len(urls):
            raise ValueError("Duplicate photo")
    if len(set(ids)) != len(ids) or re.search(rb"\d{15}", xml):
        raise ValueError("Duplicate ID or private identifier")
    return root, ids


def combine_review(existing_xml, new_xml, existing_ids, expected_sha256):
    if hashlib.sha256(existing_xml).hexdigest() != expected_sha256:
        raise ValueError("Existing feed changed; refresh and review the capture")
    existing, old_ids = parse_ads(existing_xml)
    incoming, new_ids = parse_ads(new_xml)
    if len(existing_ids) != 3 or len(set(existing_ids)) != 3 or old_ids != existing_ids:
        raise ValueError("Capture differs from explicit existing three-ID roster/order")
    if len(new_ids) != 3 or set(old_ids) & set(new_ids):
        raise ValueError("Expansion must append three distinct new IDs")
    root = ET.Element("Ads", dict(existing.attrib))
    root.append(ET.Comment(" ISVOI OFFLINE SIX-AD REVIEW; NOT APPROVED FOR UPLOAD "))
    for ad in [*existing, *incoming]:
        root.append(deepcopy(ad))
    xml = ET.tostring(root, encoding="utf-8", xml_declaration=True) + b"\n"
    parsed, ids = parse_ads(xml)
    # Do not re-indent: whitespace inside the existing ad subtrees is evidence.
    if ([ET.tostring(ad) for ad in list(parsed)[:3]] != [ET.tostring(ad) for ad in existing]
            or ids != old_ids + new_ids):
        raise ValueError("Existing ads or cumulative ID order changed")
    return xml, {
        "mode": "offline_cumulative_six_ad_review", "apply": False,
        "ready_to_upload": False, "live_feed_expanded": False,
        "existing_feed_sha256": expected_sha256, "existing_ads_preserved": True,
        "existing_ids": old_ids, "new_ids": new_ids, "allowed_ids": ids,
        "official_xml_schema_validated": False, "stability_72h_confirmed": False,
        "mapping_or_channel_records_changed": False,
        "xml_sha256": hashlib.sha256(xml).hexdigest(),
    }


def build_expansion(existing_xml, existing_ids, expected_sha256, pilot, snapshot, public, approved):
    from prepare_avito_xml_review import build_review
    new_xml, batch_manifest = build_review(pilot, snapshot, public, approved)
    xml, manifest = combine_review(existing_xml, new_xml, existing_ids, expected_sha256)
    manifest.update(
        source_captured_at=snapshot["captured_at"], new_batch=batch_manifest,
        pending=["validate_cumulative_six_ad_xml_in_avito", "72h_stability_window",
                 "fresh_stock_and_live_feed_recheck", "backup_and_separate_live_release_approval",
                 "placement_cost_confirmation_if_extra"],
    )
    if any(not row["copy_operator_approved"] for row in batch_manifest["rows"]):
        manifest["pending"].append("new_device_copy_approval")
    return xml, manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("existing-feed", "existing-sha256", "pilot-review", "snapshot",
                 "public-preflight", "approved-copy", "output-dir"):
        parser.add_argument("--" + name, required=True)
    parser.add_argument("--existing-id", action="append", required=True)
    args = parser.parse_args()
    load = lambda path: json.loads(Path(path).read_text(encoding="utf-8-sig"))
    xml, manifest = build_expansion(
        Path(args.existing_feed).read_bytes(), args.existing_id, args.existing_sha256,
        load(args.pilot_review), load(args.snapshot), load(args.public_preflight), load(args.approved_copy),
    )
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    target = out / f"ISVOI_Avito_SIX_AD_REVIEW_{manifest['source_captured_at'][:10]}.xml"
    target.write_bytes(xml)
    (out / "six-ad-review-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8",
    )
    print(json.dumps({"file": str(target), "ads": 6, "ready_to_upload": False}))


if __name__ == "__main__":
    main()
