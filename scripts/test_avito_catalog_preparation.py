"""Sanitized fixtures for whole-catalog audit and truthful balanced descriptions."""

from copy import deepcopy
import sys
from pathlib import Path
import unittest
from openpyxl import Workbook
from openpyxl.worksheet.datavalidation import DataValidation

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prepare_avito_catalog_workbook import PHONE_SHEET, apply_reference_evidence, assess, avito_color, balanced_copy, percentage, prepare, validate_template_choices
from avito_html_privacy import check_html_identifiers


def fixture():
    product = {
        "id": "iphone-fixture", "sku": "TEST-1", "status": "published", "content_status": "ready",
        "condition": "used", "category": {"slug": "smartphones"},
        "stock_status": "available", "stock_quantity": 1, "price": 40000,
        "model": "iPhone 14 Pro", "color": "Silver", "title": "iPhone 14 Pro 256 ГБ Silver",
        "completeness": "Устройство, коробка, кабель", "warranty_text": "Гарантия 90 дней",
        "listing_file": "00000000-0000-4000-8000-000000000001", "images": [],
        "inventory": [{"source_sku": "TEST-1", "quantity": 1, "retail_price": 40000, "identity_status": "matched", "eligibility_status": "eligible",
                       "authenticity_status": "verified", "review_override": True, "review_note_present": True,
                       "for_sale": True, "duplicate_serial": False, "open_issue_codes": [], "serial_present": True}],
        "offers": [{"location": "belgorod", "status": "published", "price": 40000,
                    "stock_status": "available", "stock_quantity": 1}],
        "device_details": [{"grade": "A", "storage": "256 ГБ", "battery": "98%", "battery_cycles": 100,
                            "diagnostic_date": "2026-08-10"}],
        "passports": [{"condition_note": "Нет замечаний по корпусу.", "condition_notes": [],
                       "repair": "Проверенные компоненты отмечены диагностикой как оригинальные.",
                       "story_facts": ["Данные удалены безопасно"],
                       "diagnostics_checklist": [{"text": "Экран и True Tone", "state": "ok"}]}],
        "reports": [{"status": "current", "public_file": "public-fixture", "provider": "NSYS Diagnostics",
                     "tested_at": "2026-08-10", "public_note": ""}],
        "listings": [{"external_id": "isvoi-test-1"}],
    }
    public = {"pages": [{"product_id": product["id"], "ok": True}],
              "certificates": [{"sku": product["sku"], "ok": True}],
              "images": {"products": [{"product_id": product["id"], "ok": True}]}}
    return product, public


