"""Offline XML examples cannot stand in for mapping/account/publication approval."""

from copy import deepcopy
from pathlib import Path
import sys
import unittest
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prepare_avito_catalog_workbook import apply_reference_evidence
from prepare_avito_pilot_workbook import select_pilot
from prepare_avito_xml_review import build_review
from test_avito_pilot_preparation import evidence


def xml_evidence():
    previous, snapshot, public, confirmation = evidence()
    for data in (previous, snapshot):
        data["products"][0]["listings"][0]["external_id"] = "isvoi-00000000-0000-4000-8000-000000000001"
        data["products"][0]["listings"][0]["status"] = "draft"
        data["products"][0]["listings"][0]["mapping_confirmed"] = False
    confirmation["entries"][0]["external_id"] = snapshot["products"][0]["listings"][0]["external_id"]
    pilot = select_pilot(previous, snapshot, public, {}, ["TEST-1"], confirmation)
    reference = {"version": 1, "checked_on": "2026-10-04",
                 "scope": "model_hardware_reference_not_avito_catalog_validation", "models": {
                     "iPhone 14 Pro": {"attributes": {"RamSize": "6 ГБ"},
                                       "source_url": "https://www.ifixit.com/Teardown/fixture/1"}}}
    apply_reference_evidence(pilot, snapshot, reference)
    return pilot, snapshot, public


class XmlReviewTests(unittest.TestCase):
    def test_desert_titanium_color_candidate_does_not_grant_avito_validation(self):
        pilot, snapshot, public = xml_evidence()
        snapshot["products"][0].update(model="iPhone 16 Pro Max", color="Desert Titanium")
        reference = pilot["model_reference"]["models"].pop("iPhone 14 Pro")
        reference["attributes"]["RamSize"] = "8 ГБ"
        pilot["model_reference"]["models"]["iPhone 16 Pro Max"] = reference
        previous = deepcopy(snapshot)
        previous["captured_at"] = public["captured_at"]
        pilot["entries"] = select_pilot(previous, snapshot, public, {}, ["TEST-1"], pilot["owner_confirmation"])["entries"]
        pilot["entries"][0]["model_reference_attributes"] = {"RamSize": "8 ГБ"}
        xml, manifest = build_review(pilot, snapshot, public, {})
        self.assertEqual(ET.fromstring(xml).findtext("Ad/Color"), "золотистый")
        self.assertIn("Desert Titanium", ET.fromstring(xml).findtext("Ad/Description"))
        self.assertFalse(manifest["dependent_catalog_combinations_verified"])
        self.assertFalse(manifest["ready_to_upload"])

    def test_example_roundtrip_does_not_confirm_mapping_or_publication(self):
        pilot, snapshot, public = xml_evidence()
        untouched = deepcopy(snapshot)
        xml, manifest = build_review(pilot, snapshot, public, {})
        self.assertEqual(snapshot, untouched)
        self.assertIn(b"NOT APPROVED FOR UPLOAD", xml)
        self.assertFalse(manifest["ready_to_upload"])
        self.assertFalse(manifest["official_xml_schema_validated"])
        self.assertFalse(manifest["historical_listing_reconciled"])
        self.assertEqual(manifest["rows"][0]["source_channel_status"], "draft")
        root = ET.fromstring(xml)
        self.assertEqual(root.findtext("Ad/Condition"), "Б/у")
        self.assertEqual(root.findtext("Ad/RamSize"), "6 ГБ")
        self.assertIsNone(root.find("Ad/Set"))
        self.assertIsNone(root.find("Ad/BoxSealed"))
        self.assertIsNone(root.find("Ad/IMEI"))
        self.assertEqual(root.findtext("Ad/Price"), "40000")

    def test_source_identity_stock_or_operator_approval_cannot_be_faked(self):
        pilot, snapshot, public = xml_evidence()
        for action in ("identity", "stock", "copy_approval"):
            p, s = deepcopy(pilot), deepcopy(snapshot)
            if action == "identity":
                s["products"][0]["inventory"][0]["identity_status"] = "unmatched"
            elif action == "stock":
                s["products"][0]["stock_quantity"] = 0
            else:
                p["entries"][0]["copy_operator_approved"] = True
            with self.subTest(action=action), self.assertRaises(ValueError):
                build_review(p, s, public, {})

    def test_modified_copy_price_or_photo_set_is_rejected(self):
        pilot, snapshot, public = xml_evidence()
        for key, value in (("price_rub", 1), ("description_override", "IMEI: 123456789012345"),
                           ("image_urls", ["https://other.invalid/image.jpg"])):
            p = deepcopy(pilot)
            p["entries"][0][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                build_review(p, snapshot, public, {})

    def test_unconfirmed_physical_state_or_ram_is_rejected(self):
        pilot, snapshot, public = xml_evidence()
        pilot["current_state_owner_confirmed"] = False
        with self.assertRaises(ValueError):
            build_review(pilot, snapshot, public, {})
        pilot["current_state_owner_confirmed"] = True
        pilot["entries"][0]["model_reference_attributes"]["RamSize"] = "8 ГБ"
        with self.assertRaises(ValueError):
            build_review(pilot, snapshot, public, {})

    def test_wrong_source_timestamp_or_expanded_selection_is_rejected(self):
        pilot, snapshot, public = xml_evidence()
        for modify in ("timestamp", "selection"):
            p = deepcopy(pilot)
            if modify == "timestamp":
                p["captured_at"] = "2026-10-03"
            else:
                p["entries"] *= 4
            with self.subTest(modify=modify), self.assertRaises(ValueError):
                build_review(p, snapshot, public, {})


if __name__ == "__main__":
    unittest.main()
