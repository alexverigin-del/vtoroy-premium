"""Pilot isolation, freshness, and narrowly scoped owner-confirmation fixtures."""

from copy import deepcopy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prepare_avito_pilot_workbook import select_pilot
from test_avito_catalog_preparation import fixture


def evidence():
    product, public = fixture()
    snapshot = {"captured_at": "2026-10-04T10:00:00+00:00", "products": [product],
                "stores": [{"slug": "belgorod", "status": "published", "address": "Тестовый адрес"}]}
    live = deepcopy(snapshot)
    live["captured_at"] = "2026-10-04T11:00:00+00:00"
    public["captured_at"] = snapshot["captured_at"]
    confirmation = {"source": "owner_chat_confirmation", "confirmed_on": "2026-10-04",
                    "scope": "current_condition_battery_and_completeness_only", "entries": [
                        {"sku": product["sku"], "external_id": product["listings"][0]["external_id"],
                         "screen_condition": "Без дефектов", "case_condition": "Без дефектов",
                         "completeness": product["completeness"], "battery": "98%", "battery_cycles": 100}]}
    return snapshot, live, public, confirmation


class PilotPreparationTests(unittest.TestCase):
    def test_selection_does_not_grant_publication_or_new_copy_approval(self):
        s, live, public, _ = evidence()
        report = select_pilot(s, live, public, {}, ["TEST-1"])
        self.assertEqual(len(report["entries"]), 1)
        self.assertFalse(report["apply"])
        self.assertFalse(report["ready_to_publish"])
        self.assertFalse(report["feed_activated"])
        self.assertFalse(report["live_allowlist_changed"])
        self.assertFalse(report["entries"][0]["copy_operator_approved"])
        self.assertFalse(report["public_http_checks_repeated"])

    def test_invalid_selection_size_duplicate_and_unknown_sku(self):
        s, live, public, _ = evidence()
        for skus in ([], ["TEST-1"] * 2, ["a", "b", "c", "d"], ["unknown"]):
            with self.subTest(skus=skus), self.assertRaises(ValueError):
                select_pilot(s, live, public, {}, skus)

    def test_changed_stock_or_photos_invalidates_reused_public_evidence(self):
        s, live, public, _ = evidence()
        for field, value in (("stock_quantity", 0), ("listing_file", "different-photo")):
            changed = deepcopy(live)
            changed["products"][0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                select_pilot(s, changed, public, {}, ["TEST-1"])

    def test_only_empty_attributes_representation_is_normalized(self):
        s, live, public, _ = evidence()
        s["products"][0]["listings"][0]["attributes"] = None
        live["products"][0]["listings"][0]["attributes"] = {}
        self.assertTrue(select_pilot(s, live, public, {}, ["TEST-1"])["unchanged_pilot_facts_verified"])
        live["products"][0]["listings"][0]["attributes"] = {"RamSize": "6 ГБ"}
        with self.assertRaises(ValueError):
            select_pilot(s, live, public, {}, ["TEST-1"])

    def test_stale_or_wrong_timestamp_evidence_is_rejected(self):
        s, live, public, _ = evidence()
        public["captured_at"] = "2026-10-03"
        with self.assertRaises(ValueError):
            select_pilot(s, live, public, {}, ["TEST-1"])
        public["captured_at"] = s["captured_at"]
        live["captured_at"] = "2026-10-03T11:00:00+00:00"
        with self.assertRaises(ValueError):
            select_pilot(s, live, public, {}, ["TEST-1"])

    def test_unmatched_is_rejected_not_relabelled(self):
        s, live, public, _ = evidence()
        s["products"][0]["inventory"][0]["identity_status"] = "unmatched"
        live["products"][0]["inventory"][0]["identity_status"] = "unmatched"
        with self.assertRaises(ValueError):
            select_pilot(s, live, public, {}, ["TEST-1"])
        self.assertEqual(live["products"][0]["inventory"][0]["identity_status"], "unmatched")

    def test_duplicate_outside_pilot_still_blocks_selected_external_id(self):
        s, live, public, _ = evidence()
        duplicate = deepcopy(live["products"][0])
        duplicate.update(id="different-product", sku="OTHER", status="draft")
        live["products"].append(duplicate)
        with self.assertRaises(ValueError):
            select_pilot(s, live, public, {}, ["TEST-1"])

    def test_owner_confirmation_fills_only_confirmed_conditions(self):
        s, live, public, confirmation = evidence()
        report = select_pilot(s, live, public, {}, ["TEST-1"], confirmation)
        self.assertTrue(report["current_state_owner_confirmed"])
        self.assertFalse(report["physical_recheck_performed_by_agent"])
        self.assertEqual(report["entries"][0]["confirmed_phone_attributes"],
                         {"ScreenCondition": "Без дефектов", "CaseCondition": "Без дефектов"})
        self.assertFalse(report["entries"][0]["copy_operator_approved"])
        self.assertFalse(report["historical_avito_listing_reconciled"])
        self.assertEqual(live["products"][0]["device_details"][0]["diagnostic_date"], "2026-08-10")

    def test_confirmation_for_other_device_date_or_battery_is_rejected(self):
        s, live, public, confirmation = evidence()
        for field, value in (("sku", "OTHER"), ("external_id", "another-id"), ("battery", "100%"),
                             ("completeness", "Устройство, блок зарядки")):
            changed = deepcopy(confirmation)
            changed["entries"][0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                select_pilot(s, live, public, {}, ["TEST-1"], changed)
        confirmation["confirmed_on"] = "2026-10-03"
        with self.assertRaises(ValueError):
            select_pilot(s, live, public, {}, ["TEST-1"], confirmation)


if __name__ == "__main__":
    unittest.main()