class CatalogPreparationTests(unittest.TestCase):
    def test_desert_titanium_requires_model_specific_color_mapping(self):
        self.assertEqual(avito_color("iPhone 16 Pro Max", "Desert Titanium"), "золотистый")
        self.assertIsNone(avito_color("unreviewed-model", "Desert Titanium"))
        self.assertEqual(avito_color("unreviewed-model", "Cream"), "бежевый")
        self.assertEqual(avito_color("iPhone 15 Pro Max", "Natural Titanium"), "серый")
        self.assertEqual(avito_color("iPhone 14 Pro Max", "Silver"), "серебристый")

    def dictionary_fixture(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = PHONE_SHEET
        dictionary = workbook.create_sheet("dict")
        dictionary["A1"] = "8 ГБ"
        dictionary["A2"] = "6 ГБ"
        dictionary["B1"] = "Коробка"
        dictionary["B2"] = "Провод зарядки"
        for target, formula in (("W5:W100", "'dict'!$A$1:$A$2"), ("Y5:Y100", "'dict'!$B$1:$B$2")):
            rule = DataValidation(type="list", formula1=formula)
            rule.add(target)
            sheet.add_data_validation(rule)
        sheet["W5"] = "8 ГБ"
        sheet["Y5"] = "Коробка | Провод зарядки"
        return workbook

    def test_flat_dictionary_handles_documented_multivalued_kit(self):
        self.assertEqual(validate_template_choices(self.dictionary_fixture()), 2)

    def test_invalid_ram_or_unconfirmed_kit_is_rejected(self):
        for cell, value in (("W5", "7 ГБ"), ("Y5", "Коробка | Блок зарядки"), ("Y5", "Коробка | Коробка")):
            workbook = self.dictionary_fixture()
            workbook[PHONE_SHEET][cell] = value
            with self.subTest(cell=cell, value=value), self.assertRaises(ValueError):
                validate_template_choices(workbook)

    def reference_inputs(self):
        p, public = fixture()
        snapshot = {"captured_at": "2026-10-04", "products": [p],
                    "stores": [{"slug": "belgorod", "status": "published", "address": "Тестовый адрес"}]}
        reference = {"version": 1, "checked_on": "2026-10-04",
                     "scope": "model_hardware_reference_not_avito_catalog_validation", "models": {
                         p["model"]: {"attributes": {"RamSize": "6 ГБ"},
                                      "source_url": "https://www.ifixit.com/Teardown/fixture/1"}}}
        boxes = {"source": "owner_chat_confirmation", "confirmed_on": "2026-10-04",
                 "scope": "current_site_devices_used_and_open_boxes_only", "devices_condition": "used", "boxes_sealed": False}
        return snapshot, prepare(snapshot, public, {}), reference, boxes

    def test_model_ram_and_open_boxes_do_not_grant_publication(self):
        s, report, reference, boxes = self.reference_inputs()
        apply_reference_evidence(report, s, reference, boxes)
        entry = report["entries"][0]
        self.assertEqual(entry["model_reference_attributes"], {"RamSize": "6 ГБ"})
        self.assertEqual(entry["confirmed_phone_attributes"], {"BoxSealed": "Нет"})
        self.assertFalse(entry["ready_to_publish"])
        self.assertFalse(entry["copy_operator_approved"])
        self.assertEqual(s["products"][0]["device_details"][0]["storage"], "256 ГБ")
        self.assertNotIn("ScreenCondition", entry["confirmed_phone_attributes"])

    def test_unknown_model_ram_is_left_unfilled(self):
        s, report, reference, _ = self.reference_inputs()
        reference["models"] = {}
        apply_reference_evidence(report, s, reference)
        self.assertNotIn("model_reference_attributes", report["entries"][0])

    def test_reference_private_extra_fields_and_unsafe_source_rejected(self):
        s, report, reference, _ = self.reference_inputs()
        row = reference["models"][s["products"][0]["model"]]
        row["attributes"]["IMEI"] = "private"
        with self.assertRaises(ValueError):
            apply_reference_evidence(report, s, reference)
        del row["attributes"]["IMEI"]
        row["source_url"] = "https://www.ifixit.com@other.invalid/Teardown/fixture/1"
        with self.assertRaises(ValueError):
            apply_reference_evidence(report, s, reference)

    def test_future_reference_or_false_schema_claim_rejected(self):
        s, report, reference, _ = self.reference_inputs()
        reference["checked_on"] = "2026-10-05"
        with self.assertRaises(ValueError):
            apply_reference_evidence(report, s, reference)
        reference["checked_on"] = "2026-10-04"
        reference["scope"] = "avito_catalog_verified"
        with self.assertRaises(ValueError):
            apply_reference_evidence(report, s, reference)

    def test_open_box_confirmation_is_not_inferred_or_used_on_new_device(self):
        s, report, _, boxes = self.reference_inputs()
        boxes["boxes_sealed"] = None
        with self.assertRaises(ValueError):
            apply_reference_evidence(report, s, box_confirmation=boxes)
        boxes["boxes_sealed"] = False
        s["products"][0]["condition"] = "new"
        with self.assertRaises(ValueError):
            apply_reference_evidence(report, s, box_confirmation=boxes)

    def test_no_box_field_is_added_without_box_in_confirmed_kit(self):
        s, report, _, boxes = self.reference_inputs()
        s["products"][0]["completeness"] = "Устройство, кабель"
        apply_reference_evidence(report, s, box_confirmation=boxes)
        self.assertNotIn("confirmed_phone_attributes", report["entries"][0])

    def test_public_legal_identifier_is_not_mistaken_for_imei(self):
        legal = "123456789012345"
        self.assertTrue(check_html_identifiers("ОГРНИП " + legal, [], [legal])["ok"])

    def test_legal_allowlist_cannot_hide_a_known_private_identifier(self):
        identifier = "123456789012345"
        self.assertFalse(check_html_identifiers(identifier, [identifier], [identifier])["ok"])

    def test_unknown_imei_and_formatted_known_serial_are_blocked(self):
        self.assertFalse(check_html_identifiers("123456789012345", [])["ok"])
        self.assertFalse(check_html_identifiers("SN-ABC-12345", ["SNABC12345"])["ok"])

    def test_matched_candidate_still_not_publication_approval(self):
        product, public = fixture()
        snapshot = {"captured_at": "2026-10-04", "products": [product],
                    "stores": [{"slug": "belgorod", "status": "published", "address": "Тестовый адрес"}]}
        result = prepare(snapshot, public, {})
        self.assertEqual(result["catalog_candidate_count"], 1)
        self.assertFalse(result["ready_to_publish"])
        self.assertFalse(result["apply"])
        self.assertEqual(result["pilot_limit_unchanged"], 3)
        self.assertIn("official_catalog_fields_and_xml_qa_pending", result["entries"][0]["blockers"])

    def test_unmatched_is_not_silently_approved(self):
        p, public = fixture()
        p["inventory"][0]["identity_status"] = "unmatched"
        self.assertIn("inventory_identity_unmatched", assess(p, public)[0])

    def test_sold_snapshot_disagreement_is_visible(self):
        p, public = fixture()
        p.update(stock_status="sold", stock_quantity=0)
        p["offers"][0].update(stock_status="sold", stock_quantity=0)
        blockers, warnings = assess(p, public)
        self.assertIn("sold_or_unavailable", blockers)
        self.assertIn("sold_but_inventory_snapshot_positive", warnings)

    def test_multiple_inventory_links_are_blocked(self):
        p, public = fixture()
        p["inventory"].append(deepcopy(p["inventory"][0]))
        self.assertIn("inventory_link_count", assess(p, public)[0])

    def test_wrong_sku_link_is_blocked(self):
        p, public = fixture()
        p["inventory"][0]["source_sku"] = "OTHER-ITEM"
        self.assertIn("inventory_sku_mismatch", assess(p, public)[0])

    def test_new_device_not_described_as_used(self):
        p, public = fixture()
        p["condition"] = "new"
        self.assertIn("unsupported_device_condition", assess(p, public)[0])
        self.assertEqual(balanced_copy(p, "Тестовый адрес"), ("", ""))

    def test_notebook_not_inserted_into_phone_template(self):
        p, public = fixture()
        p["category"]["slug"] = "notebooks"
        self.assertIn("unsupported_phone_category", assess(p, public)[0])

    def test_duplicate_serial_is_blocked(self):
        p, public = fixture()
        p["inventory"][0]["duplicate_serial"] = True
        self.assertIn("inventory_sale_duplicate_or_issue", assess(p, public)[0])

    def test_manual_channel_price_is_preserved(self):
        p, public = fixture()
        p["listings"][0]["price_override"] = 42000
        snapshot = {"captured_at": "2026-10-04", "products": [p],
                    "stores": [{"slug": "belgorod", "status": "published", "address": "Тестовый адрес"}]}
        entry = prepare(snapshot, public, {})["entries"][0]
        self.assertEqual(entry["price_rub"], 42000)
        self.assertEqual(entry["price_source"], "channel_override")

    def test_zero_channel_override_is_not_replaced_with_site_price(self):
        p, public = fixture()
        p["listings"][0]["price_override"] = 0
        snapshot = {"captured_at": "2026-10-04", "products": [p],
                    "stores": [{"slug": "belgorod", "status": "published", "address": "Тестовый адрес"}]}
        entry = prepare(snapshot, public, {})["entries"][0]
        self.assertIn("invalid_channel_price", entry["blockers"])
        self.assertFalse(entry["catalog_checks_pass"])
        self.assertEqual(entry["price_rub"], 0)

    def test_same_model_is_not_itself_duplicate_inventory(self):
        p, public = fixture()
        second = deepcopy(p)
        second.update(id="second-device", sku="TEST-2")
        second["inventory"][0]["source_sku"] = "TEST-2"
        second["listing_file"] = "00000000-0000-4000-8000-000000000002"
        second["listings"][0]["external_id"] = "isvoi-test-2"
        public["pages"].append({"product_id": second["id"], "ok": True})
        public["certificates"].append({"sku": second["sku"], "ok": True})
        public["images"]["products"].append({"product_id": second["id"], "ok": True})
        snapshot = {"captured_at": "2026-10-04", "products": [p, second],
                    "stores": [{"slug": "belgorod", "status": "published", "address": "Тестовый адрес"}]}
        self.assertEqual(prepare(snapshot, public, {})["catalog_candidate_count"], 2)

    def test_failed_public_asset_blocks_candidate(self):
        p, public = fixture()
        public["images"]["products"][0]["ok"] = False
        self.assertIn("public_page_photo_or_certificate_failed", assess(p, public)[0])

    def test_diagnostic_date_mismatch_is_blocked(self):
        p, public = fixture()
        p["reports"][0]["tested_at"] = "2026-08-11"
        self.assertIn("diagnostic_date_mismatch", assess(p, public)[0])

    def test_samsung_does_not_receive_apple_claims(self):
        p, _ = fixture()
        p["model"] = "Galaxy S22 Ultra"
        p["passports"][0].update(repair="Отчёт NSYS не содержит отдельной проверки оригинальности компонентов.",
                                 diagnostics_checklist=[{"text": "Экран и мультитач", "state": "ok"}],
                                 story_facts=["FRP / ROOT / KNOX не обнаружены"])
        title, text = balanced_copy(p, "Тестовый адрес")
        self.assertTrue(title.startswith("Samsung"))
        self.assertNotIn("True Tone", text)
        self.assertNotIn("Face ID", text)
        self.assertNotIn("отмечены как оригинальные", text)

    def test_grade_b_reason_is_preserved(self):
        p, _ = fixture()
        p["device_details"][0]["grade"] = "B"
        p["passports"][0]["condition_note"] = "Грейд B из-за потертостей на боковых гранях."
        text = balanced_copy(p, "Тестовый адрес")[1]
        self.assertIn("потертостей на боковых гранях", text)
        self.assertNotIn("нет замечаний", text.lower())

    def test_headset_manual_check_is_separate_from_nsys(self):
        p, _ = fixture()
        p["passports"][0]["diagnostics_checklist"].append(
            {"text": "Гарнитура: работоспособность подтверждена отдельно", "state": "ok"})
        p["reports"][0]["public_note"] = "Гарнитура не подключалась к стенду NSYS."
        text = balanced_copy(p, "Тестовый адрес")[1]
        self.assertIn("не подключалась к стенду NSYS", text)
        self.assertIn("подтверждена отдельно", text)

    def test_unknown_battery_does_not_become_none_percent(self):
        p, _ = fixture()
        p["device_details"][0]["battery"] = None
        self.assertEqual(balanced_copy(p, "Тестовый адрес"), ("", ""))
        self.assertEqual(percentage(0), 0)
        self.assertIsNone(percentage("101%"))

    def test_old_approved_copy_not_reused_after_grade_change(self):
        p, public = fixture()
        title, text = balanced_copy(p, "Тестовый адрес")
        approved = {"copy_operator_approved": True, "entries": [
            {"sku": p["sku"], "external_id": "isvoi-test-1", "description_override": text}]}
        p["device_details"][0]["grade"] = "B"
        p["passports"][0]["condition_note"] = "Грейд B из-за потертостей."
        snapshot = {"captured_at": "2026-10-04", "products": [p],
                    "stores": [{"slug": "belgorod", "status": "published", "address": "Тестовый адрес"}]}
        result = prepare(snapshot, public, approved)
        self.assertFalse(result["entries"][0]["copy_operator_approved"])
        self.assertIn("потертостей", result["entries"][0]["description_override"])

    def test_new_exact_copy_approval_does_not_approve_publication(self):
        p, public = fixture()
        title, text = balanced_copy(p, "Тестовый адрес")
        approved = {"copy_operator_approved": True, "approval_scope": "description_copy_only", "entries": [
            {"sku": p["sku"], "external_id": "isvoi-test-1", "description_override": text}]}
        snapshot = {"captured_at": "2026-10-04", "products": [p],
                    "stores": [{"slug": "belgorod", "status": "published", "address": "Тестовый адрес"}]}
        result = prepare(snapshot, public, approved)
        self.assertTrue(result["entries"][0]["copy_operator_approved"])
        self.assertEqual(result["entries"][0]["description_override"], text)
        self.assertFalse(result["entries"][0]["ready_to_publish"])
        self.assertFalse(result["apply"])


if __name__ == "__main__":
    unittest.main()
