"""Regression checks for offline cumulative XML; no network or CMS writes."""

from copy import deepcopy
import hashlib
import unittest
import xml.etree.ElementTree as ET

from prepare_avito_expansion_review import build_expansion, combine_review
from prepare_avito_xml_review import build_review
from prepare_avito_pilot_workbook import select_pilot
from test_avito_xml_review import xml_evidence


def fixture():
    pilot, snapshot, public = xml_evidence()
    sample, _ = build_review(pilot, snapshot, public, {})
    root = ET.fromstring(sample)
    ad = root.find("Ad")
    root.clear()
    root.attrib.update(formatVersion="3", target="Avito.ru")
    for index in range(2, 5):
        cloned = deepcopy(ad)
        cloned.find("Id").text = f"isvoi-00000000-0000-4000-8000-{index:012}"
        root.append(cloned)
    existing = ET.tostring(root)
    ids = [ad.findtext("Id") for ad in root]
    new = ET.fromstring(sample)
    ad = new.find("Ad")
    for index in range(5, 7):
        cloned = deepcopy(ad)
        cloned.find("Id").text = f"isvoi-00000000-0000-4000-8000-{index:012}"
        new.append(cloned)
    return existing, ET.tostring(new), ids, hashlib.sha256(existing).hexdigest()


class ExpansionTests(unittest.TestCase):
    def test_guarded_six_ad_builder_repeats_catalog_checks_without_writes(self):
        old, _, ids, digest = fixture()
        original, snapshot, public = xml_evidence()
        product = snapshot["products"][0]
        snapshot["products"] = []
        public["pages"], public["certificates"], public["images"]["products"] = [], [], []
        owner = deepcopy(original["owner_confirmation"])
        owner["entries"] = []
        for index in (1, 5, 6):
            row = deepcopy(product)
            row["id"], row["sku"] = f"product-{index}", f"TEST-{index}"
            row["listing_file"] = f"00000000-0000-4000-8000-{index:012}"
            row["listings"][0]["external_id"] = "isvoi-" + row["listing_file"]
            row["inventory"][0]["source_sku"] = row["sku"]
            snapshot["products"].append(row)
            public["pages"].append({"product_id": row["id"], "ok": True})
            public["certificates"].append({"sku": row["sku"], "ok": True})
            public["images"]["products"].append({"product_id": row["id"], "ok": True})
            confirmation = deepcopy(original["owner_confirmation"]["entries"][0])
            confirmation.update(sku=row["sku"], external_id=row["listings"][0]["external_id"])
            owner["entries"].append(confirmation)
        previous = deepcopy(snapshot)
        previous["captured_at"] = public["captured_at"]
        pilot = select_pilot(previous, snapshot, public, {}, [p["sku"] for p in snapshot["products"]], owner)
        pilot["model_reference"] = original["model_reference"]
        for entry in pilot["entries"]:
            entry["model_reference_attributes"] = {"RamSize": "6 ГБ"}
        untouched = deepcopy(snapshot)
        xml, manifest = build_expansion(old, ids, digest, pilot, snapshot, public, {})
        self.assertEqual(len(ET.fromstring(xml)), 6)
        self.assertEqual(snapshot, untouched)
        self.assertIn("new_device_copy_approval", manifest["pending"])
        self.assertEqual([row["source_channel_status"] for row in manifest["new_batch"]["rows"]], ["draft"] * 3)
        snapshot["products"][2]["stock_quantity"] = 0
        with self.assertRaises(ValueError):
            build_expansion(old, ids, digest, pilot, snapshot, public, {})

    def test_six_ads_preserve_existing_subtrees(self):
        old, new, ids, digest = fixture()
        xml, manifest = combine_review(old, new, ids, digest)
        self.assertEqual(len(ET.fromstring(xml)), 6)
        self.assertEqual([ET.tostring(ad) for ad in list(ET.fromstring(xml))[:3]],
                         [ET.tostring(ad) for ad in ET.fromstring(old)])
        self.assertEqual(manifest["allowed_ids"][:3], ids)
        self.assertTrue(manifest["existing_ads_preserved"])
        self.assertFalse(manifest["ready_to_upload"])
        self.assertFalse(manifest["live_feed_expanded"])

    def test_changed_capture_or_roster_rejected(self):
        old, new, ids, digest = fixture()
        for capture, roster in ((old + b"\n", ids), (old, ids[::-1]), (old, ids[:2])):
            with self.assertRaises(ValueError):
                combine_review(capture, new, roster, digest)

    def test_overlap_duplicate_seventh_and_private_fields_rejected(self):
        old, new, ids, digest = fixture()
        for action in ("overlap", "duplicate", "seventh", "private", "unsafe_photo"):
            root = ET.fromstring(new)
            if action == "overlap":
                root[0].find("Id").text = ids[0]
            elif action == "duplicate":
                root[1].find("Id").text = root[0].findtext("Id")
            elif action == "seventh":
                extra = deepcopy(root[0])
                extra.find("Id").text = "isvoi-00000000-0000-4000-8000-000000000007"
                root.append(extra)
            elif action == "private":
                ET.SubElement(root[0], "PurchasePrice").text = "100"
            else:
                root[0].find("Images/Image").set("url", "https://other.invalid/photo.jpg")
            with self.subTest(action=action), self.assertRaises(ValueError):
                combine_review(old, ET.tostring(root), ids, digest)

    def test_guarded_builder_rejects_missing_batch_and_sold_product(self):
        old, _, ids, digest = fixture()
        pilot, snapshot, public = xml_evidence()
        with self.assertRaises(ValueError):
            build_expansion(old, ids, digest, pilot, snapshot, public, {})
        snapshot["products"][0]["stock_quantity"] = 0
        with self.assertRaises(ValueError):
            build_expansion(old, ids, digest, pilot, snapshot, public, {})


if __name__ == "__main__":
    unittest.main()
